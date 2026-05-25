import { createPortal } from 'react-dom';
import { useSnapshot } from 'valtio';
import { authStore } from '../auth/auth.store.js';

export function DevToolbar() {
  const authSnap = useSnapshot(authStore.getProxyState());

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.9)',
        color: '#fff',
        borderRadius: '8px 0 0 0',
        fontFamily: 'monospace',
        fontSize: '12px',
        maxWidth: '400px',
      }}
    >
      {/* State explorer */}
      <details open style={{ padding: '0.5rem', borderBottom: '1px solid #333' }}>
        <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>State Explorer</summary>
        <pre style={{ margin: 0, overflowX: 'auto' }}>
          {JSON.stringify({ auth: authSnap }, null, 2)}
        </pre>
      </details>

      {/* Actions */}
      <div style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            authStore.send({ tag: 'reauth-required' });
          }}
        >
          Simulate 401
        </button>
        <button
          onClick={() => {
            window.postMessage({ tag: 'reauth-complete' }, window.origin);
          }}
        >
          reauth-complete
        </button>
        <button
          onClick={() => {
            window.postMessage({ tag: 'reauth-failed' }, window.origin);
          }}
        >
          reauth-failed
        </button>
        <button
          onClick={() => {
            authStore.send({ tag: 'logout' });
          }}
        >
          Logout
        </button>
      </div>
    </div>,
    document.body,
  );
}
