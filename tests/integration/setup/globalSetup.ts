import 'dotenv/config';
import { execSync } from 'node:child_process';

export default function setup(): void {
  const dbUrl = process.env.DATABASE_URL_TEST;
  if (!dbUrl || !process.env.REDIS_URL_TEST) {
    console.warn(
      '\n[integration] DATABASE_URL_TEST / REDIS_URL_TEST not set — integration tests will be skipped.\n' +
        '  Start them with: docker compose -f docker-compose.test.yml up -d\n' +
        '  and set the variables (see .env.example).\n',
    );
    return;
  }

  // The suite TRUNCATEs every table between tests — never let it touch the dev database.
  if (dbUrl === process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL_TEST must point at a different database than DATABASE_URL');
  }

  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: dbUrl } });
}
