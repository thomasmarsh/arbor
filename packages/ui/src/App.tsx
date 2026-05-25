import { useEffect } from 'react';
import { AuthProvider } from 'react-oidc-context';
import { authStore } from './auth/auth.store.js';
import { AuthEnvProvider, authMode } from './auth/legacy/AuthEnvProvider.js';
import { ReauthModal } from './auth/ReauthModal.js';
import { useAuth } from './auth/useAuth.js';
import { Counter } from './Counter.js';
import { uiEnv } from './env.js';

const oidcConfig = {
  authority: uiEnv.VITE_OIDC_ISSUER,
  client_id: uiEnv.VITE_OIDC_CLIENT_ID,
  redirect_uri: uiEnv.VITE_APP_URL,
  scope: 'openid profile email',
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

function Providers({ children }: { children: React.ReactNode }) {
  if (authMode === 'oidc') {
    return (
      <AuthProvider {...oidcConfig}>
        <AuthEnvProvider>{children}</AuthEnvProvider>
      </AuthProvider>
    );
  }
  return <AuthEnvProvider>{children}</AuthEnvProvider>;
}

function App() {
  const { state } = useAuth();

  useEffect(() => {
    if (authMode !== 'bff') {
      authStore.send({ tag: 'load' });
    }
  }, []);

  return (
    <main>
      <h1>Arbo</h1>
      {state.tag === 'reauthing' && <ReauthModal />}
      {state.tag === 'loading' && <p>Loading...</p>}
      {state.tag === 'unauthenticated' && <p>Please log in.</p>}
      {state.tag === 'authenticated' && (
        <Providers>
          <Counter />
        </Providers>
      )}
    </main>
  );
}

export default App;
