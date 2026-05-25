// src/routes/auth.ts
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { handleCallback, handleLogin, resolveSession } from '../auth/core.js';
import { env } from '../env.js';
import { liveBffEnv } from '../env.live.js';
import { SESSION_COOKIE } from '../session.js';

const auth = new Hono();

const TRANSIENT_OPTS = {
  httpOnly: true,
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 600,
} as const;

const SESSION_OPTS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 60 * 60 * 8,
} as const;

auth.get('/login', async (c) => {
  if (env.ARBO_AUTH_DISABLED) return c.redirect(env.ARBO_APP_URL);

  const result = await handleLogin(liveBffEnv, {
    isPopup: c.req.query('popup') === 'true',
    redirectUri: env.ARBO_OIDC_REDIRECT_URI ?? '',
  });

  setCookie(c, 'arbo_state', result.state, TRANSIENT_OPTS);
  setCookie(c, 'arbo_pkce', result.codeVerifier, TRANSIENT_OPTS);
  if (result.isPopup) setCookie(c, 'arbo_popup', 'true', TRANSIENT_OPTS);

  return c.redirect(result.redirectUrl);
});

auth.get('/callback', async (c) => {
  const result = await handleCallback(liveBffEnv, {
    currentUrl: new URL(c.req.url),
    expectedState: getCookie(c, 'arbo_state'),
    codeVerifier: getCookie(c, 'arbo_pkce'),
    isPopup: getCookie(c, 'arbo_popup') === 'true',
  });

  deleteCookie(c, 'arbo_state', { path: '/' });
  deleteCookie(c, 'arbo_pkce', { path: '/' });
  deleteCookie(c, 'arbo_popup', { path: '/' });

  switch (result.tag) {
    case 'missing-state':
      return c.json({ error: 'Missing auth state' }, 400);
    case 'no-id-token':
      return c.json({ error: 'No ID token' }, 500);
    case 'oidc-error':
      return c.json({ error: 'Authentication failed' }, 500);
    case 'success':
      setCookie(c, SESSION_COOKIE, result.sessionToken, SESSION_OPTS);
      return result.isPopup
        ? c.html(
            `<script>window.opener?.postMessage({tag:'reauth-complete'},window.origin);window.close();</script>`,
          )
        : c.redirect(env.ARBO_APP_URL);
  }
});

auth.get('/logout', async (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  if (env.ARBO_AUTH_DISABLED) return c.redirect(env.ARBO_APP_URL);

  const config = await liveBffEnv.oidc.discovery();
  const logoutUrl = liveBffEnv.oidc.buildEndSessionUrl(config, env.ARBO_APP_URL);
  return c.redirect(logoutUrl);
});

auth.get('/me', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  const result = await resolveSession(liveBffEnv, token, env.ARBO_AUTH_DISABLED);

  switch (result.tag) {
    case 'missing':
      return c.json({ error: 'Unauthorized' }, 401);
    case 'expired':
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
      return c.json({ error: 'Session expired' }, 401);
    case 'authenticated':
      return c.json(result.session);
  }
});

export { auth };
