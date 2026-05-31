import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    root: __dirname,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
