export function ReauthModal() {
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
