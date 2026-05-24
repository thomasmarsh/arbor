import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api':  { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    // Sourcemaps in prod so BFF-side error reporting is useful
    sourcemap: true,
  },
});
