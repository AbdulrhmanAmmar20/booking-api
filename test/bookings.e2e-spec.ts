import { api, EventRecorder, listen, resetDatabase, settle, startApp, TestApp } from './helpers';

const SLOT = '11111111-1111-4111-8111-111111111111';
const OTHER_SLOT = '11111111-1111-4111-8111-111111111112';
const MISSING = '99999999-9999-4999-8999-999999999999';
const alex = { slotId: SLOT, customerName: 'Alex Morgan', customerEmail: 'alex@example.com' };

let t: TestApp;
let rec: EventRecorder;

beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetDatabase(t.prisma);
  rec = await listen(t.baseUrl);
});
afterEach(() => rec.close());

const availableIds = async () => ((await api(t.baseUrl, 'GET', '/slots')).body.slots as { id: string }[]).map((s) => s.id);
const activeCount = (slotId: string) => t.prisma.booking.count({ where: { slotId, status: 'active' } });

describe('GET /slots', () => {
  it('lists seeded slots sorted by startsAt then id, as ISO UTC strings', async () => {
    const res = await api(t.baseUrl, 'GET', '/slots');
    expect(res.status).toBe(200);
    expect(res.body.slots[0]).toEqual({ id: SLOT, startsAt: '2030-01-15T09:00:00.000Z', endsAt: '2030-01-15T09:30:00.000Z' });
    const starts = res.body.slots.map((s: { startsAt: string }) => s.startsAt);
    expect(starts).toEqual([...starts].sort());
  });

  it('returns {"slots":[]} when nothing is available', async () => {
    await t.prisma.$executeRawUnsafe('TRUNCATE TABLE bookings, slots');
    const res = await api(t.baseUrl, 'GET', '/slots');
    expect(res).toEqual({ status: 200, body: { slots: [] } });
  });
});

