import { useEffect, useRef, useState } from 'react';
import { listBankTransactions, deleteBankTransactions, getDeleteJob, cancelDeleteJob } from './deleteApi.js';
import { pollJob, savedJob, useLeaveWarning } from '../../services/jobs.js';

export const MAX_SELECT = 500;
const TYPE_TO_CONFIRM = 50; // isse zyada entries par "DELETE" type karwao
const JOB_KEY = 'job:delete'; // chal rahe delete ki id — reload ke baad progress wapas
const LOST_DELETE = 'This delete job is no longer on the server. Click Refresh to see which entries are still in Zoho.';

// Confirm dialog ke liye: kitna amount, kaun si dates, kaun se accounts
function describeSelection(items) {
  const totals = new Map();
  for (const t of items) {
    const cur = t.currency_code || '';
    totals.set(cur, (totals.get(cur) || 0) + (Number(t.amount) || 0));
  }
  const dates = items.map((t) => t.date).filter(Boolean).sort();
  const accounts = [...new Set(items.map((t) => t.account_name).filter(Boolean))];
  const amount = [...totals].map(([cur, sum]) => `${sum.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`.trim()).join(' + ');
  return [
    `Total amount: ${amount || '—'}`,
    dates.length && `Dates: ${dates[0]}${dates.at(-1) !== dates[0] ? ` to ${dates.at(-1)}` : ''}`,
    accounts.length && `Accounts: ${accounts.slice(0, 4).join(', ')}${accounts.length > 4 ? ` (+${accounts.length - 4} more)` : ''}`,
  ].filter(Boolean).join('\n');
}

export function useDelete(orgId) {
  const [type, setType] = useState('');
  const [items, setItems] = useState(null); // us type ki Zoho entries
  const [selected, setSelected] = useState(() => new Set());
  const [result, setResult] = useState(null); // pichhle delete ka result
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(null); // { processed, total, deleted, failed, checking, cancelling, waiting, last, offline }
  const [error, setError] = useState(null);
  const latest = useRef(0); // sirf aakhri request ka jawab use karo (type jaldi badla ho to)
  const running = useRef(null); // chal rahe delete job ki id (cancel ke liye)

  useLeaveWarning(deleting);

  const load = async (t = type) => {
    if (!t || !orgId) return;
    const req = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listBankTransactions(orgId, t);
      if (req !== latest.current) return;
      setItems(data.transactions);
      setSelected(new Set());
    } catch (e) {
      if (req !== latest.current) return;
      setError(e.message);
      setItems(null);
    }
    setLoading(false);
  };

  // Type ya organization badalte hi us type ka saara data Zoho se
  useEffect(() => {
    setItems(null);
    setResult(null);
    setSelected(new Set());
    if (type && orgId) load(type);
  }, [type, orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_SELECT) next.add(id);
    return next;
  });

  // Dikh rahi (filtered) rows ko ek saath chuno / hatao
  const toggleMany = (ids, on) => setSelected((prev) => {
    const next = new Set(prev);
    for (const id of ids) {
      if (!on) next.delete(id);
      else if (next.size < MAX_SELECT) next.add(id);
    }
    return next;
  });

  const runDelete = async () => {
    const ids = [...selected];
    if (!ids.length || deleting) return;
    const summary = describeSelection((items || []).filter((t) => selected.has(t.transaction_id)));
    const question = `${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} will be deleted from Zoho. This cannot be undone.\n\n${summary}`;
    if (ids.length > TYPE_TO_CONFIRM) {
      const typed = window.prompt(`${question}\n\nType DELETE to confirm:`);
      if (typed === null) return;
      if (typed.trim().toUpperCase() !== 'DELETE') {
        setError('Not deleted — you need to type DELETE to confirm.');
        return;
      }
    } else if (!window.confirm(`${question}\n\nContinue?`)) {
      return;
    }
    setError(null);
    setResult(null);
    try {
      const { jobId, total } = await deleteBankTransactions(orgId, ids);
      savedJob.set(JOB_KEY, { jobId });
      await follow(jobId, total);
    } catch (e) {
      setError(e.message);
    }
  };

  // Job khatam hone tak progress (stats aane se pehle server Zoho list check kar raha hota hai)
  const follow = async (jobId, total = 0) => {
    running.current = jobId;
    setDeleting(true);
    setProgress({ processed: 0, total, deleted: 0, failed: 0, checking: true });
    try {
      const job = await pollJob(
        () => getDeleteJob(jobId),
        (j) => setProgress((p) => ({
          processed: j.processed, total: j.total, deleted: 0, failed: 0, ...j.stats,
          checking: !j.stats, cancelling: j.cancelling, waiting: j.waiting, last: j.last, offline: p?.offline,
        })),
        { lostMessage: LOST_DELETE, onOffline: (offline) => setProgress((p) => p && { ...p, offline }) },
      );
      setResult(job.result);
      if (job.interrupted) setError('The server stopped during this delete. Entries that were not deleted are marked "cancelled" — click Refresh and select them again.');
      if (type) await load(); // list taaza karo, deleted entries hat jayengi
    } catch (e) {
      setError(e.message);
    }
    savedJob.clear(JOB_KEY);
    running.current = null;
    setProgress(null);
    setDeleting(false);
  };

  // Page reload ke baad chal raha delete wapas dikhao
  useEffect(() => {
    const saved = savedJob.get(JOB_KEY);
    if (saved?.jobId) follow(saved.jobId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    if (!running.current) return;
    setProgress((p) => p && { ...p, cancelling: true });
    try {
      await cancelDeleteJob(running.current);
    } catch (e) {
      setError(`Could not cancel: ${e.message}`);
    }
  };

  return { type, setType, items, selected, toggle, toggleMany, result, loading, deleting, progress, error, reload: () => load(), runDelete, cancel };
}
