import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.int.test.ts'],
    setupFiles: ['tests/integration/setup/env.ts'],
    globalSetup: ['tests/integration/setup/globalSetup.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
