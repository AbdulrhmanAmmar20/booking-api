# Appointment Booking API

A small appointment-booking API built with NestJS 11, PostgreSQL, Prisma 7, Socket.IO and OpenAPI (Swagger UI).

- `GET /slots` lists available slots.
- `POST /bookings` books a slot. It returns `409` if another request already took the slot, even when the requests arrive at the same moment.
- `DELETE /bookings/{bookingId}` cancels a booking. Repeating the call is safe.
- Clients get live updates over Socket.IO: `slot.booked` and `slot.released`.

---

## Requirements

- **Node.js ≥ 20.19** (developed on Node 24)
- **PostgreSQL ≥ 13**, running locally or anywhere you can reach. Tested on PostgreSQL 18.
  Docker is not required. If you have it, this one-liner matches `.env.example`:
  ```bash
  docker run -d --name booking-pg -e POSTGRES_USER=booking -e POSTGRES_PASSWORD=booking -p 5433:5432 postgres:17-alpine
  ```

## Install & run

```bash
npm install              # also runs `prisma generate` (postinstall)
cp .env.example .env     # adjust DATABASE_URL / TEST_DATABASE_URL if needed
npm run db:migrate       # prisma migrate deploy (creates the DB if missing)
npm run db:seed          # inserts 6 fixed slots (idempotent: safe to re-run)
npm run start:dev        # or: npm run build && npm start
```

### Environment variables

| Variable            | Example                                                          | Purpose |
|---------------------|------------------------------------------------------------------|---------|
| `DATABASE_URL`      | `postgresql://booking:booking@localhost:5433/booking_dev?schema=public` | App, migrations, seed |
| `TEST_DATABASE_URL` | `postgresql://booking:booking@localhost:5433/booking_test?schema=public` | Used **only** by `npm test`. This database is wiped by the tests. |
| `PORT`              | `3000`                                                           | HTTP + Socket.IO port |

### URLs (default port 3000)

| What | URL |
|------|-----|
| API | `http://localhost:3000` |
| Swagger UI | `http://localhost:3000/docs` |
| OpenAPI spec (JSON) | `http://localhost:3000/openapi.json` |
| Socket.IO | `http://localhost:3000` · namespace `/` · path `/socket.io` |

### Quick try (curl)

```bash
curl -s localhost:3000/slots
curl -s -X POST localhost:3000/bookings -H 'content-type: application/json' \
  -d '{"slotId":"11111111-1111-4111-8111-111111111111","customerName":"Alex Morgan","customerEmail":"alex@example.com"}'
curl -s -X DELETE localhost:3000/bookings/<bookingId>
```

Seeded slot ids run from `11111111-1111-4111-8111-111111111111` to `…111116`, on 2030-01-15 and 2030-01-16.

---

## Tests

```bash
npm test
```

**How the test database is set up:** before any test runs, `test/global-setup.ts` runs `prisma migrate deploy` against `TEST_DATABASE_URL` and creates that database if it doesn't exist. Before each test, `TRUNCATE bookings, slots` runs and the standard slots are re-seeded, so every run starts from the same state and can be repeated. The tests never fall back to `DATABASE_URL`, so they can't wipe your dev data by accident. They run in band (`--runInBand`) because they share one database.

The tests are end-to-end. They start the real Nest app (same wiring as `main.ts`) on a random port, make real HTTP calls with `fetch`, and listen with a real `socket.io-client`. PostgreSQL is not mocked.

The three required scenarios, plus extras:

1. **Booking success:** `201`, and the slot disappears from `GET /slots`. `slot.booked` is emitted.
2. **Concurrency:** two requests fired together with `Promise.all`, over separate HTTP connections and so separate DB connections, get exactly one `201` and one `409`, with exactly one active booking in the DB. This runs once with identical customer data and once with different data, and there is also a 25-request stampede. Only one `slot.booked` event is emitted.
3. **Cancel:** `200`, the slot is available again, and a new booking succeeds.
4. Also covered: every `400` case (missing fields, bad UUID, blank name after trimming, bad email, non-string, JSON array, malformed JSON, `null` body), `404`s, trimming, idempotent re-cancel (same body, row unchanged, no second event), 3 concurrent cancels emitting exactly one `slot.released`, cancelling an old cancelled booking not touching the newer active one, and the OpenAPI/Swagger endpoints being served.

