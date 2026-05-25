import type * as oidc from 'openid-client';
import type { BffEnvironment, LoginParams } from '../env.js';

export interface LoginUrlResult {
  redirectUrl: string;
  state: string;
  codeVerifier: string;
  isPopup: boolean;
}

export function buildLoginUrl(
  env: BffEnvironment,
  config: oidc.Configuration,
  params: LoginParams,
): LoginUrlResult {
  const redirectUrl = env.oidc.buildAuthorizationUrl(config, {
    redirect_uri: params.redirectUri,
    scope: 'openid profile email',
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    redirectUrl: redirectUrl.href,
    state: params.state,
    codeVerifier: params.codeVerifier,
    isPopup: params.isPopup,
  };
}
