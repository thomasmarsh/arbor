// packages/ui/src/auth/ReauthModal.tsx
import { useEffect } from 'react';
import { ReauthCompleteMessageSchema } from './auth.schemas.js';
import { authStore } from './auth.store.js';

export function ReauthModal() {
  useEffect(() => {
    const popup = window.open('/auth/login?popup=true', '_blank', 'width=500,height=600');

    const listener = (e: MessageEvent<unknown>) => {
      if (e.origin !== window.origin) return;
      const parsed = ReauthCompleteMessageSchema.safeParse(e.data);
      if (parsed.success) {
        window.removeEventListener('message', listener);
        popup?.close();
        authStore.send({ tag: 'reauth-complete' });
      }
    };

    window.addEventListener('message', listener);

    return () => {
      window.removeEventListener('message', listener);
      popup?.close();
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px' }}>
        <p>Your session has expired. Please log in again.</p>
        <p>A login window has been opened.</p>
      </div>
    </div>
  );
}
