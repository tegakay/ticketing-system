import 'dotenv/config';

// Point the app's Prisma and Redis clients at the throwaway test instances.
// This runs before any test file imports src/.
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
if (process.env.REDIS_URL_TEST) process.env.REDIS_URL = process.env.REDIS_URL_TEST;
process.env.JWT_SECRET = 'integration-secret';
process.env.NODE_ENV = 'test';
