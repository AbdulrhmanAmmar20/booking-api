import { execSync } from 'node:child_process';
import { useTestDatabase } from './use-test-db';

/** Once per `npm test`: bring the test database schema up to date with the committed migrations. */
export default function globalSetup(): void {
  const url = useTestDatabase();
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
