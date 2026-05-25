import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BffEnvironment, ProxyRequest } from '../env.js';
import { makeBffEnv, mockBffEnv, mockConfig, mockSession } from '../testing/fixtures.js';
import { handleCallback, handleLogin, handleProxy, resolveSession } from './core.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── handleLogin ───────────────────────────────────────────────────────────────

describe('handleLogin', () => {
  it('returns correct redirect URL with PKCE params', async () => {
    const result = await handleLogin(mockBffEnv, {
      isPopup: false,
      redirectUri: 'http://localhost:3000/auth/callback',
    });

    expect(mockBffEnv.oidc.buildAuthorizationUrl).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({
        code_challenge: 'mock-challenge',
        code_challenge_method: 'S256',
        state: 'mock-state',
        redirect_uri: 'http://localhost:3000/auth/callback',
      }),
    );
    expect(result.redirectUrl).toBe('https://idp/auth?mock=true');
  });

  it('passes isPopup=false through correctly', async () => {
    const result = await handleLogin(mockBffEnv, {
      isPopup: false,
      redirectUri: 'http://localhost:3000/auth/callback',
    });

    expect(result.isPopup).toBe(false);
  });

  it('passes isPopup=true through correctly', async () => {
    const result = await handleLogin(mockBffEnv, {
      isPopup: true,
      redirectUri: 'http://localhost:3000/auth/callback',
    });

    expect(result.isPopup).toBe(true);
  });

  it('uses env-provided random functions', async () => {
    await handleLogin(mockBffEnv, {
      isPopup: false,
      redirectUri: 'http://localhost:3000/auth/callback',
    });

    expect(mockBffEnv.oidc.randomState).toHaveBeenCalledOnce();
    expect(mockBffEnv.oidc.randomPKCECodeVerifier).toHaveBeenCalledOnce();
    expect(mockBffEnv.oidc.calculatePKCECodeChallenge).toHaveBeenCalledWith('mock-verifier');
  });
});

// ── handleCallback ────────────────────────────────────────────────────────────

describe('handleCallback', () => {
  const baseParams = {
    currentUrl: new URL('http://localhost:3000/auth/callback?code=123&state=mock-state'),
    expectedState: 'mock-state',
    codeVerifier: 'mock-verifier',
    isPopup: false,
  };

  const baseClaims = {
    sub: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
  };

  it('returns missing-state when expectedState is undefined', async () => {
    const result = await handleCallback(mockBffEnv, {
      ...baseParams,
      expectedState: undefined,
    });
    expect(result.tag).toBe('missing-state');
  });

  it('returns missing-state when codeVerifier is undefined', async () => {
    const result = await handleCallback(mockBffEnv, {
      ...baseParams,
      codeVerifier: undefined,
    });
    expect(result.tag).toBe('missing-state');
  });

  it('returns no-id-token when claims() returns null', async () => {
    const env = makeBffEnv({
      oidc: {
        ...mockBffEnv.oidc,
        authorizationCodeGrant: vi.fn().mockResolvedValue({ claims: () => null }),
      },
    });
    const result = await handleCallback(env, baseParams);
    expect(result.tag).toBe('no-id-token');
  });

  it('returns oidc-error when authorizationCodeGrant throws', async () => {
    const env = makeBffEnv({
      oidc: {
        ...mockBffEnv.oidc,
        authorizationCodeGrant: vi.fn().mockRejectedValue(new Error('OIDC failed')),
      },
    });
    const result = await handleCallback(env, baseParams);
    expect(result.tag).toBe('oidc-error');
  });

  it('returns success with session token on happy path', async () => {
    const env = makeBffEnv({
      oidc: {
        ...mockBffEnv.oidc,
        authorizationCodeGrant: vi.fn().mockResolvedValue({ claims: () => baseClaims }),
      },
    });
    const result = await handleCallback(env, baseParams);
    expect(result.tag).toBe('success');
    if (result.tag === 'success') {
      expect(result.sessionToken).toBe('mock-session-token');
      expect(result.isPopup).toBe(false);
    }
  });

  it('builds session name from name claim', async () => {
    const env = makeBffEnv({
      oidc: {
        ...mockBffEnv.oidc,
        authorizationCodeGrant: vi.fn().mockResolvedValue({
          claims: () => ({ ...baseClaims, name: 'Full Name' }),
        }),
      },
    });
    const result = await handleCallback(env, baseParams);
    expect(result.tag).toBe('success');
    expect(mockBffEnv.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Full Name' }),
    );
  });

  it('falls back to given_name + family_name when name absent', async () => {
    const env = makeBffEnv({
      oidc: {
        ...mockBffEnv.oidc,
        authorizationCodeGrant: vi.fn().mockResolvedValue({
          claims: () => ({
            sub: 'user-123',
            email: 'test@example.com',
            given_name: 'John',
            family_name: 'Doe',
          }),
        }),
      },
    });
    await handleCallback(env, baseParams);
    expect(mockBffEnv.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'John Doe' }),
    );
  });

  it('falls back to sub when all name claims absent', async () => {
    const env = makeBffEnv({
      oidc: {
        ...mockBffEnv.oidc,
        authorizationCodeGrant: vi.fn().mockResolvedValue({
          claims: () => ({
            sub: 'user-123',
            email: 'test@example.com',
          }),
        }),
      },
    });
    await handleCallback(env, baseParams);
    expect(mockBffEnv.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'user-123' }),
    );
  });
});