describe('POST /bookings', () => {
  // Required test 1
  it('201: books the slot and removes it from available slots', async () => {
    const res = await api(t.baseUrl, 'POST', '/bookings', alex);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      booking: { id: expect.stringMatching(/^[0-9a-f-]{36}$/), ...alex, status: 'active' },
    });
    expect(await availableIds()).not.toContain(SLOT);
    expect(await activeCount(SLOT)).toBe(1);

    await settle();
    expect(rec.events).toEqual([
      { name: 'slot.booked', payload: { slotId: SLOT, bookingId: res.body.booking.id, available: false } },
    ]);
  });

  it('trims name and email before validating and storing', async () => {
    const res = await api(t.baseUrl, 'POST', '/bookings', { slotId: SLOT, customerName: '  Alex Morgan ', customerEmail: ' alex@example.com  ' });
    expect(res.status).toBe(201);
    expect(res.body.booking).toMatchObject({ customerName: 'Alex Morgan', customerEmail: 'alex@example.com' });
    const stored = await t.prisma.booking.findUniqueOrThrow({ where: { id: res.body.booking.id } });
    expect(stored).toMatchObject({ customerName: 'Alex Morgan', customerEmail: 'alex@example.com' });
  });

  it('409 SLOT_UNAVAILABLE when the slot already has an active booking', async () => {
    await api(t.baseUrl, 'POST', '/bookings', alex);
    const res = await api(t.baseUrl, 'POST', '/bookings', { ...alex, customerName: 'Someone Else' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('404 SLOT_NOT_FOUND for a valid but unknown slot id', async () => {
    const res = await api(t.baseUrl, 'POST', '/bookings', { ...alex, slotId: MISSING });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SLOT_NOT_FOUND');
  });

  it.each([
    ['missing slotId', { customerName: 'A', customerEmail: 'a@example.com' }],
    ['missing customerName', { slotId: SLOT, customerEmail: 'a@example.com' }],
    ['missing customerEmail', { slotId: SLOT, customerName: 'A' }],
    ['slotId not a UUID', { ...alex, slotId: 'not-a-uuid' }],
    ['blank name after trim', { ...alex, customerName: '   ' }],
    ['invalid email', { ...alex, customerEmail: 'alex@' }],
    ['non-string name', { ...alex, customerName: 42 }],
    ['JSON array body', []],
    ['malformed JSON', '{"slotId":'],
    ['JSON null body', 'null'],
  ])('400 VALIDATION_ERROR: %s', async (_label, body) => {
    const res = await api(t.baseUrl, 'POST', '/bookings', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toEqual(expect.any(String));
    expect(res.body.error.message.length).toBeGreaterThan(0);
    expect(await t.prisma.booking.count()).toBe(0);
  });
});

describe('concurrency', () => {
  // Required test 2: genuinely overlapping HTTP requests, no mocks.
  it.each([
    ['different customer data', [alex, { slotId: SLOT, customerName: 'Sam Lee', customerEmail: 'sam@example.com' }]],
    ['identical customer data', [alex, alex]],
  ])('two simultaneous requests for one slot (%s): one 201, one 409, one active booking', async (_label, bodies) => {
    const results = await Promise.all(bodies.map((b) => api(t.baseUrl, 'POST', '/bookings', b)));

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('SLOT_UNAVAILABLE');
    expect(await activeCount(SLOT)).toBe(1);
    expect(await t.prisma.booking.count()).toBe(1);

    await settle();
    expect(rec.events.filter((e) => e.name === 'slot.booked')).toHaveLength(1);
  });

  it('25 simultaneous requests for one slot: exactly one wins', async () => {
    const bodies = Array.from({ length: 25 }, (_, i) => ({ slotId: SLOT, customerName: `User ${i}`, customerEmail: `u${i}@example.com` }));
    const statuses = (await Promise.all(bodies.map((b) => api(t.baseUrl, 'POST', '/bookings', b)))).map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(24);
    expect(await activeCount(SLOT)).toBe(1);
  });
});

describe('DELETE /bookings/:bookingId', () => {
  // Required test 3
  it('200: cancels, makes the slot available again, and allows a new booking', async () => {
    const created = (await api(t.baseUrl, 'POST', '/bookings', alex)).body.booking;

    const res = await api(t.baseUrl, 'DELETE', `/bookings/${created.id}`);
    expect(res).toEqual({ status: 200, body: { booking: { ...created, status: 'cancelled' } } });
    expect(await availableIds()).toContain(SLOT);

    const rebooked = await api(t.baseUrl, 'POST', '/bookings', { ...alex, customerName: 'Next Person' });
    expect(rebooked.status).toBe(201);
    expect(await activeCount(SLOT)).toBe(1);

    await settle();
    expect(rec.events.map((e) => e.name)).toEqual(['slot.booked', 'slot.released', 'slot.booked']);
    expect(rec.events[1].payload).toEqual({ slotId: SLOT, bookingId: created.id, available: true });
  });

  it('is idempotent: repeat cancel returns 200 with the same booking and emits no event', async () => {
    const created = (await api(t.baseUrl, 'POST', '/bookings', alex)).body.booking;
    const first = await api(t.baseUrl, 'DELETE', `/bookings/${created.id}`);
    const before = await t.prisma.booking.findUniqueOrThrow({ where: { id: created.id } });

    const second = await api(t.baseUrl, 'DELETE', `/bookings/${created.id}`);
    expect(second).toEqual(first);
    expect(await t.prisma.booking.findUniqueOrThrow({ where: { id: created.id } })).toEqual(before);

    await settle();
    expect(rec.events.filter((e) => e.name === 'slot.released')).toHaveLength(1);
  });

  it('simultaneous cancels of one booking emit exactly one slot.released', async () => {
    const created = (await api(t.baseUrl, 'POST', '/bookings', alex)).body.booking;
    const results = await Promise.all([1, 2, 3].map(() => api(t.baseUrl, 'DELETE', `/bookings/${created.id}`)));
    expect(results.every((r) => r.status === 200 && r.body.booking.status === 'cancelled')).toBe(true);

    await settle();
    expect(rec.events.filter((e) => e.name === 'slot.released')).toHaveLength(1);
  });

  it('cancelling an old cancelled booking does not affect the newer active booking', async () => {
    const old = (await api(t.baseUrl, 'POST', '/bookings', alex)).body.booking;
    await api(t.baseUrl, 'DELETE', `/bookings/${old.id}`);
    const current = (await api(t.baseUrl, 'POST', '/bookings', alex)).body.booking;

    const res = await api(t.baseUrl, 'DELETE', `/bookings/${old.id}`);
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ id: old.id, status: 'cancelled' });
    expect(await t.prisma.booking.findUniqueOrThrow({ where: { id: current.id } })).toMatchObject({ status: 'active' });
    expect(await availableIds()).not.toContain(SLOT);
  });

  it('bookings on other slots are unaffected', async () => {
    const a = (await api(t.baseUrl, 'POST', '/bookings', alex)).body.booking;
    await api(t.baseUrl, 'POST', '/bookings', { ...alex, slotId: OTHER_SLOT });
    await api(t.baseUrl, 'DELETE', `/bookings/${a.id}`);
    expect(await activeCount(OTHER_SLOT)).toBe(1);
  });

  it('400 VALIDATION_ERROR for a non-UUID id', async () => {
    const res = await api(t.baseUrl, 'DELETE', '/bookings/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 BOOKING_NOT_FOUND for a valid but unknown id', async () => {
    const res = await api(t.baseUrl, 'DELETE', `/bookings/${MISSING}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
  });
});

describe('events and docs', () => {
  it('rejected requests emit no events and events carry no customer data', async () => {
    await api(t.baseUrl, 'POST', '/bookings', alex);
    await api(t.baseUrl, 'POST', '/bookings', alex); // 409
    await api(t.baseUrl, 'POST', '/bookings', { ...alex, slotId: MISSING }); // 404
    await settle();
    expect(rec.events).toHaveLength(1);
    expect(Object.keys(rec.events[0].payload).sort()).toEqual(['available', 'bookingId', 'slotId']);
  });

  it('serves the OpenAPI spec at /openapi.json and Swagger UI at /docs', async () => {
    const spec = await api(t.baseUrl, 'GET', '/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.body.paths).sort()).toEqual(['/bookings', '/bookings/{bookingId}', '/slots']);
    expect(Object.keys(spec.body.paths['/bookings'].post.responses).sort()).toEqual(['201', '400', '404', '409', '500']);
    expect(Object.keys(spec.body.paths['/bookings/{bookingId}'].delete.responses).sort()).toEqual(['200', '400', '404', '500']);

    const ui = await fetch(`${t.baseUrl}/docs`);
    expect(ui.status).toBe(200);
    expect(await ui.text()).toContain('swagger');
  });
});
