import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from './api-error';

type Ctor = new () => object;
const cache = new Map<ErrorCode, Ctor>();

/**
 * Builds a named OpenAPI schema per error code (e.g. `SlotUnavailableResponse`) so every
 * documented response pins the exact `code` value instead of a loose string.
 */
export function ErrorResponse(code: ErrorCode): Ctor {
  const existing = cache.get(code);
  if (existing) return existing;

  const baseName = code
    .toLowerCase()
    .split('_')
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');

  class Detail {
    @ApiProperty({ enum: [code], example: code, description: 'Stable, machine-readable error code.' })
    code: ErrorCode;

    @ApiProperty({ minLength: 1, description: 'Human-readable explanation. Wording may change; do not parse it.' })
    message: string;
  }
  Object.defineProperty(Detail, 'name', { value: `${baseName}Detail` });

  class Envelope {
    @ApiProperty({ type: Detail })
    error: Detail;
  }
  Object.defineProperty(Envelope, 'name', { value: `${baseName}Response` });

  cache.set(code, Envelope);
  return Envelope;
}