// ── resolveSession ────────────────────────────────────────────────────────────

describe('resolveSession', () => {
  it('returns authenticated with dev identity when authDisabled=true', async () => {
    const result = await resolveSession(mockBffEnv, 'any-token', true);
    expect(result.tag).toBe('authenticated');
    if (result.tag === 'authenticated') {
      expect(result.session).toEqual(mockBffEnv.devIdentity);
    }
  });

  it('returns missing when token is undefined and auth enabled', async () => {
    const result = await resolveSession(mockBffEnv, undefined, false);
    expect(result.tag).toBe('missing');
  });

  it('returns expired when session.verify returns null', async () => {
    const env = makeBffEnv({
      session: {
        ...mockBffEnv.session,
        verify: vi.fn().mockResolvedValue(null),
      },
    });
    const result = await resolveSession(env, 'expired-token', false);
    expect(result.tag).toBe('expired');
  });

  it('returns authenticated with session when token valid', async () => {
    const result = await resolveSession(mockBffEnv, 'valid-token', false);
    expect(result.tag).toBe('authenticated');
    if (result.tag === 'authenticated') {
      expect(result.session).toEqual(mockSession);
    }
    expect(mockBffEnv.session.verify).toHaveBeenCalledWith('valid-token');
  });
});

// ── handleProxy ───────────────────────────────────────────────────────────────

function getLastFetchInit(env: BffEnvironment): RequestInit | undefined {
  return vi.mocked(env.fetch).mock.calls.at(-1)?.[1];
}

function getLastFetchHeaders(env: BffEnvironment): Record<string, string> {
  return getLastFetchInit(env)?.headers as Record<string, string>;
}

describe('handleProxy', () => {
  const baseRequest: ProxyRequest = {
    method: 'GET',
    path: '/api/hello',
    search: '',
    sessionToken: 'valid-token',
    body: undefined,
  };

  it('returns unauthorized when session is missing', async () => {
    const env = makeBffEnv({
      session: { ...mockBffEnv.session, verify: vi.fn().mockResolvedValue(null) },
    });
    const result = await handleProxy(env, { ...baseRequest, sessionToken: undefined }, false);
    expect(result.tag).toBe('unauthorized');
  });

  it('returns expired when session is expired', async () => {
    const env = makeBffEnv({
      session: { ...mockBffEnv.session, verify: vi.fn().mockResolvedValue(null) },
    });
    const result = await handleProxy(env, baseRequest, false);
    expect(result.tag).toBe('expired');
  });

  it('calls bffEnv.fetch with correct upstream URL', async () => {
    await handleProxy(mockBffEnv, baseRequest, false);
    expect(mockBffEnv.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/hello',
      expect.anything(),
    );
  });

  it('calls bffEnv.fetch with correct method', async () => {
    await handleProxy(mockBffEnv, { ...baseRequest, method: 'POST' }, false);
    expect(mockBffEnv.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('forwards session identity headers', async () => {
    await handleProxy(mockBffEnv, baseRequest, false);
    const headers = getLastFetchHeaders(mockBffEnv);
    expect(headers['x-arbor-sub']).toBe(mockSession.sub);
    expect(headers['x-arbor-name']).toBe(mockSession.name);
    expect(headers['x-arbor-email']).toBe(mockSession.email);
  });

  it('includes body for POST requests', async () => {
    const body = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    await handleProxy(mockBffEnv, { ...baseRequest, method: 'POST', body }, false);
    expect(mockBffEnv.fetch).toHaveBeenCalledWith(
      expect.anything(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ body: expect.any(ArrayBuffer) }),
    );
  });

  it('does not include body for GET requests', async () => {
    const body = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    await handleProxy(mockBffEnv, { ...baseRequest, method: 'GET', body }, false);
    expect(getLastFetchInit(mockBffEnv)?.body).toBeUndefined();
    expect(body).not.toHaveBeenCalled();
  });

  it('does not include body for HEAD requests', async () => {
    const body = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    await handleProxy(mockBffEnv, { ...baseRequest, method: 'HEAD', body }, false);
    expect(getLastFetchInit(mockBffEnv)?.body).toBeUndefined();
    expect(body).not.toHaveBeenCalled();
  });
});
