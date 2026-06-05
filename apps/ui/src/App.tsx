import { useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { AuthProvider } from 'react-oidc-context';
import IconButton from '@mui/material/IconButton';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { authStore } from './auth/auth.store.js';
import { AuthEnvProvider, authMode } from './auth/legacy/AuthEnvProvider.js';
import { ReauthModal } from './auth/ReauthModal.js';
import { useAuth } from './auth/useAuth.js';
import { Counter } from './Counter.js';
import { uiEnv } from './env.js';
import { LedgerTable } from './ledger/LedgerTable.js';
import { themeStore, toggleTheme } from './theme.store.js';

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
  const { mode } = useSnapshot(themeStore);

  useEffect(() => {
    if (authMode !== 'bff') {
      authStore.send({ tag: 'load' });
    }
  }, []);

  return (
    <main>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Arbor</h1>
        <IconButton onClick={toggleTheme} size="small" aria-label="toggle light/dark mode">
          {mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
        </IconButton>
      </div>
      {state.tag === 'reauthing' && <ReauthModal />}
      {state.tag === 'loading' && <p>Loading...</p>}
      {state.tag === 'unauthenticated' && <p>Please log in.</p>}
      {state.tag === 'authenticated' && (
        <Providers>
          <Counter />
        </Providers>
      )}
      <LedgerTable />
    </main>
  );
}

export default App;
