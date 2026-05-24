// packages/ui/src/auth/useAuth.ts
import { useSnapshot } from 'valtio';
import type { Send } from '../../../common/src/store/effect.js';
import { authStore, type AuthAction, type AuthState } from './auth.store.js';

export function useAuth(): { state: AuthState; send: Send<AuthAction> } {
  const snapshot = useSnapshot(authStore.getProxyState());
  return {
    state: snapshot.state,
    send: authStore.send,
  };
}
