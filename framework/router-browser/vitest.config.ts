import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    silent: true,
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
