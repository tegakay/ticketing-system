import type { PrismaClient } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';

export const prismaMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
