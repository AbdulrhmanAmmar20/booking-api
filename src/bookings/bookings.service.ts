import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { SlotEventsGateway } from '../events/slot-events.gateway';
import { Prisma, type Booking } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingDto, BookingStatusDto, CreateBookingDto } from './booking.dto';

/** Postgres errors surfaced by Prisma. */
const UNIQUE_VIOLATION = 'P2002'; // bookings_one_active_per_slot -> slot already has an active booking
const FOREIGN_KEY_VIOLATION = 'P2003'; // bookings.slot_id -> slot does not exist

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SlotEventsGateway,
  ) {}

  /**
   * Conflict prevention lives in the database, not in application code: a partial unique index
   * (`UNIQUE (slot_id) WHERE status = 'active'`) guarantees at most one active booking per slot.
   * We simply attempt the INSERT; of N concurrent inserts for the same slot exactly one commits and
   * the rest fail with a unique violation -> 409. No read-then-write window exists to race on.
   */
  async create(input: CreateBookingDto): Promise<BookingDto> {
    let booking: Booking;
    try {
      booking = await this.prisma.booking.create({
        data: {
          slotId: input.slotId.toLowerCase(),
          customerName: input.customerName,
          customerEmail: input.customerEmail,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === UNIQUE_VIOLATION) {
          throw new ApiError('SLOT_UNAVAILABLE', 'This slot already has an active booking.');
        }
        if (err.code === FOREIGN_KEY_VIOLATION) {
          throw new ApiError('SLOT_NOT_FOUND', 'Slot not found.');
        }
      }
      throw err;
    }

    // Single-statement INSERT is auto-committed once it resolves, so it's safe to broadcast now.
    this.events.slotBooked(booking.slotId, booking.id);
    return toDto(booking);
  }

  /**
   * Idempotent cancel. The conditional UPDATE (`WHERE id = ? AND status = 'active'`) is atomic, so
   * only the request that actually flips the row sees it returned - that one (and only that one)
   * emits `slot.released`. Repeat cancels return the stored booking unchanged with no event.
   * Because we match on booking id, cancelling an old booking can never touch a newer active
   * booking on the same slot.
   */
  async cancel(bookingId: string): Promise<BookingDto> {
    const [cancelled] = await this.prisma.booking.updateManyAndReturn({
      where: { id: bookingId, status: 'active' },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    if (cancelled) {
      this.events.slotReleased(cancelled.slotId, cancelled.id);
      return toDto(cancelled);
    }

    const existing = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!existing) {
      throw new ApiError('BOOKING_NOT_FOUND', 'Booking not found.');
    }
    return toDto(existing);
  }
}

function toDto(b: Booking): BookingDto {
  return {
    id: b.id,
    slotId: b.slotId,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    status: b.status as BookingStatusDto,
  };
}
