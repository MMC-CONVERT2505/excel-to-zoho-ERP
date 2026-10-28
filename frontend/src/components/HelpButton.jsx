import { useEffect, useState } from 'react';

// Tool ki limitations — backend ki asli limits ke saath sync rakho (MAX_ROWS, MAX_IDS, cache TTL, etc.)
const SECTIONS = [
  {
    title: 'Import',
    points: [
      'Max 2,000 rows (10 MB) per file, first sheet only.',
      'A Reference# that already exists in Zoho is skipped, so it is not created twice. Rows without a Reference# are not checked.',
      'Account, customer and tag names must match Zoho.',
      'Deposit currency must match the bank (To) account.',
    ],
  },
  {
    title: 'Common errors & fixes',
    points: [
      '"… not found in Zoho" — the name is spelled differently in Zoho. Use the "did you mean" name shown, or copy the exact name from Zoho.',
      '"Invalid date" — use YYYY-MM-DD or DD/MM/YYYY.',
      '"Ignored columns" — a column name does not match the template; rename it as in the template.',
      '"skipped" — this Reference# is already in Zoho. Change the Reference# if it is really a new entry.',
      '"Zoho connection expired" — click Reconnect Zoho, then "Retry failed rows".',
      'Something went wrong after import? Use "Undo this import" to delete what it created.',
      '"Download failed rows with reason" saves only the problem rows to your PC (reason in the Import Details column). Fix them in that sheet and upload it again.',
      'Internet or Zoho down? The import waits and continues by itself — even for days. Closing the page is safe; open it again to see the progress.',
    ],
  },
  {
    title: 'Delete',
    points: [
      'Deposits and transfers only, max 500 at a time.',
      'Deleting cannot be undone.',
    ],
  },
  {
    title: 'General',
    points: [
      'One organization at a time, subject to Zoho API limits.',
    ],
  },
];

export default function HelpButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div className="help-panel" role="dialog" aria-modal="false" aria-labelledby="help-title">
          <div className="help-panel-head">
            <h3 id="help-title">Help · Limitations</h3>
            <button type="button" className="help-close" aria-label="Close help" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="help-panel-body">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h4>{s.title}</h4>
                <ul>
                  {s.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className={`help-fab${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-label={open ? 'Close help' : 'Help and limitations'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '×' : '?'}
        {!open && <span className="help-fab-label">Help</span>}
      </button>
    </>
  );
}
