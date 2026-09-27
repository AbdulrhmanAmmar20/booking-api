import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SlotDto } from './slot.dto';

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A slot is available when it has no active booking. */
  async listAvailable(): Promise<SlotDto[]> {
    const slots = await this.prisma.slot.findMany({
      where: { bookings: { none: { status: 'active' } } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: { id: true, startsAt: true, endsAt: true },
    });
    return slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() }));
  }
}
