const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '-');

export default function ConnectCard({ status, busy, onConnect, onDisconnect }) {
  const connected = Boolean(status?.connected);

  return (
    <section className="panel">
      <div className="row">
        <span className={`dot ${connected ? 'on' : ''}`} aria-hidden="true" />
        <h2>{status === null ? 'Checking…' : connected ? 'Connected' : 'Not connected'}</h2>
      </div>

      {connected ? (
        <>
          <dl>
            <dt>Connected at</dt>
            <dd>{fmt(status.connectedAt)}</dd>
            <dt>Access token expires</dt>
            <dd>{fmt(status.accessTokenExpiresAt)}</dd>
            <dt>API domain</dt>
            <dd>{status.apiDomain}</dd>
          </dl>
          <div className="actions">
            <button className="ghost" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        status && (
          <div className="actions">
            <button onClick={onConnect}>Connect Zoho ERP</button>
          </div>
        )
      )}
    </section>
  );
}
