-- Prisma schema cannot express CHECK constraints, so this one is plain SQL.
-- A slot must end after it starts.
ALTER TABLE "slots" ADD CONSTRAINT "slots_ends_after_starts" CHECK ("ends_at" > "starts_at");
