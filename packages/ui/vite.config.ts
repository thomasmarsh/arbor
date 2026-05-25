import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import { defineConfig } from 'vite';

const ARBOR_BFF_URL = process.env['ARBOR_BFF_URL'] ?? 'http://localhost:3000';

const USE_HTTPS = process.env['VITE_USE_HTTPS'] === 'true';

const plugins: PluginOption[] = [react()];

if (USE_HTTPS) {
  plugins.push(basicSsl());
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: ARBOR_BFF_URL, changeOrigin: true },
      '/api': { target: ARBOR_BFF_URL, changeOrigin: true },
    },
  },
  build: {
    // Sourcemaps in prod so BFF-side error reporting is useful
    sourcemap: true,
  },
});
