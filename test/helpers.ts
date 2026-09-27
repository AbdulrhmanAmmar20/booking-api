import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import { seed } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  baseUrl: string;
}

/**
 * Boots the real application (same wiring as main.ts) on a random port. Tests talk to it over real
 * HTTP connections, so concurrent requests really are concurrent against PostgreSQL.
 */
export async function startApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, prisma: app.get(PrismaService), baseUrl: `http://127.0.0.1:${port}` };
}

/** Fresh, deterministic state: no bookings, the standard seeded slots. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE bookings, slots');
  await seed(prisma);
}

export async function api(baseUrl: string, method: string, path: string, body?: unknown) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

export interface EventRecorder {
  socket: Socket;
  events: { name: string; payload: any }[];
  close(): void;
}

export async function listen(baseUrl: string): Promise<EventRecorder> {
  const socket = io(baseUrl, { transports: ['websocket'], forceNew: true });
  const events: EventRecorder['events'] = [];
  socket.onAny((name, payload) => events.push({ name, payload }));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return { socket, events, close: () => socket.close() };
}

export const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
