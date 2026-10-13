import { beforeEach, vi } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prismaMock } from './prismaMock';
import { redisMock } from './redisMock';

vi.mock('../../src/lib/prisma', async () => {
  const { prismaMock } = await import('./prismaMock');
  return { prisma: prismaMock };
});

vi.mock('../../src/lib/redis', async () => {
  const { redisMock } = await import('./redisMock');
  return { redis: redisMock, redisSub: redisMock, enableExpiryNotifications: vi.fn() };
});

beforeEach(async () => {
  mockReset(prismaMock);
  // Interactive transactions just run their callback against the same mock.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation((fn: any) => fn(prismaMock));
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  await redisMock.flushall();
});
