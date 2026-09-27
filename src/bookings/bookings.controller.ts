import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '../common/error-response.dto';
import { UUID_PATTERN, UuidParamPipe } from '../common/uuid';
import { BookingResponseDto, CreateBookingDto } from './booking.dto';
import { BookingsService } from './bookings.service';

const SLOT_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const booking = (status: 'active' | 'cancelled') => ({
  booking: { id: BOOKING_ID, slotId: SLOT_ID, customerName: 'Alex Morgan', customerEmail: 'alex@example.com', status },
});
const err = (code: string, message: string) => ({ error: { code, message } });
const internalError = {
  type: ErrorResponse('INTERNAL_ERROR'),
  description: 'Unexpected server error. No stack traces or database details are exposed.',
  example: err('INTERNAL_ERROR', 'An unexpected error occurred.'),
};

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'createBooking',
    summary: 'Book a slot',
    description:
      '`customerName` and `customerEmail` are trimmed before validation and storage. Unknown extra fields are ignored.\n\n' +
      '**Concurrency:** a slot holds at most one active booking. When several valid requests race for the ' +
      'same available slot, exactly one gets `201` and all others get `409 SLOT_UNAVAILABLE`, whether the ' +
      'customer data is identical or not.\n\n' +
      'On success a `slot.booked` Socket.IO event is broadcast after the commit.',
  })
  @ApiBody({
    type: CreateBookingDto,
    required: true,
    examples: {
      valid: {
        summary: 'Valid booking',
        value: { slotId: SLOT_ID, customerName: 'Alex Morgan', customerEmail: 'alex@example.com' },
      },
      untrimmed: {
        summary: 'Whitespace is trimmed',
        value: { slotId: SLOT_ID, customerName: '  Alex Morgan ', customerEmail: ' alex@example.com  ' },
      },
    },
  })
  @ApiCreatedResponse({ type: BookingResponseDto, description: 'Booking created.', example: booking('active') })
  @ApiBadRequestResponse({
    type: ErrorResponse('VALIDATION_ERROR'),
    description: 'Missing or invalid input, including a body that is not valid JSON or not a JSON object.',
    examples: {
      missingField: { summary: 'Missing field', value: err('VALIDATION_ERROR', 'customerEmail is required.') },
      invalidEmail: {
        summary: 'Invalid email',
        value: err('VALIDATION_ERROR', 'customerEmail must be a valid email address.'),
      },
      blankName: {
        summary: 'Blank name after trimming',
        value: err('VALIDATION_ERROR', 'customerName must not be empty.'),
      },
      invalidUuid: { summary: 'slotId is not a UUID', value: err('VALIDATION_ERROR', 'slotId must be a valid UUID.') },
      invalidJson: { summary: 'Malformed JSON', value: err('VALIDATION_ERROR', 'Request body must be a valid JSON object.') },
    },
  })
  @ApiNotFoundResponse({
    type: ErrorResponse('SLOT_NOT_FOUND'),
    description: '`slotId` is a valid UUID but no such slot exists.',
    example: err('SLOT_NOT_FOUND', 'Slot not found.'),
  })
  @ApiConflictResponse({
    type: ErrorResponse('SLOT_UNAVAILABLE'),
    description: 'The slot already has an active booking (including losing a concurrent race).',
    example: err('SLOT_UNAVAILABLE', 'This slot already has an active booking.'),
  })
  @ApiInternalServerErrorResponse(internalError)
  async create(@Body() body: CreateBookingDto): Promise<BookingResponseDto> {
    return { booking: await this.bookings.create(body) };
  }

  @Delete(':bookingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'cancelBooking',
    summary: 'Cancel a booking',
    description:
      'Sets an `active` booking to `cancelled` and makes its slot available again; a `slot.released` ' +
      'Socket.IO event is broadcast after the commit. No request body.\n\n' +
      '**Idempotent:** cancelling an already-cancelled booking returns `200` with the same booking, ' +
      'unchanged, and emits no event. Cancelling an old cancelled booking never affects a newer active ' +
      'booking on the same slot. Cancelled bookings remain addressable by id.',
  })
  @ApiParam({
    name: 'bookingId',
    required: true,
    description: 'Booking id.',
    schema: { type: 'string', format: 'uuid', pattern: UUID_PATTERN, example: BOOKING_ID },
  })
  @ApiOkResponse({
    type: BookingResponseDto,
    description: 'Booking is cancelled (just now, or it already was).',
    example: booking('cancelled'),
  })
  @ApiBadRequestResponse({
    type: ErrorResponse('VALIDATION_ERROR'),
    description: '`bookingId` is not a valid UUID.',
    example: err('VALIDATION_ERROR', 'bookingId must be a valid UUID.'),
  })
  @ApiNotFoundResponse({
    type: ErrorResponse('BOOKING_NOT_FOUND'),
    description: '`bookingId` is a valid UUID but no such booking exists.',
    example: err('BOOKING_NOT_FOUND', 'Booking not found.'),
  })
  @ApiInternalServerErrorResponse(internalError)
  async cancel(@Param('bookingId', new UuidParamPipe('bookingId')) bookingId: string): Promise<BookingResponseDto> {
    return { booking: await this.bookings.cancel(bookingId) };
  }
}
