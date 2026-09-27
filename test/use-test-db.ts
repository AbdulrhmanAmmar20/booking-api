import 'dotenv/config';

/**
 * Runs before every test file (and from global-setup). Points the app at the dedicated TEST
 * database. There is deliberately no fallback to DATABASE_URL: the tests truncate tables.
 */
export function useTestDatabase(): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env (see README "Tests").');
  }
  process.env.DATABASE_URL = testUrl;
  return testUrl;
}

useTestDatabase();
