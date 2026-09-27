import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';

export interface SlotEventPayload {
  slotId: string;
  bookingId: string;
  available: boolean;
}

/**
 * Broadcast-only Socket.IO gateway on the HTTP server's default namespace (`/`, path `/socket.io`).
 * Clients don't send application events. Payloads never contain customer data.
 * Callers must invoke these only AFTER the database change has committed.
 */
@WebSocketGateway()
export class SlotEventsGateway {
  private readonly logger = new Logger(SlotEventsGateway.name);

  @WebSocketServer()
  private readonly server: Server;

  slotBooked(slotId: string, bookingId: string): void {
    this.emit('slot.booked', { slotId, bookingId, available: false });
  }

  slotReleased(slotId: string, bookingId: string): void {
    this.emit('slot.released', { slotId, bookingId, available: true });
  }

  private emit(event: 'slot.booked' | 'slot.released', payload: SlotEventPayload): void {
    // Best-effort: a broadcast failure must never turn a committed booking into an error response.
    try {
      this.server.emit(event, payload);
    } catch (err) {
      this.logger.warn(`Failed to emit ${event}: ${String(err)}`);
    }
  }
}
