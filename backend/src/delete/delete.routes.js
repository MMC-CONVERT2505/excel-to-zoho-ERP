import { Router } from 'express';
import { config } from '../config/env.js';
import { listBankTransactions, deleteSelected } from './delete.service.js';
import { startJob, getJob, cancelJob, registerRestorer } from '../import/jobs.js';

const router = Router();
const MAX_IDS = 500;
const TYPES = new Set(['deposit', 'transfer_fund']);

function summarize(results) {
  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    total: results.length,
    deleted: count('deleted'),
    not_found: count('not_found'),
    skipped_type: count('skipped_type'),
    failed: count('failed'),
    cancelled: count('cancelled'),
    results,
  };
}

// Server delete ke beech ruk gaya: jo IDs result me nahi pahunchi wo 'cancelled' (Refresh karke dobara chuno)
registerRestorer('delete', (partial, pending) => {
  const seen = new Set(partial.map((r) => r.transaction_id));
  const message = 'Not deleted — the server stopped before this entry. Click Refresh; if it is still listed, select it again';
  return summarize([...partial, ...pending.filter((id) => !seen.has(id)).map((id) => ({ transaction_id: id, status: 'cancelled', message }))]);
});

// GET /api/delete/bank-transactions?organization_id=...&type=deposit|transfer_fund
// Us type ki saari entries (sirf dekhne/chunne ke liye, kuch delete nahi hota)
router.get('/bank-transactions', async (req, res) => {
  try {
    const orgId = req.query.organization_id || config.zoho.orgId;
    if (!orgId) return res.status(400).json({ message: 'organization_id is required' });
    const { type } = req.query;
    if (!TYPES.has(type)) return res.status(400).json({ message: 'type must be deposit or transfer_fund' });

    const transactions = await listBankTransactions(orgId, type);
    res.json({ type, total: transactions.length, transactions });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// GET /api/delete/jobs/:id -> { processed, total, stats: { deleted, failed }, done, error, result }
router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ message: 'Delete job not found (the server may have restarted)' });
  res.json(job);
});

// POST /api/delete/jobs/:id/cancel — baaki IDs delete nahi hongi
router.post('/jobs/:id/cancel', (req, res) => {
  const job = cancelJob(req.params.id);
  if (!job) return res.status(404).json({ message: 'Delete job not found (the server may have restarted)' });
  res.json({ cancelling: job.cancelling, done: job.done });
});

// POST /api/delete/bank-transactions?organization_id=...   body: { transaction_ids: [...] }
// Sirf chuni hui IDs delete hoti hain — "sab delete karo" jaisa koi option nahi.
// Turant { jobId, total } lautata hai; progress /jobs/:id se poll karo.
router.post('/bank-transactions', (req, res) => {
  try {
    const orgId = req.query.organization_id || config.zoho.orgId;
    if (!orgId) return res.status(400).json({ message: 'organization_id is required' });

    const raw = req.body?.transaction_ids;
    if (!Array.isArray(raw)) return res.status(400).json({ message: 'transaction_ids must be an array' });
    const ids = [...new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ message: 'Select at least one entry' });
    if (ids.length > MAX_IDS) return res.status(400).json({ message: `Maximum ${MAX_IDS} entries at a time` });

    const job = startJob(
      ids.length,
      async (onProgress, isCancelled) => summarize(await deleteSelected(orgId, ids, onProgress, isCancelled)),
      { info: { kind: 'delete' }, pending: ids, restore: 'delete' },
    );
    res.status(202).json({ jobId: job.id, total: ids.length });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

export default router;
