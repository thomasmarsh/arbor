import * as oidc from 'openid-client';
import { parseProcessEnv, type BffEnvironment } from './env.js';
import { createSessionToken, verifySessionToken } from './session.js';

let _config: oidc.Configuration | undefined;

const processEnv = parseProcessEnv();

export const liveBffEnv: BffEnvironment = {
  config: processEnv,
  oidc: {
    async discovery() {
      if (_config != null) return _config;
      if (processEnv.ARBO_OIDC_ISSUER == null || processEnv.ARBO_OIDC_CLIENT_ID == null) {
        throw new Error('OIDC not configured');
      }
      _config = await oidc.discovery(
        new URL(processEnv.ARBO_OIDC_ISSUER),
        processEnv.ARBO_OIDC_CLIENT_ID,
        processEnv.ARBO_OIDC_CLIENT_SECRET,
        undefined,
        processEnv.NODE_ENV !== 'production'
          ? // eslint-disable-next-line @typescript-eslint/no-deprecated
            { execute: [oidc.allowInsecureRequests] }
          : undefined,
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
    buildAuthorizationUrl: oidc.buildAuthorizationUrl,
  },

  session: {
    verify: (token) => verifySessionToken(processEnv.ARBO_SESSION_SECRET, token),
    create: (session) => createSessionToken(processEnv.ARBO_SESSION_SECRET, session),
  },

  fetch: globalThis.fetch,

  devIdentity: {
    sub: 'dev-user',
    name: 'Dev User',
    email: 'dev@localhost',
  },
};
