import { ValidationError, ValidationPipe } from '@nestjs/common';
import { ApiError } from './api-error';

/** Global body validation: class-validator errors become a single 400 VALIDATION_ERROR. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true, // unknown fields are dropped, never persisted
    stopAtFirstError: true,
    forbidUnknownValues: true, // rejects non-object bodies such as JSON arrays
    exceptionFactory: (errors) => ApiError.validation(formatErrors(errors)),
  });
}

function formatErrors(errors: ValidationError[]): string {
  const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
  return messages.length > 0 ? `${messages.join('; ')}.` : 'Request body must be a JSON object.';
}
