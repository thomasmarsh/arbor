import {
  env,
  type AuthResponse,
  type BffEnvironment,
  type CallbackParams,
  type CallbackResult,
  type ProxyRequest,
  type SessionResult,
} from '../env.js';
import { buildLoginUrl } from './login.js';

export async function handleCallback(
  bffEnv: BffEnvironment,
  params: CallbackParams,
): Promise<CallbackResult> {
  if (params.expectedState == null || params.codeVerifier == null) {
    return { tag: 'missing-state' };
  }

  try {
    const config = await bffEnv.oidc.discovery();
    const tokens = await bffEnv.oidc.authorizationCodeGrant(config, params.currentUrl, {
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

    const sessionToken = await bffEnv.session.create(session);
    return { tag: 'success', sessionToken, isPopup: params.isPopup };
  } catch (error) {
    return { tag: 'oidc-error', error };
  }
}

export async function resolveSession(
  bffEnv: BffEnvironment,
  token: string | undefined,
  authDisabled: boolean,
): Promise<SessionResult> {
  if (authDisabled) {
    return { tag: 'authenticated', session: bffEnv.devIdentity };
  }
  if (token == null) return { tag: 'missing' };
  const session = await bffEnv.session.verify(token);
  if (session == null) return { tag: 'expired' };
  return { tag: 'authenticated', session };
}

export async function handleProxy(
  bffEnv: BffEnvironment,
  request: ProxyRequest,
  authDisabled: boolean,
): Promise<AuthResponse> {
  const sessionResult = await resolveSession(bffEnv, request.sessionToken, authDisabled);

  switch (sessionResult.tag) {
    case 'missing':
      return { tag: 'unauthorized' };
    case 'expired':
      return { tag: 'expired' };
    case 'authenticated': {
      const { session } = sessionResult;
      const url = `${env.ARBO_API_URL}${request.path}${request.search}`;
      const res = await bffEnv.fetch(url, {
        method: request.method,
        headers: {
          'content-type': 'application/json',
          'x-arbo-sub': session.sub,
          'x-arbo-name': session.name,
          'x-arbo-email': session.email,
        },
        ...(request.body != null ? { body: await request.body() } : {}),
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
  bffEnv: BffEnvironment,
  request: LoginRequest,
): Promise<LoginResult> {
  const config = await bffEnv.oidc.discovery();
  const state = bffEnv.oidc.randomState();
  const codeVerifier = bffEnv.oidc.randomPKCECodeVerifier();
  const codeChallenge = await bffEnv.oidc.calculatePKCECodeChallenge(codeVerifier);

  return buildLoginUrl(config, {
    state,
    codeVerifier,
    codeChallenge,
    redirectUri: request.redirectUri,
    isPopup: request.isPopup,
  });
}
