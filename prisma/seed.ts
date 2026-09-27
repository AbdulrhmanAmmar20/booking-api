import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Fixed, predefined slots. IDs are constant so they can be referenced in docs,
 * tests and manual curl calls. Running the seed again is a no-op (skipDuplicates).
 */
export const SEED_SLOTS = [
  { id: '11111111-1111-4111-8111-111111111111', startsAt: '2030-01-15T09:00:00.000Z', endsAt: '2030-01-15T09:30:00.000Z' },
  { id: '11111111-1111-4111-8111-111111111112', startsAt: '2030-01-15T09:30:00.000Z', endsAt: '2030-01-15T10:00:00.000Z' },
  { id: '11111111-1111-4111-8111-111111111113', startsAt: '2030-01-15T10:00:00.000Z', endsAt: '2030-01-15T10:30:00.000Z' },
  { id: '11111111-1111-4111-8111-111111111114', startsAt: '2030-01-15T10:30:00.000Z', endsAt: '2030-01-15T11:00:00.000Z' },
  { id: '11111111-1111-4111-8111-111111111115', startsAt: '2030-01-16T09:00:00.000Z', endsAt: '2030-01-16T09:30:00.000Z' },
  { id: '11111111-1111-4111-8111-111111111116', startsAt: '2030-01-16T09:30:00.000Z', endsAt: '2030-01-16T10:00:00.000Z' },
] as const;

export async function seed(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.slot.createMany({
    data: SEED_SLOTS.map((s) => ({ id: s.id, startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) })),
    skipDuplicates: true,
  });
  return count;
}

if (require.main === module) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  seed(prisma)
    .then((count) => console.log(`Seeded ${count} new slot(s) (${SEED_SLOTS.length} defined).`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
