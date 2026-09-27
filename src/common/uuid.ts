import { PipeTransform } from '@nestjs/common';
import { ApiError } from './api-error';

/** Canonical 8-4-4-4-12 hex UUID (any version) - exactly what PostgreSQL's uuid type accepts in this form. */
export const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
export const UUID_REGEX = new RegExp(UUID_PATTERN);

/** Path-param pipe: invalid UUIDs become 400 VALIDATION_ERROR before touching the database. */
export class UuidParamPipe implements PipeTransform<unknown, string> {
  constructor(private readonly name: string) {}

  transform(value: unknown): string {
    if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
      throw ApiError.validation(`${this.name} must be a valid UUID.`);
    }
    return value.toLowerCase();
  }
}
