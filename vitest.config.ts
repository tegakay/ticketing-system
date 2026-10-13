import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/routes/**/*.test.ts'],
    setupFiles: ['tests/setup/env.ts', 'tests/setup/mocks.ts'],
    environment: 'node',
  },
});
