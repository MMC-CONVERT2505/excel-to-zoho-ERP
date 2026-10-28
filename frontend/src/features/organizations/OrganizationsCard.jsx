import { useState } from 'react';
import { getOrganizations } from './organizationsApi.js';

export default function OrganizationsCard({ onError }) {
  const [orgs, setOrgs] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getOrganizations();
      setOrgs(data.organizations || []);
    } catch (e) {
      onError(e.message);
    }
    setLoading(false);
  };

  return (
    <section className="panel">
      <h2>Test connection</h2>
      <p className="sub">Fetch your organization ID and check that the token works.</p>
      <div className="actions">
        <button onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Fetch organizations'}
        </button>
      </div>

      {orgs &&
        (orgs.length === 0 ? (
          <p className="hint">No organizations found.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Organization ID</th>
                  <th>Currency</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.organization_id}>
                    <td>{o.name}</td>
                    <td className="mono">{o.organization_id}</td>
                    <td>{o.currency_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              Put this ID in <code>ZOHO_ORG_ID</code> in backend/.env.
            </p>
          </>
        ))}
    </section>
  );
}
