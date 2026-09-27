import { Controller, Get } from '@nestjs/common';
import { ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../common/error-response.dto';
import { SlotListResponseDto } from './slot.dto';
import { SlotsService } from './slots.service';

@ApiTags('Slots')
@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listAvailableSlots',
    summary: 'List available slots',
    description:
      'Returns only slots without an active booking, sorted ascending by `startsAt`, then `id`. ' +
      'Takes no parameters and no body. Returns `{"slots":[]}` when nothing is available.',
  })
  @ApiOkResponse({
    type: SlotListResponseDto,
    examples: {
      available: {
        summary: 'Available slots',
        value: { slots: [{ id: '11111111-1111-4111-8111-111111111111', startsAt: '2030-01-15T09:00:00.000Z', endsAt: '2030-01-15T09:30:00.000Z' }] },
      },
      none: { summary: 'Nothing available', value: { slots: [] } },
    },
  })
  @ApiInternalServerErrorResponse({
    type: ErrorResponse('INTERNAL_ERROR'),
    description: 'Unexpected server error.',
    example: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
  })
  async list(): Promise<SlotListResponseDto> {
    return { slots: await this.slots.listAvailable() };
  }
}
