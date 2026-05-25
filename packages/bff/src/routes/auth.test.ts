import { describe, expect, it, vi } from 'vitest';
import { makeBffEnv, mockBffEnv, mockSession } from '../testing/fixtures.js';
import { createAuthRouter } from './auth.js';

// ── GET /auth/me ──────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  it('returns 401 with no cookie', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/me');
    expect(res.status).toBe(401);
  });

  it('returns dev user when ARBO_AUTH_DISABLED=true', async () => {
    const env = makeBffEnv({
      config: { ...mockBffEnv.config, ARBO_AUTH_DISABLED: true },
    });
    const app = createAuthRouter(env);
    const res = await app.request('/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockBffEnv.devIdentity);
  });

  it('returns 401 and clears cookie when session expired', async () => {
    const env = makeBffEnv({
      session: { ...mockBffEnv.session, verify: vi.fn().mockResolvedValue(null) },
    });
    const app = createAuthRouter(env);
    const res = await app.request('/me', {
      headers: { cookie: 'arbo_session=expired-token' },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toContain('arbo_session=;');
  });

  it('returns session when token valid', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/me', {
      headers: { cookie: `arbo_session=valid-token` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSession);
  });
});

// ── GET /auth/login ───────────────────────────────────────────────────────────

describe('GET /auth/login', () => {
  it('redirects to ARBO_APP_URL when auth disabled', async () => {
    const env = makeBffEnv({
      config: { ...mockBffEnv.config, ARBO_AUTH_DISABLED: true },
    });
    const app = createAuthRouter(env);
    const res = await app.request('/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(mockBffEnv.config.ARBO_APP_URL);
  });

  it('sets arbo_state cookie', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/login');
    expect(res.headers.get('set-cookie')).toContain('arbo_state=mock-state');
  });

  it('sets arbo_pkce cookie', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/login');
    expect(res.headers.get('set-cookie')).toContain('arbo_pkce=mock-verifier');
  });

  it('sets arbo_popup cookie when ?popup=true', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/login?popup=true');
    expect(res.headers.get('set-cookie')).toContain('arbo_popup=true');
  });

  it('does not set arbo_popup cookie when ?popup absent', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/login');
    expect(res.headers.get('set-cookie')).not.toContain('arbo_popup');
  });

  it('redirects to OIDC authorization URL', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://idp/auth?mock=true');
  });
});

// ── GET /auth/callback ────────────────────────────────────────────────────────

describe('GET /auth/callback', () => {
  const callbackUrl = '/callback?code=123&state=mock-state&session_state=abc';

  const withStateCookies = {
    headers: {
      cookie: 'arbo_state=mock-state; arbo_pkce=mock-verifier',
    },
  };

  const withPopupCookies = {
    headers: {
      cookie: 'arbo_state=mock-state; arbo_pkce=mock-verifier; arbo_popup=true',
    },
  };

  it('returns 400 when state cookie missing', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request(callbackUrl);
    expect(res.status).toBe(400);
  });

  it('sets session cookie on success', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request(callbackUrl, withStateCookies);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith('arbo_session=mock-session-token'))).toBe(true);
  });

  it('sets session cookie on success', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request(callbackUrl, withStateCookies);
    expect(res.headers.get('set-cookie')).toContain('arbo_session=mock-session-token');
  });

  it('returns popup HTML when arbo_popup cookie set', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request(callbackUrl, withPopupCookies);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('reauth-complete');
    expect(body).toContain('window.close()');
  });

  it('redirects to ARBO_APP_URL on success', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request(callbackUrl, withStateCookies);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(mockBffEnv.config.ARBO_APP_URL);
  });

  it('clears transient cookies after callback', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request(callbackUrl, withStateCookies);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith('arbo_state=;'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('arbo_pkce=;'))).toBe(true);
  });
});

// ── GET /auth/logout ──────────────────────────────────────────────────────────

describe('GET /auth/logout', () => {
  it('clears session cookie', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/logout', {
      headers: { cookie: 'arbo_session=some-token' },
    });
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith('arbo_session=;'))).toBe(true);
  });

  it('redirects to ARBO_APP_URL when auth disabled', async () => {
    const env = makeBffEnv({
      config: { ...mockBffEnv.config, ARBO_AUTH_DISABLED: true },
    });
    const app = createAuthRouter(env);
    const res = await app.request('/logout');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(mockBffEnv.config.ARBO_APP_URL);
  });

  it('redirects to OIDC end session URL when auth enabled', async () => {
    const app = createAuthRouter(mockBffEnv);
    const res = await app.request('/logout');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://idp/logout');
  });
});
