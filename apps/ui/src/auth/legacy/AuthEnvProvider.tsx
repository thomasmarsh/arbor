import { useEffect, useRef } from 'react';
import { useAuth as useOidcAuth } from 'react-oidc-context';
import { uiEnv } from '../../env';
import { UserSchema } from '../auth.schemas';
import { authStore } from '../auth.store';

export const authMode = uiEnv.VITE_AUTH_MODE;

export function AuthEnvProvider({ children }: { children: React.ReactNode }) {
  switch (authMode) {
    case 'bff':
      return <BffAuthEnvProvider>{children}</BffAuthEnvProvider>;
    case 'oidc':
      return <OidcAuthEnvProvider>{children}</OidcAuthEnvProvider>;
    case 'mock':
      return <MockAuthEnvProvider>{children}</MockAuthEnvProvider>;
    default:
      return <MockAuthEnvProvider>{children}</MockAuthEnvProvider>;
  }
}

function MockAuthEnvProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    authStore.send({
      tag: 'loaded',
      user: { sub: 'dev-user', name: 'Dev User', email: 'dev@localhost' },
    });
  }, []);

  return <div>{children}</div>;
}

function OidcAuthEnvProvider({ children }: { children: React.ReactNode }) {
  const oidc = useOidcAuth();

  useEffect(() => {
    if (oidc.isLoading) return;
    if (oidc.isAuthenticated && oidc.user) {
      authStore.send({
        tag: 'loaded',
        user: {
          sub: oidc.user.profile.sub,
          name:
            (oidc.user.profile.name ??
              `${oidc.user.profile.given_name ?? ''} ${oidc.user.profile.family_name ?? ''}`.trim()) ||
            oidc.user.profile.sub,
          email: oidc.user.profile.email ?? '',
        },
      });
    } else {
      void oidc.signinRedirect();
    }
  }, [oidc.isLoading, oidc.isAuthenticated, oidc.user]);

  if (!oidc.isAuthenticated) {
    return <p>Signing in...</p>;
  }

  return <>{children}</>;
}

function BffAuthEnvProvider({ children }: { children: React.ReactNode }) {
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    fetch('/auth/me')
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = '/auth/login';
          return;
        }
        const user = UserSchema.parse(await res.json());
        authStore.send({ tag: 'loaded', user });
      })
      .catch(() => {
        window.location.href = '/auth/login';
      });
  }, []);

  return <>{children}</>;
}
