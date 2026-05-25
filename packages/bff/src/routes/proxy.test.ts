import { describe, expect, it, vi } from 'vitest';
import type { BffEnvironment } from '../env.js';
import { mockProcessEnv } from '../env.mock.js';
import type { Session } from '../session.js';
import { createProxyRouter } from './proxy.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const mockSession: Session = {
  sub: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
};

const mockBffEnv: BffEnvironment = {
  config: mockProcessEnv,
  oidc: {
    discovery: vi.fn(),
    authorizationCodeGrant: vi.fn(),
    buildEndSessionUrl: vi.fn(),
    buildAuthorizationUrl: vi.fn().mockReturnValue(new URL('https://idp/auth?mock=true')),
    randomState: vi.fn(),
    randomPKCECodeVerifier: vi.fn(),
    calculatePKCECodeChallenge: vi.fn(),
  },
  session: {
    verify: vi.fn().mockResolvedValue(mockSession),
    create: vi.fn(),
  },
  fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
  devIdentity: { sub: 'dev', name: 'Dev User', email: 'dev@localhost' },
};

function makeBffEnv(overrides: Partial<BffEnvironment> = {}): BffEnvironment {
  return { ...mockBffEnv, ...overrides };
}

vi.mock('../env.js', () => ({
  env: {
    ARBO_AUTH_DISABLED: false,
    ARBO_API_URL: 'http://api',
  },
}));

// ── ALL /api/* ────────────────────────────────────────────────────────────────

describe('ALL /api/*', () => {
  function getLastFetchInit(env: BffEnvironment): RequestInit | undefined {
    return vi.mocked(env.fetch).mock.calls.at(-1)?.[1];
  }

  function getLastFetchHeaders(env: BffEnvironment): Record<string, string> {
    return getLastFetchInit(env)?.headers as Record<string, string>;
  }

  const withSession = {
    headers: { cookie: 'arbo_session=valid-token' },
  };

  it('returns 401 with no session cookie', async () => {
    const app = createProxyRouter(mockBffEnv);
    const res = await app.request('/hello');
    expect(res.status).toBe(401);
  });

  it('returns 401 when session expired', async () => {
    const env = makeBffEnv({
      session: { ...mockBffEnv.session, verify: vi.fn().mockResolvedValue(null) },
    });
    const app = createProxyRouter(env);
    const res = await app.request('/hello', withSession);
    expect(res.status).toBe(401);
  });

  it('forwards GET request with identity headers', async () => {
    const app = createProxyRouter(mockBffEnv);
    const res = await app.request('/hello', withSession);
    expect(res.status).toBe(200);
    expect(getLastFetchInit(mockBffEnv)?.method).toBe('GET');
  });

  it('forwards POST request with body and identity headers', async () => {
    const app = createProxyRouter(mockBffEnv);
    const res = await app.request('/hello', {
      method: 'POST',
      headers: { cookie: 'arbo_session=valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' }),
    });
    expect(res.status).toBe(200);
    expect(getLastFetchInit(mockBffEnv)?.method).toBe('POST');
    expect(getLastFetchInit(mockBffEnv)?.body).toBeDefined();
  });

  it('does not include body for GET request', async () => {
    const app = createProxyRouter(mockBffEnv);
    await app.request('/hello', withSession);
    expect(getLastFetchInit(mockBffEnv)?.body).toBeUndefined();
  });

  it('does not include body for HEAD request', async () => {
    const app = createProxyRouter(mockBffEnv);
    await app.request('/hello', {
      method: 'HEAD',
      headers: { cookie: 'arbo_session=valid-token' },
    });
    expect(getLastFetchInit(mockBffEnv)?.body).toBeUndefined();
  });

  it('passes x-arbo-sub header', async () => {
    const app = createProxyRouter(mockBffEnv);
    await app.request('/hello', withSession);
    expect(getLastFetchHeaders(mockBffEnv)['x-arbo-sub']).toBe(mockSession.sub);
  });

  it('passes x-arbo-name header', async () => {
    const app = createProxyRouter(mockBffEnv);
    await app.request('/hello', withSession);
    expect(getLastFetchHeaders(mockBffEnv)['x-arbo-name']).toBe(mockSession.name);
  });

  it('passes x-arbo-email header', async () => {
    const app = createProxyRouter(mockBffEnv);
    await app.request('/hello', withSession);
    expect(getLastFetchHeaders(mockBffEnv)['x-arbo-email']).toBe(mockSession.email);
  });

  it('returns upstream status code', async () => {
    const env = makeBffEnv({
      fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 418 })),
    });
    const app = createProxyRouter(env);
    const res = await app.request('/hello', withSession);
    expect(res.status).toBe(418);
  });

  it('returns upstream response body', async () => {
    const env = makeBffEnv({
      fetch: vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ message: 'hello' }), { status: 200 })),
    });
    const app = createProxyRouter(env);
    const res = await app.request('/hello', withSession);
    expect(await res.json()).toEqual({ message: 'hello' });
  });
});
