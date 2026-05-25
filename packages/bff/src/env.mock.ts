import type { ProcessEnv } from './env.js';

export const mockProcessEnv: ProcessEnv = {
  ARBO_AUTH_DISABLED: false,
  ARBO_APP_URL: 'http://localhost:5173',
  ARBO_API_URL: 'http://localhost:3001',
  ARBO_BFF_URL: 'http://localhost:3000',
  ARBO_OIDC_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  NODE_ENV: 'test',
  BFF_PORT: 3000,
  VITE_USE_HTTPS: false,
  ARBO_UI_DIST: undefined,
  ARBO_OIDC_ISSUER: undefined,
  ARBO_OIDC_CLIENT_ID: undefined,
  ARBO_OIDC_CLIENT_SECRET: undefined,
  ARBO_SESSION_SECRET: 'test-secret-that-is-at-least-32-chars!!',
};
