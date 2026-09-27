import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { UUID_PATTERN, UUID_REGEX } from '../common/uuid';

// Note: decorators apply bottom-up, so validators below are listed from the most specific (top)
// to the most basic (bottom). With `stopAtFirstError`, the most basic failing rule is reported.
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid', pattern: UUID_PATTERN, example: '11111111-1111-4111-8111-111111111111' })
  @Matches(UUID_REGEX, { message: 'slotId must be a valid UUID' })
  @IsString({ message: 'slotId must be a string' })
  @IsDefined({ message: 'slotId is required' })
  slotId: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 200,
    example: 'Alex Morgan',
    description: 'Leading/trailing whitespace is trimmed before validation and storage; must be non-empty after trimming.',
  })
  @Transform(trim)
  @MaxLength(200, { message: 'customerName must be at most 200 characters' })
  @IsNotEmpty({ message: 'customerName must not be empty' })
  @IsString({ message: 'customerName must be a string' })
  @IsDefined({ message: 'customerName is required' })
  customerName: string;

  @ApiProperty({
    maxLength: 254,
    example: 'alex@example.com',
    description:
      'Leading/trailing whitespace is trimmed before validation and storage; the trimmed value must be a valid ' +
      'email address. (`format: email` is not declared here because untrimmed input is accepted.)',
  })
  @Transform(trim)
  @IsEmail({}, { message: 'customerEmail must be a valid email address' })
  @MaxLength(254, { message: 'customerEmail must be at most 254 characters' })
  @IsString({ message: 'customerEmail must be a string' })
  @IsDefined({ message: 'customerEmail is required' })
  customerEmail: string;
}

export enum BookingStatusDto {
  active = 'active',
  cancelled = 'cancelled',
}

export class BookingDto {
  @ApiProperty({ format: 'uuid', example: '22222222-2222-4222-8222-222222222222' })
  id: string;

  @ApiProperty({ format: 'uuid', example: '11111111-1111-4111-8111-111111111111' })
  slotId: string;

  @ApiProperty({ example: 'Alex Morgan' })
  customerName: string;

  @ApiProperty({ format: 'email', example: 'alex@example.com' })
  customerEmail: string;

  @ApiProperty({ enum: BookingStatusDto, enumName: 'BookingStatus', example: BookingStatusDto.active })
  status: BookingStatusDto;
}

export class BookingResponseDto {
  @ApiProperty({ type: BookingDto })
  booking: BookingDto;
}
