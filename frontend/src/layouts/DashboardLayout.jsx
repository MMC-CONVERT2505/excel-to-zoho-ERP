import BrandMark from '../components/BrandMark.jsx';
import HelpButton from '../components/HelpButton.jsx';

export default function DashboardLayout({ title, kicker, busy, onDisconnect, nav, active, onNavigate, org, children }) {
  const orgs = org?.organizations;
  const orgName = org?.selected?.name || (orgs === null ? 'Loading…' : 'No organization');

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand-block">
          <BrandMark className="sidebar-logo" />
          <div className="sidebar-company">Excel <b>to</b> Zoho ERP</div>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <div className="sidebar-section-label">WORKSPACE</div>
          {nav.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sidebar-link ${item.key === active ? 'active' : ''}`}
              aria-current={item.key === active ? 'page' : undefined}
              onClick={() => onNavigate(item.key)}
            >
              <span className="sidebar-link-icon" aria-hidden="true">{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-connection"><span className="connection-dot" /> Zoho connected</div>
          <div className="sidebar-company-profile">
            <div className="company-avatar">{org?.selected?.name?.[0]?.toUpperCase() || 'Z'}</div>
            <div className="company-profile-text">
              {orgs?.length > 1 ? (
                <select
                  className="sidebar-org-select"
                  aria-label="Zoho organization"
                  value={org.selectedId || ''}
                  onChange={(e) => org.select(e.target.value)}
                >
                  {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.name}</option>)}
                </select>
              ) : (
                <strong title={orgName}>{orgName}</strong>
              )}
              <small>{org?.selectedId ? `ID ${org.selectedId}` : 'Zoho connected'}</small>
            </div>
          </div>
          <button className="sidebar-disconnect" type="button" onClick={onDisconnect} disabled={busy}>
            <span aria-hidden="true">↪</span> {busy ? 'Disconnecting…' : 'Disconnect Zoho'}
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <div className="topbar-kicker">{kicker}</div>
            <h2>{title}</h2>
          </div>
          <div className="topbar-status"><span className="connection-dot" /> Zoho connected</div>
        </header>

        <main className="dashboard-body">
          {children}
          <footer className="dashboard-footer"><span>© 2026 Excel to Zoho ERP</span><span>Secure migration workspace</span></footer>
        </main>
      </div>
      <HelpButton />
    </div>
  );
}
