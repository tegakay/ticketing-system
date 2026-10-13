import type { Role } from '@prisma/client';

export const hasTestInfra = Boolean(process.env.DATABASE_URL_TEST && process.env.REDIS_URL_TEST);

/**
 * Imported lazily so a skipped suite never opens Prisma/Redis connections
 * (src/lib/redis connects as soon as it is imported).
 */
export async function loadHarness() {
  const [{ default: app }, { prisma }, { redis, redisSub }, { generateToken }, { hashPassword }] = await Promise.all([
    import('../../../src/app'),
    import('../../../src/lib/prisma'),
    import('../../../src/lib/redis'),
    import('../../../src/utils/jwt'),
    import('../../../src/utils/password'),
  ]);

  async function reset(): Promise<void> {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Ticket", "Order", "Event", "Venue", "Performer", "User" RESTART IDENTITY CASCADE',
    );
    await redis.flushdb();
  }

  async function shutdown(): Promise<void> {
    await prisma.$disconnect();
    redis.disconnect();
    redisSub.disconnect();
  }

  async function createUser(email: string, role: Role = 'USER') {
    const user = await prisma.user.create({
      data: { email, password: await hashPassword('Secret123!'), role },
    });
    return { user, auth: `Bearer ${generateToken({ id: user.id, email: user.email, role: user.role })}` };
  }

  async function createEvent(capacity: number) {
    const venue = await prisma.venue.create({
      data: { name: 'Main Hall', address: '1 Independence Ave', city: 'Accra', capacity: 1000 },
    });
    return prisma.event.create({
      data: { name: 'Rock Night', venue_id: venue.venue_id, date: new Date('2026-12-01T20:00:00Z'), price: 25, capacity },
    });
  }

  return { app, prisma, redis, reset, shutdown, createUser, createEvent };
}

export type Harness = Awaited<ReturnType<typeof loadHarness>>;
