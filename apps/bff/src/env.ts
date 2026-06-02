import type * as oidc from 'openid-client';
import { z } from 'zod';
import type { Session } from './session.js';

export const ProcessEnvSchema = z
  .object({
    ARBOR_AUTH_DISABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    ARBOR_OIDC_ISSUER: z.url().optional(),
    ARBOR_OIDC_CLIENT_ID: z.string().optional(),
    ARBOR_OIDC_CLIENT_SECRET: z.string().optional(),
    ARBOR_OIDC_REDIRECT_URI: z.url().optional(),
    ARBOR_SESSION_SECRET: z.string().min(32).optional(),
    ARBOR_UI_DIST: z.string().optional(),
    BFF_PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    ARBOR_APP_URL: z.url().default('http://localhost:5173'),
    ARBOR_BFF_URL: z.url().default('http://localhost:3000'),
    ARBOR_API_URL: z.url().default('http://localhost:3001'),
    VITE_USE_HTTPS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine(
    (e) =>
      e.ARBOR_AUTH_DISABLED ||
      (e.ARBOR_OIDC_ISSUER != null &&
        e.ARBOR_OIDC_CLIENT_ID != null &&
        e.ARBOR_OIDC_CLIENT_SECRET != null &&
        e.ARBOR_OIDC_REDIRECT_URI != null &&
        e.ARBOR_SESSION_SECRET != null),
    {
      message:
        'ARBOR_OIDC_ISSUER, ARBOR_OIDC_CLIENT_ID, ARBOR_OIDC_CLIENT_SECRET, ' +
        'ARBOR_OIDC_REDIRECT_URI, and ARBOR_SESSION_SECRET are required when ARBOR_AUTH_DISABLED=false',
      path: ['ARBOR_AUTH_DISABLED'],
    },
  );

export type ProcessEnv = z.infer<typeof ProcessEnvSchema>;

export function parseProcessEnv(): ProcessEnv {
  const result = ProcessEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(z.treeifyError(result.error).errors);
    process.exit(1);
  }
  return result.data;
}

export interface LoginParams {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
  isPopup: boolean;
}

export interface CallbackParams {
  currentUrl: URL;
  expectedState: string | undefined;
  codeVerifier: string | undefined;
  isPopup: boolean;
}

export type CallbackResult =
  | { tag: 'success'; sessionToken: string; isPopup: boolean }
  | { tag: 'missing-state' }
  | { tag: 'no-id-token' }
  | { tag: 'oidc-error'; error: unknown };

export type SessionResult =
  | { tag: 'authenticated'; session: Session }
  | { tag: 'missing' }
  | { tag: 'expired' };

export interface ProxyRequest {
  method: string;
  path: string;
  search: string;
  sessionToken: string | undefined;
  body: (() => Promise<ArrayBuffer>) | undefined;
}

export interface ProxyResponse {
  tag: 'ok';
  status: number;
  headers: Headers;
  body: ReadableStream | null;
}

export type AuthResponse = { tag: 'unauthorized' } | { tag: 'expired' } | ProxyResponse;

export interface BffEnvironment {
  config: ProcessEnv;

  oidc: {
    discovery: () => Promise<oidc.Configuration>;
    authorizationCodeGrant: (
      config: oidc.Configuration,
      currentUrl: URL,
      checks: { pkceCodeVerifier: string; expectedState: string; idTokenExpected: true },
    ) => Promise<oidc.TokenEndpointResponse & { claims(): oidc.IDToken | undefined }>;
    buildEndSessionUrl: (config: oidc.Configuration, appUrl: string) => string;
    randomState: () => string;
    randomPKCECodeVerifier: () => string;
    calculatePKCECodeChallenge: (verifier: string) => Promise<string>;
    buildAuthorizationUrl: (config: oidc.Configuration, params: Record<string, string>) => URL;
  };

  // Session — verifySessionToken hits crypto, createSessionToken hits crypto
  session: {
    verify: (token: string) => Promise<Session | null>;
    create: (session: Session) => Promise<string>;
  };

  // The actual fetch to the upstream API
  fetch: (url: string, init: RequestInit) => Promise<Response>;

  // Dev identity injected when auth is disabled
  devIdentity: Session;
}
