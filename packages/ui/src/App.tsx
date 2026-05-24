// packages/ui/src/App.tsx
import { useEffect } from 'react';
import { AuthProvider } from 'react-oidc-context';
import { authStore } from './auth/auth.store.js';
import { AuthEnvProvider } from './auth/legacy/AuthEnvProvider.js';
import { ReauthModal } from './auth/ReauthModal.js';
import { useAuth } from './auth/useAuth.js';
import { Counter } from './Counter.js';

const oidcConfig = {
  authority: 'https://your-idp.example.com',
  client_id: 'your-client-id',
  redirect_uri: window.location.origin,
  scope: 'openid profile email',
};

function App() {
  const { state } = useAuth();

  useEffect(() => {
    authStore.send({ tag: 'load' });
  }, []);

  if (state.tag === 'loading') {
    return <p>Loading...</p>;
  }

  if (state.tag === 'unauthenticated') {
    return <p>Please log in.</p>; // or redirect to /auth/login
  }

  return (
    <main>
      <AuthProvider {...oidcConfig}>
        <AuthEnvProvider>
          <h1>Arbo</h1>
          <Counter />
          {state.tag === 'reauthing' && <ReauthModal />}
        </AuthEnvProvider>
      </AuthProvider>
    </main>
  );
}

export default App;
