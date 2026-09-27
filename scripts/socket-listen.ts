/**
 * Headless Socket.IO client: prints every slot event the API broadcasts.
 *
 *   npm run socket:listen                       # connects to http://localhost:3000
 *   npm run socket:listen -- http://host:port   # custom URL
 *
 * Leave it running, then book/cancel via curl or Swagger UI in another terminal.
 */
import { io } from 'socket.io-client';

const url = process.argv[2] ?? `http://localhost:${process.env.PORT ?? 3000}`;
const socket = io(url, { path: '/socket.io' });

socket.on('connect', () => console.log(`[connected] ${url} (id ${socket.id}) - waiting for events, Ctrl+C to stop`));
socket.on('disconnect', (reason) => console.log(`[disconnected] ${reason}`));
socket.on('connect_error', (err) => console.error(`[connect_error] ${err.message}`));

for (const event of ['slot.booked', 'slot.released']) {
  socket.on(event, (payload) => console.log(`${new Date().toISOString()}  ${event}  ${JSON.stringify(payload)}`));
}
