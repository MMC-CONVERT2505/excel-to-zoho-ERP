import { useState } from 'react';
import Notice from '../../components/Notice.jsx';
import FileDrop from '../../components/FileDrop.jsx';
import ResultSummary from '../../components/ResultSummary.jsx';
import ProblemGroups from '../../components/ProblemGroups.jsx';
import { isAuthError } from '../../services/jobs.js';
import { startLogin } from '../auth/authApi.js';
import { useImport } from './useImport.js';

const TONES = { valid: 'ok', created: 'ok', invalid: 'bad', failed: 'bad', skipped: 'warn', cancelled: 'warn', undone: 'neutral' };
const OK = new Set(['valid', 'created']);
const PROBLEMS = new Set(['invalid', 'failed', 'cancelled']);
const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'problems', label: 'Problems', test: (x) => PROBLEMS.has(x.status) },
  { key: 'ok', label: 'OK', test: (x) => OK.has(x.status) },
  { key: 'skipped', label: 'Skipped', test: (x) => x.status === 'skipped' || x.status === 'undone' },
];
const reconnectAction = { label: 'Reconnect Zoho', onClick: startLogin };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function ProgressBar({ processed, total, dryRun, cancelling, waiting, last, offline, onCancel }) {
  const pct = total ? Math.round((processed / total) * 100) : 0;
  return (
    <div className="import-progress">
      <div className="import-progress-label">
        <span>
          {cancelling ? 'Cancelling — finishing the current entry…' : `${dryRun ? 'Validating' : 'Importing to Zoho'}… ${processed} / ${total} rows`}
          {!dryRun && !cancelling && ` · ${total - processed} remaining`}
        </span>
        <span className="progress-right">
          <strong>{pct}%</strong>
          {!cancelling && <button type="button" className="link-button" onClick={onCancel}>Cancel</button>}
        </span>
      </div>
      <div className="import-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={processed}>
        <div className={`import-progress-fill${waiting || offline ? ' paused' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      {last && <p className="progress-note">Last created in Zoho: <b>{last}</b></p>}
      {waiting && <p className="progress-note warn">⏸ {waiting}</p>}
      {offline && <p className="progress-note warn">⏸ Cannot reach the backend server — still trying. The job keeps running on the server; you can also close this page and open it later.</p>}
    </div>
  );
}

// Kya hua aur ab kya karna hai — ek line me
function nextStep(r) {
  const skippedNote = r.skipped ? ` ${plural(r.skipped, 'row')} already exist in Zoho and will be skipped (no duplicates).` : '';
  if (r.dryRun) {
    if (r.invalid) return { type: 'error', text: `${plural(r.invalid, 'row')} need fixing before import. Click "Download failed rows" (each row has the reason), fix them in that sheet, upload it and Validate.` };
    if (!r.valid) return { type: 'warn', text: `Nothing to import.${skippedNote}` };
    return { type: 'ok', text: `All good — click "2. Import to Zoho" to create ${plural(r.valid, 'row')}.${skippedNote}` };
  }
  const bad = r.failed + r.cancelled;
  if (bad) return { type: 'warn', text: `${plural(r.created, 'row')} created, ${plural(bad, 'row')} not created. Click "Retry failed rows", or "Download failed rows" to see the reasons, fix that sheet and upload it — rows already in Zoho are skipped automatically.` };
  if (r.created) return { type: 'ok', text: `Done — ${plural(r.created, 'row')} created in Zoho (Banking). Made a mistake? Use "Undo this import".` };
  return null;
}

export default function ImportCard({ orgId, kind, title, description, template }) {
  const imp = useImport(orgId, kind);
  const [filter, setFilter] = useState('all');
  const r = imp.result;
  const results = r?.results || [];
  const problems = results.filter((x) => PROBLEMS.has(x.status));
  const shown = results.filter(FILTERS.find((f) => f.key === filter)?.test || (() => true));
  const needsReconnect = isAuthError(imp.error) || results.some((x) => x.reconnect);
  const step = r && nextStep(r);

  return (
    <section className="dashboard-card">
      <div className="card-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <a className="ghost-button" href={template} download>Template download</a>
      </div>

      <Notice notice={imp.error && { type: 'error', text: imp.error, ...(needsReconnect && { action: reconnectAction }) }} />
      <Notice notice={imp.notice} />
      {!orgId && <p>Waiting for an organization to be selected.</p>}

      <FileDrop file={imp.file} onChange={imp.chooseFile} disabled={imp.busy || !!imp.undoing} />

      <div className="card-actions">
        <button className="ghost-button" type="button" onClick={imp.validate} disabled={!imp.file || !orgId || imp.busy || !!imp.undoing}>
          {imp.busy && imp.progress?.dryRun ? 'Validating…' : '1. Validate (dry run)'}
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={imp.runImport}
          disabled={!imp.canImport || imp.busy || !!imp.undoing}
          title={imp.canImport ? '' : 'Validate the file first — import is enabled when no row is invalid'}
        >
          {imp.busy && imp.progress && !imp.progress.dryRun ? 'Importing…' : '2. Import to Zoho'}
        </button>
      </div>

      {imp.progress && <ProgressBar {...imp.progress} offline={imp.offline} onCancel={imp.cancel} />}
      {imp.undoing && (
        <p className="hint">
          Undoing… {imp.undoing.processed} / {imp.undoing.total} deleted from Zoho
          {imp.undoing.waiting && ` · ⏸ ${imp.undoing.waiting}`}
          {imp.offline && ' · ⏸ Cannot reach the backend server — still trying'}
        </p>
      )}

      {r && (
        <>
          <ResultSummary
            title={r.dryRun ? 'Dry run (nothing created in Zoho)' : r.cancelled ? 'Import cancelled' : 'Import complete'}
            items={[
              { label: 'Total', value: r.total, always: true },
              { label: 'Valid', value: r.valid, tone: 'ok' },
              { label: 'Created', value: r.created, tone: 'ok' },
              { label: 'Invalid', value: r.invalid, tone: 'bad' },
              { label: 'Failed', value: r.failed, tone: 'bad' },
              { label: 'Skipped (already in Zoho)', value: r.skipped, tone: 'warn' },
              { label: 'Cancelled', value: r.cancelled, tone: 'warn' },
              { label: 'Undone', value: r.undone, tone: 'neutral' },
            ]}
          />
          <Notice notice={step && (needsReconnect && !r.dryRun ? { ...step, action: reconnectAction } : step)} />
          {r.ignoredColumns?.length > 0 && (
            <Notice notice={{ type: 'warn', text: `Ignored columns (name not recognised): ${r.ignoredColumns.join(', ')} — if they should be used, fix the column name to match the template.` }} />
          )}

          <div className="card-actions">
            {problems.length > 0 && (
              <button className="primary-button" type="button" onClick={() => imp.downloadReport(true)} title="Only the rows that were not imported, with the reason in the Import Details column. Fix them in this sheet and upload it again.">
                Download failed rows with reason ({problems.length})
              </button>
            )}
            <button className="ghost-button" type="button" onClick={() => imp.downloadReport(false)}>Download full report (Excel)</button>
            {!r.dryRun && r.failed + r.cancelled > 0 && (
              <button className="ghost-button" type="button" onClick={imp.retryProblems} disabled={imp.busy || !!imp.undoing}>
                Retry failed rows ({r.failed + r.cancelled})
              </button>
            )}
            {!r.dryRun && r.created > 0 && (
              <button className="ghost-button danger" type="button" onClick={imp.undo} disabled={imp.busy || !!imp.undoing}>
                {imp.undoing ? 'Undoing…' : 'Undo this import'}
              </button>
            )}
          </div>

          <ProblemGroups
            title="Problems (grouped)"
            items={problems.map((x) => ({ ref: `Row ${x.row}`, message: x.message, tone: TONES[x.status] }))}
          />

          <div className="filter-tabs" role="tablist">
            {FILTERS.map((f) => {
              const n = results.filter(f.test).length;
              return (
                <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
                  {f.label} <span>{n}</span>
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <p className="hint">No rows in this view.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Row</th><th>Reference</th><th>Date</th><th>Amount</th><th>Status</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {shown.map((x) => (
                    <tr key={x.row}>
                      <td>{x.row}</td>
                      <td className="mono">{x.reference || '—'}</td>
                      <td>{x.payload?.date || x.date || '—'}</td>
                      <td>{x.payload?.amount ?? (x.amount || '—')}</td>
                      <td><span className={`status-pill tone-${TONES[x.status] || 'neutral'}`}>{x.status}</span></td>
                      <td className={`mono details${OK.has(x.status) ? ' info' : ''}`}>
                        {[x.message, x.transaction_id && `Zoho ID: ${x.transaction_id}`].filter(Boolean).join(' · ') || (x.status === 'valid' && 'OK')}
                        {x.zoho_code !== undefined && ` (code ${x.zoho_code})`}
                      </td>
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
