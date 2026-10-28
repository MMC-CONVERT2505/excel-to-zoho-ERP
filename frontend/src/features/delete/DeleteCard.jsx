import { useState } from 'react';
import Notice from '../../components/Notice.jsx';
import ResultSummary from '../../components/ResultSummary.jsx';
import ProblemGroups from '../../components/ProblemGroups.jsx';
import { isAuthError } from '../../services/jobs.js';
import { startLogin } from '../auth/authApi.js';
import { useDelete, MAX_SELECT } from './useDelete.js';

const TYPES = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'transfer_fund', label: 'Transfer' },
];
const TONES = { deleted: 'ok', not_found: 'warn', skipped_type: 'warn', failed: 'bad', cancelled: 'warn' };
const reconnectAction = { label: 'Reconnect Zoho', onClick: startLogin };

function ProgressBar({ processed, total, deleted, failed, checking, cancelling, waiting, last, offline, onCancel }) {
  const pct = total ? Math.round((processed / total) * 100) : 0;
  return (
    <div className="import-progress">
      <div className="import-progress-label">
        <span>
          {cancelling
            ? 'Cancelling — finishing the current entry…'
            : checking
              ? `Checking ${total} entries in Zoho…`
              : <>Deleting… <b>{deleted}</b> deleted{failed > 0 && <> · <b>{failed}</b> not deleted</>} · <b>{total - processed}</b> remaining of {total}</>}
        </span>
        <span className="progress-right">
          <strong>{pct}%</strong>
          {!cancelling && <button type="button" className="link-button" onClick={onCancel}>Cancel</button>}
        </span>
      </div>
      <div className="import-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={processed}>
        <div className={`import-progress-fill${waiting || offline ? ' paused' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      {last && <p className="progress-note">Last deleted: <b>{last}</b></p>}
      {waiting && <p className="progress-note warn">⏸ {waiting}</p>}
      {offline && <p className="progress-note warn">⏸ Cannot reach the backend server — still trying. The delete keeps running on the server; you can also close this page and open it later.</p>}
    </div>
  );
}

const matches = (t, q) =>
  !q || [t.reference_number, t.account_name, t.date, t.amount, t.transaction_id].some((v) => String(v ?? '').toLowerCase().includes(q));

export default function DeleteCard({ orgId }) {
  const del = useDelete(orgId);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = (del.items || []).filter((t) => matches(t, q));
  const allVisibleSelected = visible.length > 0 && visible.every((t) => del.selected.has(t.transaction_id));
  const r = del.result;
  const problems = r ? r.results.filter((x) => x.status !== 'deleted') : [];
  const needsReconnect = isAuthError(del.error) || problems.some((x) => x.reconnect);

  return (
    <section className="dashboard-card">
      <div className="card-heading">
        <div>
          <h3>Bank transactions delete</h3>
          <p>Choose a type to load all its entries from Zoho. Only the entries you select will be deleted.</p>
        </div>
        {del.type && (
          <button className="ghost-button" type="button" onClick={del.reload} disabled={del.loading || del.deleting}>
            {del.loading ? 'Loading…' : 'Refresh'}
          </button>
        )}
      </div>

      <Notice notice={del.error && { type: 'error', text: del.error, ...(needsReconnect && { action: reconnectAction }) }} />
      {!orgId && <p>Waiting for an organization to be selected.</p>}

      <div className="delete-toolbar">
        <label className="field">
          <span>Type</span>
          <select value={del.type} onChange={(e) => del.setType(e.target.value)} disabled={!orgId || del.deleting}>
            <option value="">— Select —</option>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {del.items && (
          <label className="field grow">
            <span>Search</span>
            <input type="search" placeholder="Reference, account, date, amount…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        )}
      </div>

      {del.progress && <ProgressBar {...del.progress} onCancel={del.cancel} />}

      {r && (
        <>
          <ResultSummary
            title={r.cancelled ? 'Delete cancelled' : 'Delete complete'}
            items={[
              { label: 'Total', value: r.total, always: true },
              { label: 'Deleted', value: r.deleted, tone: 'ok' },
              { label: 'Not found', value: r.not_found, tone: 'warn' },
              { label: 'Skipped type', value: r.skipped_type, tone: 'warn' },
              { label: 'Failed', value: r.failed, tone: 'bad' },
              { label: 'Cancelled', value: r.cancelled, tone: 'warn' },
            ]}
          />
          <Notice
            notice={problems.length
              ? { type: 'warn', text: `${r.deleted} deleted, ${problems.length} not deleted — see the reasons below. The list has been refreshed; select them again to retry.`, ...(needsReconnect && { action: reconnectAction }) }
              : { type: 'ok', text: `Done — ${r.deleted} ${r.deleted === 1 ? 'entry' : 'entries'} deleted from Zoho.` }}
          />
          <ProblemGroups
            title="Not deleted (grouped)"
            items={problems.map((x) => ({
              ref: x.reference_number || x.transaction_id,
              message: `${x.message}${x.zoho_code !== undefined ? ` (code ${x.zoho_code})` : ''}`,
              tone: TONES[x.status],
            }))}
          />
        </>
      )}

      {del.loading && !del.items && <p className="hint">Loading entries from Zoho…</p>}

      {del.items && (
        <>
          <div className="card-actions selection-bar">
            <span>
              <b>{del.selected.size}</b> selected · {visible.length} shown{q ? ` (of ${del.items.length})` : ''}
              {del.selected.size >= MAX_SELECT && ` · max ${MAX_SELECT} at a time`}
            </span>
            <button className="primary-button danger" type="button" onClick={del.runDelete} disabled={!del.selected.size || del.deleting || del.loading}>
              {del.deleting ? 'Deleting…' : `Delete selected (${del.selected.size})`}
            </button>
          </div>

          {visible.length === 0 ? (
            <p className="hint">No entries found.</p>
          ) : (
            <div className="table-wrap tall">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="check">
                      <input
                        type="checkbox"
                        aria-label="Select all shown entries"
                        checked={allVisibleSelected}
                        disabled={del.deleting}
                        onChange={(e) => del.toggleMany(visible.map((t) => t.transaction_id), e.target.checked)}
                      />
                    </th>
                    <th>Date</th><th>Reference</th><th>Amount</th><th>Accounts</th><th>Zoho status</th><th>Transaction ID</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.transaction_id} className={del.selected.has(t.transaction_id) ? 'selected' : ''} onClick={() => !del.deleting && del.toggle(t.transaction_id)}>
                      <td className="check">
                        <input type="checkbox" checked={del.selected.has(t.transaction_id)} disabled={del.deleting} onChange={() => del.toggle(t.transaction_id)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td>{t.date || '—'}</td>
                      <td className="mono">{t.reference_number || '—'}</td>
                      <td>{t.amount} {t.currency_code || ''}</td>
                      <td>{t.account_name || '—'}</td>
                      <td>{t.zoho_status || '—'}</td>
                      <td className="mono">{t.transaction_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
