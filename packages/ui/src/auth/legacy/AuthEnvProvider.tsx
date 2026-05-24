import { Effect, Result } from '@arbo/common';
import { UnauthorizedError, type HttpError } from '@arbo/common/http';
import { useEffect, useMemo } from 'react';
import { useAuth, type AuthContextProps } from 'react-oidc-context';
import { httpClient } from '../../api/auth.interceptor';
import { mockAuthEnv, type AuthEnv, type User } from '../auth.env';
import { authReducer, authStore } from '../auth.store';

export function makeOidcAuthEnv(oidc: AuthContextProps): AuthEnv {
  if (import.meta.env.DEV) return mockAuthEnv;
  return {
    getUser: Effect.of((send) => {
      if (oidc.user) {
        send(
          Result.success({
            sub: oidc.user.profile.sub,
            name: oidc.user.profile.name ?? oidc.user.profile.sub,
            email: oidc.user.profile.email ?? '',
          }),
        );
      } else {
        send(Result.failure<User, HttpError>(new UnauthorizedError()));
      }
    }),
    logout: Effect.of((_send) => {
      void oidc.signoutRedirect();
    }),
    openReauthPopup: Effect.of((_send) => {
      void oidc.signinPopup();
    }),
    resolveReauth: Effect.of((_send) => {
      httpClient.resolveReauth();
    }),
  };
}

export function AuthEnvProvider({ children }: { children: React.ReactNode }) {
  const oidc = useAuth();
  const env = useMemo(() => makeOidcAuthEnv(oidc), [oidc]);

  useEffect(() => {
    authStore.setDependencies(authReducer, env);
    authStore.send({ tag: 'load' });
  }, [env]);

  return <>{children}</>;
}
