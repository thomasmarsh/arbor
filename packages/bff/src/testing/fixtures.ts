import { vi } from 'vitest';
import type { BffEnvironment, ProcessEnv } from '../env.js';
import type { Session } from '../session.js';

export const mockProcessEnv: ProcessEnv = {
  ARBOR_AUTH_DISABLED: false,
  ARBOR_APP_URL: 'http://localhost:5173',
  ARBOR_API_URL: 'http://localhost:3001',
  ARBOR_BFF_URL: 'http://localhost:3000',
  ARBOR_OIDC_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  NODE_ENV: 'test',
  BFF_PORT: 3000,
  VITE_USE_HTTPS: false,
  ARBOR_UI_DIST: undefined,
  ARBOR_OIDC_ISSUER: undefined,
  ARBOR_OIDC_CLIENT_ID: undefined,
  ARBOR_OIDC_CLIENT_SECRET: undefined,
  ARBOR_SESSION_SECRET: 'test-secret-that-is-at-least-32-chars!!',
};

export const mockSession: Session = {
  sub: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
};

export const mockConfig = {} as never; // openid-client Configuration

export const mockBffEnv: BffEnvironment = {
  config: mockProcessEnv,
  oidc: {
    discovery: vi.fn().mockResolvedValue(mockConfig),
    authorizationCodeGrant: vi.fn().mockResolvedValue({
      claims: () => ({
        sub: mockSession.sub,
        name: mockSession.name,
        email: mockSession.email,
      }),
    }),
    buildEndSessionUrl: vi.fn().mockReturnValue('https://idp/logout'),
    buildAuthorizationUrl: vi.fn().mockReturnValue(new URL('https://idp/auth?mock=true')),
    randomState: vi.fn().mockReturnValue('mock-state'),
    randomPKCECodeVerifier: vi.fn().mockReturnValue('mock-verifier'),
    calculatePKCECodeChallenge: vi.fn().mockResolvedValue('mock-challenge'),
  },
  session: {
    verify: vi.fn().mockResolvedValue(mockSession),
    create: vi.fn().mockResolvedValue('mock-session-token'),
  },
  fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
  devIdentity: { sub: 'dev', name: 'Dev User', email: 'dev@localhost' },
};

export function makeBffEnv(overrides: Partial<BffEnvironment> = {}): BffEnvironment {
  return { ...mockBffEnv, ...overrides };
}
