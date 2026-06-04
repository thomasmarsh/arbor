import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    root: __dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: process.env['CI'] ? ['src/**/*.pg.*.test.ts'] : [],
    setupFiles: ['src/testing/setup.ts'],
    reporters: process.env['CI']
      ? ['default', ['junit', { outputFile: 'test-results/junit.xml' }]]
      : ['default'],
    coverage: {
      enabled: !!process.env['CI'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
    },
  },
});
