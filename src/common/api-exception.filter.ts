import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError, ErrorCode } from './api-error';

interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

/**
 * Single place that turns any thrown value into the documented error envelope.
 * Unknown errors become a generic 500 - stack traces and database details are
 * logged server-side only, never sent to the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof ApiError) {
      return this.build(exception.status, exception.code, exception.message);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === HttpStatus.NOT_FOUND) {
        return this.build(status, 'NOT_FOUND', 'Route not found.');
      }
      if (status === HttpStatus.BAD_REQUEST) {
        // Our own validation always throws ApiError, so a bare framework 400 comes from the
        // JSON body parser (malformed JSON, or a top-level value that isn't an object/array).
        return this.build(status, 'VALIDATION_ERROR', 'Request body must be a valid JSON object.');
      }
      if (status < 500) {
        // Other framework client errors (e.g. 413 body too large). Not part of the spec'd codes but still safe to surface.
        return this.build(status, 'VALIDATION_ERROR', exception.message);
      }
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return this.build(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }

  private build(status: number, code: ErrorCode, message: string) {
    return { status, body: { error: { code, message } } };
  }
}
