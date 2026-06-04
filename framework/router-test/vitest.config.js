import { fileURLToPath } from 'url';
import path from 'path';
import { defineConfig } from 'vitest/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const routerSrc = path.resolve(__dirname, '../router/src');

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @arbor/router to its TypeScript source for tests
      '@arbor/router/server': path.join(routerSrc, 'server/index.ts'),
      '@arbor/router': path.join(routerSrc, 'index.ts'),
    },
  },
  test: {
    root: __dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    silent: true,
    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: 'test-results/junit.xml' }]]
      : ['default'],
    coverage: {
      enabled: !!process.env.CI,
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
    },
  },
});
