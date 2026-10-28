import ConnectCard from '../features/auth/ConnectCard.jsx';
import Notice from '../components/Notice.jsx';
import BrandMark from '../components/BrandMark.jsx';

export default function HomePage({ auth }) {
  const { status, notice, busy, connect, disconnect } = auth;

  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Excel to Zoho ERP home">
          <BrandMark className="brand-mark" />
          <span>Excel <b>to</b> Zoho ERP</span>
        </a>
        <span className="header-status"><i /> {status === null ? 'Checking connection' : 'Not connected'}</span>
      </header>

      <main className="home-page">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-dot" /> SIMPLE DATA MIGRATION</span>
            <h1>Excel to <span>Zoho ERP</span></h1>
            <p className="hero-subtitle">Move your spreadsheet data forward.</p>
            <p className="hero-description">Connect your Zoho ERP account to continue to your secure migration workspace.</p>

            <div className="home-connect-card">
              <div className="home-connect-heading">
                <span className="home-connect-icon">Z</span>
                <span><strong>Connect Zoho ERP</strong><small>Authorize your Zoho account to open the dashboard.</small></span>
              </div>
              <Notice notice={notice} />
              <ConnectCard status={status} busy={busy} onConnect={connect} onDisconnect={disconnect} />
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-card">
              <div className="art-card-heading"><span>YOUR DATA WORKFLOW</span><span className="ready"><i /> READY</span></div>
              <div className="workflow">
                <div className="workflow-tile excel-tile"><div className="tile-symbol">X</div><strong>Excel</strong><small>Source file</small></div>
                <div className="workflow-arrow"><span />›</div>
                <div className="workflow-tile zoho-tile"><div className="tile-symbol">Z</div><strong>Zoho ERP</strong><small>Destination</small></div>
              </div>
              <div className="art-card-footer"><span className="footer-check">✓</span><span>One clear path for your business data</span></div>
            </div>
            <div className="floating-chip"><span>✓</span> Connect securely to continue</div>
          </div>
        </section>

        <footer className="page-footer"><span>Excel to Zoho ERP</span><span>Data migration workspace</span></footer>
      </main>
    </>
  );
}
