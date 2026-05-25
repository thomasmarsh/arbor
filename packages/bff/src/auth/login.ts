// src/auth/login.ts
import * as oidc from 'openid-client';
import type { LoginParams } from '../env.js';

export interface LoginUrlResult {
  redirectUrl: string;
  state: string;
  codeVerifier: string;
  isPopup: boolean;
}

export function buildLoginUrl(config: oidc.Configuration, params: LoginParams): LoginUrlResult {
  const redirectUrl = oidc.buildAuthorizationUrl(config, {
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
