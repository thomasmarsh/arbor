import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/common/vitest.config.ts',
      'packages/bff/vitest.config.ts',
      'packages/ui/vitest.config.ts',
      'packages/api/vitest.config.ts',
    ],
  },
});
