import { useEffect, useRef, useState } from 'react';
import { startImport, getImportJob, cancelImportJob } from './importApi.js';
import { deleteBankTransactions, getDeleteJob } from '../delete/deleteApi.js';
import { pollJob, savedJob, useLeaveWarning } from '../../services/jobs.js';
import { fileStore } from '../../services/fileStore.js';
import { buildReport, buildResultSheet, saveToPc } from '../../services/report.js';

const LOST_IMPORT = 'This import is no longer on the server (older than 3 days or the job files were deleted). Run Validate again — rows already in Zoho will show as "skipped".';
const LOST_UNDO = 'The undo job is no longer on the server. Check the Delete tab to see which entries are still in Zoho.';

export function useImport(orgId, kind) {
  const jobKey = `job:import:${kind}`; // chal rahe / aakhri job ki id — reload ke baad wapas
  const fileKey = `upload:${kind}`; // aakhri upload ki file, browser (IndexedDB) me — report ke liye

  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState(null); // aakhri poore hue job ki id
  const [validatedFile, setValidatedFile] = useState(null); // kis file ka dry run ho chuka
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { processed, total, dryRun, cancelling, waiting, last }
  const [offline, setOffline] = useState(false); // backend server tak nahi pahunch rahe (koshish jaari)
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // undo / resume / report ke baad ka message
  const [undoing, setUndoing] = useState(null); // { processed, total }
  const running = useRef(null); // chal rahe job ki id (cancel ke liye)

  useLeaveWarning(busy || !!undoing);

  const chooseFile = (f) => {
    setFile(f);
    setResult(null);
    setJobId(null);
    setValidatedFile(null);
    setError(null);
    setNotice(null);
    savedJob.clear(jobKey);
  };

  // Job ke khatam hone tak progress dikhao; khatam hone par result
  const follow = async (id, dryRun, f) => {
    running.current = id;
    setBusy(true);
    try {
      const job = await pollJob(
        () => getImportJob(id),
        (j) => setProgress({ processed: j.processed, total: j.total, dryRun, cancelling: j.cancelling, waiting: j.waiting, last: j.last }),
        { lostMessage: LOST_IMPORT, onOffline: setOffline },
      );
      setResult(job.result);
      setJobId(id);
      if (dryRun && f) setValidatedFile(f);
      if (job.interrupted) {
        setNotice({ type: 'warn', text: 'The server stopped while this was running. Rows that were not sent are marked "cancelled" — click "Retry failed rows" to send only those.' });
      }
    } catch (e) {
      setError(e.message);
      if (/no longer on the server/.test(e.message)) savedJob.clear(jobKey);
    }
    running.current = null;
    setProgress(null);
    setOffline(false);
    setBusy(false);
  };

  // Page reload / tab dobara khulne par: aakhri job (chal raha ho ya khatam) wapas dikhao
  useEffect(() => {
    const saved = savedJob.get(jobKey);
    if (!saved?.jobId) return;
    (async () => {
      const f = await fileStore.get(fileKey);
      if (f) setFile(f);
      setProgress({ processed: 0, total: 0, dryRun: saved.dryRun });
      await follow(saved.jobId, saved.dryRun, f);
    })();
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (dryRun, f = file) => {
    if (!f || !orgId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const { jobId: id, total } = await startImport(kind, f, orgId, dryRun);
      savedJob.set(jobKey, { jobId: id, dryRun });
      fileStore.put(fileKey, f);
      setProgress({ processed: 0, total, dryRun });
      await follow(id, dryRun, f);
    } catch (e) {
      setError(e.message);
      setProgress(null);
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!running.current) return;
    setProgress((p) => p && { ...p, cancelling: true });
    try {
      await cancelImportJob(running.current);
    } catch (e) {
      setError(`Could not cancel: ${e.message}`);
    }
  };

  // Report seedha PC par download — server par kuch save nahi. onlyProblems: sirf failed rows, reason ke saath
  const downloadReport = async (onlyProblems = false) => {
    if (!result) return;
    try {
      const original = file || await fileStore.get(fileKey);
      if (original) {
        saveToPc(await buildReport(original, result.results, { onlyProblems }));
      } else {
        saveToPc(await buildResultSheet(result.results, kind, { onlyProblems }));
        setNotice({ type: 'info', text: 'The original Excel is not in this browser any more, so the report has only the result columns. To fix and re-upload, correct your original file.' });
      }
    } catch (e) {
      setError(`Could not create the report: ${e.message}`);
    }
  };

  // Sirf failed/cancelled/invalid rows ki nayi file (browser me) banao aur use validate karo — jo ban chuki wo dobara nahi jaatin
  const retryProblems = async () => {
    if (!result || busy) return;
    try {
      const original = file || await fileStore.get(fileKey);
      if (!original) throw new Error('The original Excel is not in this browser any more — download "Failed rows", fix them and upload that file');
      const retryFile = await buildReport(original, result.results, { onlyProblems: true });
      chooseFile(retryFile);
      await run(true, retryFile);
    } catch (e) {
      setError(e.message);
    }
  };

  // Is import me bani entries Zoho se hata do (Delete wala hi backend)
  const undo = async () => {
    const ids = [...new Set((result?.results || []).filter((x) => x.status === 'created' && x.transaction_id).map((x) => x.transaction_id))];
    if (!ids.length || undoing) return;
    const ok = window.confirm(`Undo this import? ${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} created by it will be deleted from Zoho. This cannot be undone.`);
    if (!ok) return;
    setError(null);
    setNotice(null);
    setUndoing({ processed: 0, total: ids.length });
    try {
      const { jobId: id } = await deleteBankTransactions(orgId, ids);
      const job = await pollJob(
        () => getDeleteJob(id),
        (j) => setUndoing({ processed: j.processed, total: j.total, waiting: j.waiting }),
        { lostMessage: LOST_UNDO, onOffline: setOffline },
      );
      const deleted = new Set(job.result.results.filter((x) => x.status === 'deleted').map((x) => x.transaction_id));
      setResult((r) => {
        const results = r.results.map((x) => (deleted.has(x.transaction_id) && x.status === 'created'
          ? { ...x, status: 'undone', message: 'Deleted from Zoho (undo)' }
          : x));
        const count = (s) => results.filter((x) => x.status === s).length;
        return { ...r, results, created: count('created'), undone: count('undone') };
      });
      const notDeleted = ids.length - deleted.size;
      setNotice(notDeleted
        ? { type: 'warn', text: `Undo: ${deleted.size} deleted, ${notDeleted} could not be deleted — check them in the Delete tab.` }
        : { type: 'ok', text: `Undo complete — ${deleted.size} ${deleted.size === 1 ? 'entry' : 'entries'} deleted from Zoho.` });
    } catch (e) {
      setError(e.message);
    }
    setOffline(false);
    setUndoing(null);
  };

  // Real import tabhi, jab isi file ka dry run saaf nikla ho
  const canImport = !!file && validatedFile === file && result?.dryRun && result.invalid === 0 && result.valid > 0;

  return {
    file, chooseFile, result, jobId, busy, progress, offline, error, notice, undoing, canImport,
    validate: () => run(true), runImport: () => run(false), cancel, downloadReport, retryProblems, undo,
  };
}
