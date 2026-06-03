import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: '@arbor/router',
      root: './framework/router',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: '@arbor/common',
      root: './framework/common',
      include: ['src/**/*.test.ts'],
      exclude: ['dist/**', '**/node_modules/**'],
    },
  },
  {
    test: {
      name: '@arbor/router-browser',
      root: './framework/router-browser',
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
    },
  },
  'framework/router-test/vitest.config.js',
  'apps/api/vitest.config.ts',
  {
    test: {
      name: '@arbor/bff',
      root: './apps/bff',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: '@arbor/ui',
      root: './apps/ui',
      environment: 'jsdom',
    },
  },
]);
