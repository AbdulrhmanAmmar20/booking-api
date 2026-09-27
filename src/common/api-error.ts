import { HttpStatus } from '@nestjs/common';

/** Every error code the API can return. The HTTP status is fixed per code. */
export const ERROR_STATUS = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  SLOT_NOT_FOUND: HttpStatus.NOT_FOUND,
  BOOKING_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  SLOT_UNAVAILABLE: HttpStatus.CONFLICT,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Domain/API error. Rendered as {"error":{"code","message"}} by ApiExceptionFilter. */
export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.status = ERROR_STATUS[code];
  }

  static validation(message: string): ApiError {
    return new ApiError('VALIDATION_ERROR', message);
  }
}
