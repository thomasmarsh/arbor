import { defineConfig, defineProject } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      defineProject({
        test: {
          name: '@arbor/router',
          root: './framework/router',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      }),
      defineProject({
        test: {
          name: '@arbor/common',
          root: './framework/common',
          include: ['src/**/*.test.ts'],
          exclude: ['dist/**', '**/node_modules/**'],
        },
      }),
      defineProject({
        test: {
          name: '@arbor/router-browser',
          root: './framework/router-browser',
          environment: 'jsdom',
          include: ['src/**/*.test.ts'],
        },
      }),
      'framework/router-test/vitest.config.js',
      'apps/api/vitest.config.ts',
      defineProject({
        test: {
          name: '@arbor/bff',
          root: './apps/bff',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      }),
      'apps/ui/vite.config.ts',
    ],
  },
});