`npm run typecheck` type-checks the source, tests, seed and scripts.

> I checked that the concurrency test really catches the bug: with the partial unique index dropped, all three concurrency tests fail.

---

## Testing Socket.IO without a UI

Terminal 1: `npm run start:dev`
Terminal 2: `npm run socket:listen` (or `npm run socket:listen -- http://localhost:4000`)
Terminal 3: book and cancel with the curl commands above.

Terminal 2 prints:

```
[connected] http://localhost:3000 (id …) - waiting for events, Ctrl+C to stop
2026-…Z  slot.booked    {"slotId":"1111…1111","bookingId":"…","available":false}
2026-…Z  slot.released  {"slotId":"1111…1111","bookingId":"…","available":true}
```

### Events (server → client, default namespace, broadcast to all connected clients)

| Event | When | Payload |
|-------|------|---------|
| `slot.booked` | after a booking insert is committed | `{"slotId": uuid, "bookingId": uuid, "available": false}` |
| `slot.released` | after an active booking is set to cancelled and committed | `{"slotId": uuid, "bookingId": uuid, "available": true}` |

- Each event is emitted once, only after the database change has committed.
- Rejected requests (`400`, `404`, `409`) emit nothing, and neither does a repeat cancel.
- Payloads never contain customer data.
- No auth, no rooms, and the server doesn't listen for any client events.
- Delivery is best effort: no persistence, no replay, no exactly-once guarantee. A client that reconnects should call `GET /slots` again to resync.

---

## How double booking is prevented

**The database enforces it, not the application code.** The `bookings` table has a partial unique index:

```sql
CREATE UNIQUE INDEX bookings_one_active_per_slot ON bookings (slot_id) WHERE (status = 'active');
```

It is declared in `schema.prisma` with Prisma's `partialIndexes` preview feature (`@@unique([slotId], where: raw("status = 'active'"))`), so the schema, the migration and the database agree and `prisma migrate dev` won't drift.

`POST /bookings` does a single `INSERT` with no read beforehand:

- **The insert succeeds:** `201`, and `slot.booked` is emitted.
- **Unique violation** (Prisma `P2002`): another active booking already holds the slot, or won the race. Return `409 SLOT_UNAVAILABLE`.
- **Foreign-key violation** (Prisma `P2003`): the slot doesn't exist. Return `404 SLOT_NOT_FOUND`.

Because nothing is read before the write, there is no gap between a check and the insert for another request to slip into. When N inserts race, PostgreSQL's unique-index check serializes them: exactly one commits and the rest get `23505`. This holds across any number of app instances, because they all share the database.

**Cancel** runs one conditional update:
`UPDATE bookings SET status='cancelled', cancelled_at=now() WHERE id=$1 AND status='active' RETURNING *` (via `updateManyAndReturn`).

- **A row comes back:** this request did the cancel. Emit `slot.released` and return `200`.
- **No row comes back:** look the booking up by id. If it exists, it was already cancelled, so return it unchanged with no event. If not, return `404 BOOKING_NOT_FOUND`.

Row-level locking means that when cancels race, only one sees the row, so only one event fires. Because the update matches on the booking **id**, cancelling an old booking can never touch a newer active booking on the same slot.

### Alternatives I considered

| Option | Why not |
|---|---|
| Check "is the slot free?" and then insert | Race condition: both requests pass the check. |
| `SELECT … FOR UPDATE` on the slot inside a transaction | Correct, but it takes an extra round trip and holds a lock. The index enforces the same rule with less code, and it also applies to writes that bypass the app. |
| `SERIALIZABLE` isolation + retries | Correct, but needs retry logic, and the invariant ends up in isolation semantics instead of the schema. |
| A `current_booking_id` column on `slots` | Duplicates state and needs a two-table update. |
| Application mutex / Redis lock | Only works within one process, or adds infrastructure. The DB is already the source of truth. |

## Other key decisions

