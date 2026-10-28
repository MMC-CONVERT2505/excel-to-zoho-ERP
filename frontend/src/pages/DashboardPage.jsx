import { useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout.jsx';
import Notice from '../components/Notice.jsx';
import { useOrganizations } from '../features/organizations/useOrganizations.js';
import ImportCard from '../features/import/ImportCard.jsx';
import DeleteCard from '../features/delete/DeleteCard.jsx';

const NAV = [
  { key: 'overview', label: 'Overview', icon: '◎', title: 'Overview' },
  { key: 'deposits', label: 'Deposit import', icon: '⇪', title: 'Deposit import' },
  { key: 'transfers', label: 'Transfer import', icon: '⇄', title: 'Transfer import' },
  { key: 'delete', label: 'Delete', icon: '✕', title: 'Delete bank transactions' },
];

export default function DashboardPage({ auth }) {
  const org = useOrganizations();
  const { organizations } = org;
  const [active, setActive] = useState('overview');
  const current = NAV.find((n) => n.key === active) || NAV[0];

  return (
    <DashboardLayout
      kicker="DASHBOARD"
      title={current.title}
      busy={auth.busy}
      onDisconnect={auth.disconnect}
      nav={NAV}
      active={active}
      onNavigate={setActive}
      org={org}
    >
      <Notice notice={auth.notice} />

      {active === 'deposits' && (
        <ImportCard
          key="deposits"
          kind="deposits"
          orgId={org.selectedId}
          title="Deposit import"
          description="Create bank deposits in Zoho from Excel. Validate first, then import."
          template="/deposit-template.xlsx"
        />
      )}
      {active === 'transfers' && (
        <ImportCard
          key="transfers"
          kind="transfers"
          orgId={org.selectedId}
          title="Transfer import"
          description="Create account-to-account fund transfers in Zoho from Excel. Validate first, then import."
          template="/transfer-template.xlsx"
        />
      )}

      {active === 'delete' && <DeleteCard orgId={org.selectedId} />}

      {active === 'overview' && (
        <section className="dashboard-card">
          <div className="card-heading">
            <div>
              <h3>Zoho organizations</h3>
              <p>Organizations in your connected Zoho ERP account.</p>
            </div>
            <button className="ghost-button" type="button" onClick={org.refresh}>Refresh</button>
          </div>
          <Notice notice={org.error && { type: 'error', text: org.error }} />
          {organizations === null ? (
            <p>Loading…</p>
          ) : organizations.length === 0 ? (
            !org.error && <p>No organizations found.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Organization ID</th><th>Currency</th></tr>
              </thead>
              <tbody>
                {organizations.map((o) => (
                  <tr key={o.organization_id}>
                    <td>{o.name}</td>
                    <td className="mono">{o.organization_id}</td>
                    <td>{o.currency_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </DashboardLayout>
  );
}
