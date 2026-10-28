import { Router } from 'express';
import multer from 'multer';
import { config } from '../config/env.js';
import { readSheet, toIsoDate, DEPOSIT_COLUMNS, TRANSFER_COLUMNS } from './excel.js';
import { importDeposits } from './deposit.service.js';
import { importTransfers } from './transfer.service.js';
import { text } from './runner.js';
import { startJob, getJob, cancelJob, registerRestorer } from './jobs.js';

const router = Router();
const multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file');
// Multer ki error (jaise file 10 MB se badi) bhi JSON message ke roop me
const upload = (req, res, next) => multerUpload(req, res, (e) => {
  if (!e) return next();
  const message = e.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 10 MB — split it into smaller files' : `Upload failed: ${e.message}`;
  res.status(400).json({ message });
});
const MAX_ROWS = 2000;
const COLUMN_LABELS = { from: 'From Account', to: 'To Account', date: 'Date', amount: 'Amount' };

const IMPORTERS = {
  deposits: { columns: DEPOSIT_COLUMNS, run: importDeposits },
  transfers: { columns: TRANSFER_COLUMNS, run: importTransfers },
};

function summarize(results, dryRun, ignoredColumns) {
  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    dryRun,
    total: results.length,
    valid: count('valid'),
    created: count('created'),
    invalid: count('invalid'),
    failed: count('failed'),
    skipped: count('skipped'),
    cancelled: count('cancelled'),
    ignoredColumns,
    results,
  };
}

// Server import ke beech ruk gaya: jo rows result me nahi pahunchi, wo 'cancelled' (Zoho ko nahi gayi / pakka nahi)
registerRestorer('import', (partial, pending, job) => {
  const seen = new Set(partial.map((r) => r.row));
  const message = 'Not sent — the server stopped before this row. Click "Retry failed rows" (rows already in Zoho are skipped automatically)';
  const rest = pending.filter((p) => !seen.has(p.row)).map((p) => ({ ...p, status: 'cancelled', message }));
  return summarize([...partial, ...rest].sort((a, b) => a.row - b.row), job.dryRun, job.ignoredColumns);
});

// GET /api/import/jobs/:id -> { processed, total, done, cancelling, error, result }
router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ message: 'Import job not found (the server may have restarted)' });
  res.json(job);
});

// POST /api/import/jobs/:id/cancel — jo entry Zoho ko ja chuki wo poori hoti hai, baaki nahi bheji jaati
router.post('/jobs/:id/cancel', (req, res) => {
  const job = cancelJob(req.params.id);
  if (!job) return res.status(404).json({ message: 'Import job not found (the server may have restarted)' });
  res.json({ cancelling: job.cancelling, done: job.done });
});

// POST /api/import/deposits|transfers?organization_id=...&dryRun=true|false   (form-data: file)
// dryRun default TRUE hai: sirf dryRun=false likhne par hi Zoho me entries banengi.
// Turant { jobId, total } lautata hai; progress /jobs/:id se poll karo.
router.post('/:kind', upload, (req, res) => {
  try {
    const importer = IMPORTERS[req.params.kind];
    if (!importer) return res.status(404).json({ message: `Unknown import: ${req.params.kind}` });
    const orgId = req.query.organization_id || config.zoho.orgId;
    if (!orgId) return res.status(400).json({ message: 'organization_id is required' });
    if (!req.file) return res.status(400).json({ message: 'Upload an Excel file (form field: file)' });

    const dryRun = req.query.dryRun !== 'false';
    let sheet;
    try {
      sheet = readSheet(req.file.buffer, importer.columns);
    } catch {
      return res.status(400).json({ message: 'Could not read this file — upload an Excel (.xlsx / .xls) or CSV file, not a PDF or a password-protected file' });
    }
    const { rows, missing, ignoredColumns } = sheet;
    if (missing.length) {
      return res.status(400).json({ message: `Missing columns: ${missing.map((k) => COLUMN_LABELS[k] || k).join(', ')} — download the template to see the expected column names` });
    }
    if (!rows.length) return res.status(400).json({ message: 'No rows found in the file — data must be on the first sheet, below the header row' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ message: `The file has ${rows.length} rows — maximum ${MAX_ROWS} at a time, split it into smaller files` });

    const job = startJob(
      rows.length,
      async (onProgress, isCancelled) =>
        summarize(await importer.run(rows, { orgId, dryRun, onProgress, isCancelled }), dryRun, ignoredColumns),
      {
        info: { kind: req.params.kind, dryRun, fileName: req.file.originalname || '', ignoredColumns },
        pending: rows.map((r) => ({ row: r.rowNumber, reference: text(r.reference), date: toIsoDate(r.date) || text(r.date), amount: text(r.amount) })),
        restore: 'import', // upload ki file server par save nahi hoti — report browser me banti hai
      },
    );
    res.status(202).json({ jobId: job.id, total: rows.length });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

export default router;
