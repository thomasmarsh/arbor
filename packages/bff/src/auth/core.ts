import type {
  AuthResponse,
  BffEnvironment,
  CallbackParams,
  CallbackResult,
  ProxyRequest,
  SessionResult,
} from '../env.js';
import { buildLoginUrl } from './login.js';

export async function handleCallback(
  env: BffEnvironment,
  params: CallbackParams,
): Promise<CallbackResult> {
  if (params.expectedState == null || params.codeVerifier == null) {
    return { tag: 'missing-state' };
  }

  try {
    const config = await env.oidc.discovery();
    const tokens = await env.oidc.authorizationCodeGrant(config, params.currentUrl, {
      pkceCodeVerifier: params.codeVerifier,
      expectedState: params.expectedState,
      idTokenExpected: true,
    });

    const claims = tokens.claims();
    if (claims == null) return { tag: 'no-id-token' };

    const session = {
      sub: claims.sub,
      name:
        ((claims['name'] as string | undefined) ??
          `${(claims['given_name'] as string | undefined) ?? ''} ${(claims['family_name'] as string | undefined) ?? ''}`.trim()) ||
        claims.sub,
      email: (claims['email'] as string | undefined) ?? '',
    };

    const sessionToken = await env.session.create(session);
    return { tag: 'success', sessionToken, isPopup: params.isPopup };
  } catch (error) {
    return { tag: 'oidc-error', error };
  }
}

export async function resolveSession(
  env: BffEnvironment,
  token: string | undefined,
  authDisabled: boolean,
): Promise<SessionResult> {
  if (authDisabled) {
    return { tag: 'authenticated', session: env.devIdentity };
  }
  if (token == null) return { tag: 'missing' };
  const session = await env.session.verify(token);
  if (session == null) return { tag: 'expired' };
  return { tag: 'authenticated', session };
}

export async function handleProxy(
  env: BffEnvironment,
  request: ProxyRequest,
  authDisabled: boolean,
): Promise<AuthResponse> {
  const sessionResult = await resolveSession(env, request.sessionToken, authDisabled);

  switch (sessionResult.tag) {
    case 'missing':
      return { tag: 'unauthorized' };
    case 'expired':
      return { tag: 'expired' };
    case 'authenticated': {
      const { session } = sessionResult;
      const url = `${env.config.ARBOR_API_URL}${request.path}${request.search}`;

      const isBodyMethod = request.method !== 'GET' && request.method !== 'HEAD';

      // Explicitly construct headers from session — never forward x-arbor-* from
      // the incoming request since a client could spoof identity that way.
      const res = await env.fetch(url, {
        method: request.method,
        headers: {
          'content-type': 'application/json',
          'x-arbor-sub': session.sub,
          'x-arbor-name': session.name,
          'x-arbor-email': session.email,
        },
        ...(isBodyMethod && request.body != null ? { body: await request.body() } : {}),
      });
      return {
        tag: 'ok',
        status: res.status,
        headers: res.headers,
        body: res.body,
      };
    }
  }
}

export interface LoginRequest {
  isPopup: boolean;
  redirectUri: string;
}

export interface LoginResult {
  redirectUrl: string;
  state: string;
  codeVerifier: string;
  isPopup: boolean;
}

export async function handleLogin(
  env: BffEnvironment,
  request: LoginRequest,
): Promise<LoginResult> {
  const config = await env.oidc.discovery();
  const state = env.oidc.randomState();
  const codeVerifier = env.oidc.randomPKCECodeVerifier();
  const codeChallenge = await env.oidc.calculatePKCECodeChallenge(codeVerifier);

  return buildLoginUrl(env, config, {
    state,
    codeVerifier,
    codeChallenge,
    redirectUri: request.redirectUri,
    isPopup: request.isPopup,
  });
}
