import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { createValidationPipe } from './common/validation';

/** Shared by main.ts and the e2e tests, so tests exercise the exact production wiring. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Appointment Booking API')
    .setDescription(
      'Mini API for booking fixed, pre-seeded appointment slots.\n\n' +
        '- **No authentication** is required for any endpoint.\n' +
        '- Request and response bodies are JSON; ids are UUID strings; timestamps are ISO 8601 in UTC.\n' +
        '- Every error uses the envelope `{"error":{"code":"...","message":"..."}}`.\n' +
        '- Real-time updates (`slot.booked`, `slot.released`) are delivered over Socket.IO; see the README.',
    )
    .setVersion('1.0.0')
    .addServer('/', 'This server')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.security = []; // explicitly: no authentication
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'openapi.json' });
}
