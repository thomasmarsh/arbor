import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'framework/*/vitest.config.ts',
      'framework/router-test/vitest.config.js',
      'apps/*/vitest.config.ts',
    ],
  },
});
