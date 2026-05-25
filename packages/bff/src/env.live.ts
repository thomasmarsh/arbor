import * as oidc from 'openid-client';
import { env, type BffEnvironment } from './env.js';
import { createSessionToken, verifySessionToken } from './session.js';

let _config: oidc.Configuration | undefined;

export const liveBffEnv: BffEnvironment = {
  oidc: {
    async discovery() {
      if (_config != null) return _config;
      if (env.ARBO_OIDC_ISSUER == null || env.ARBO_OIDC_CLIENT_ID == null) {
        throw new Error('OIDC not configured');
      }
      _config = await oidc.discovery(
        new URL(env.ARBO_OIDC_ISSUER),
        env.ARBO_OIDC_CLIENT_ID,
        env.ARBO_OIDC_CLIENT_SECRET,
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        env.NODE_ENV !== 'production' ? { execute: [oidc.allowInsecureRequests] } : undefined,
      );
      return _config;
    },

    async authorizationCodeGrant(config, currentUrl, checks) {
      return oidc.authorizationCodeGrant(config, currentUrl, checks);
    },

    buildEndSessionUrl(config, appUrl) {
      return oidc.buildEndSessionUrl(config, {
        post_logout_redirect_uri: appUrl,
      }).href;
    },
    randomState: oidc.randomState,
    randomPKCECodeVerifier: oidc.randomPKCECodeVerifier,
    calculatePKCECodeChallenge: oidc.calculatePKCECodeChallenge,
  },

  session: {
    verify: verifySessionToken,
    create: createSessionToken,
  },

  fetch: globalThis.fetch,

  devIdentity: {
    sub: 'dev-user',
    name: 'Dev User',
    email: 'dev@localhost',
  },
};