- **Data model:** `slots (id, starts_at, ends_at)` has a `CHECK (ends_at > starts_at)` constraint, added in a SQL migration because Prisma can't express CHECK. `bookings (id, slot_id FK, customer_name, customer_email, status enum, created_at, cancelled_at)`. Cancelled rows are kept as history and stay reachable by id; that is why a partial index is used rather than a plain unique one. Timestamps are `timestamptz`, and the API always returns them as UTC via `toISOString()`.
- **Available slots:** `WHERE NOT EXISTS (active booking)`, sorted by `starts_at, id`. PostgreSQL compares `uuid` values by bytes, which gives the same order as sorting the lowercase hex strings.
- **Validation:** `class-validator` behind a global `ValidationPipe`:
  - Name and email are trimmed with `@Transform` before they are validated and before they are stored.
  - Unknown fields are stripped (`whitelist`).
  - Non-object bodies are rejected.
  - UUIDs are checked with a strict 8-4-4-4-12 hex regex (any version), both in the body and in the path.
  - Length caps: name ≤ 200, email ≤ 254 (the RFC limit).
- **Errors:** one global `ApiExceptionFilter` maps everything to `{"error":{"code","message"}}`. Unknown errors become `500 INTERNAL_ERROR` with a generic message; the stack trace is logged on the server only, and no SQL or Prisma details are ever returned. Malformed JSON becomes `400 VALIDATION_ERROR`. Unknown routes return `404 NOT_FOUND` (not part of the spec, but it keeps the envelope consistent).
- **OpenAPI:** generated from code with `@nestjs/swagger` decorators, so it stays in sync with the code. Each error response has its own schema (`SlotUnavailableResponse`, and so on) with the exact `code` value as an enum, plus examples. The spec states that no authentication is needed (`security: []`) and documents the idempotent cancel. A test checks that every status code listed here is documented.
- **Events after commit:** each write is a single auto-committed statement, so once the Prisma call resolves the change is durable, and only then is the event emitted. Emitting is wrapped so a socket failure can never turn a committed booking into a 500.
- **Structure:** feature modules (`slots`, `bookings`, `events`, `prisma`, `common`). Controllers handle HTTP and docs, services hold the rules, and the gateway only broadcasts. I kept the layering light on purpose: repositories or ports-and-adapters would be over-engineering at this size.

## Possible improvements

- Transactional outbox for events (the booking row plus an outbox row in one transaction, then a relay publishes). This would give at-least-once delivery that survives a crash between commit and emit, and it would allow a Redis adapter for multi-instance Socket.IO.
- An idempotency key header on `POST /bookings`, so a client can safely retry after a network error.
- `GET /bookings/{id}`, pagination and date filters on `/slots`, rate limiting, and structured logging with request ids.
- Checking the OpenAPI spec against real responses in the tests (for example with `jest-openapi`).
- Run tests in parallel with one schema or database per worker.

---

## Time spent & what's incomplete

- **Actual time:** _TODO: fill in your real time_
- **Incomplete:** nothing from the brief is knowingly missing. Notes:
  - `partialIndexes` is a Prisma **preview** feature (Prisma 7.4+). The fallback would be the same `CREATE UNIQUE INDEX … WHERE` in a hand-written migration.
  - Real-time delivery is best effort, as the brief allows.

## AI disclosure

_TODO: write this yourself. Name the tools you used (for example Claude Code), what you asked them to do, and how you reviewed and tested the output. You must be able to explain and change this code in the interview._

---

## Project layout

```
prisma/
  schema.prisma             models + partial unique index
  migrations/               init, plus a CHECK constraint (raw SQL)
  seed.ts                   6 fixed slots, idempotent
src/
  main.ts, app.module.ts, app.setup.ts   bootstrap; pipes/filter/Swagger shared with tests
  common/                   ApiError, exception filter, validation pipe, UUID pipe, error schemas
  slots/                    GET /slots
  bookings/                 POST /bookings, DELETE /bookings/:id, DTOs
  events/                   Socket.IO gateway (slot.booked / slot.released)
  prisma/                   PrismaService (pg driver adapter)
test/                       e2e tests + DB setup
scripts/socket-listen.ts    headless Socket.IO client
```
