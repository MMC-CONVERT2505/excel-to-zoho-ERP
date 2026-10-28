import { callZoho } from '../zoho/zoho.service.js';
import { explainZohoError, describeZohoError } from '../zoho/errors.js';
import { withNetworkWait, CALL_TIMEOUT_MS } from '../zoho/resilient.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP_MS = 300;
const MAX_RETRIES = 3;
const MAX_PAGES = 250; // 250 x 200 = 50,000 entries tak
const DELETABLE_TYPES = new Set(['deposit', 'transfer_fund']);
const text = (v) => String(v ?? '').trim();

// Response ka array: pehle jaane-pehchaane keys, warna pehla array
const firstArray = (data) =>
  [data.banktransactions, data.transactions].find(Array.isArray) || Object.values(data).find(Array.isArray);

// GET /banktransactions ke saare pages
async function listAll(orgId) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { status, data } = await callZoho({ method: 'GET', path: 'banktransactions', query: { organization_id: orgId, page, per_page: 200 } });
    if (status >= 400 || (data.code !== undefined && data.code !== 0)) {
      throw Object.assign(new Error(`Failed to list bank transactions: ${data.message || `HTTP ${status}`}`), { status: 502 });
    }
    const list = firstArray(data);
    if (!list) throw Object.assign(new Error('No transactions array found in the Zoho list response'), { status: 502 });
    all.push(...list);
    if (!data.page_context?.has_more_page) return all;
  }
  throw Object.assign(new Error(`More than ${MAX_PAGES * 200} bank transactions — could not read the full list, nothing was deleted`), { status: 502 });
}

// Transfer list me do baar aata hai (har account side ki ek entry, same transaction_id) -> ek hi transaction maano
function groupById(entries) {
  const byId = new Map();
  for (const e of entries) {
    const id = text(e.transaction_id ?? e.bank_transaction_id);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(e);
  }
  return { byId };
}

function details(id, sides) {
  const first = sides[0];
  const accounts = [...new Set(sides.flatMap((s) => [s.account_name, s.offset_account_name]).map(text).filter(Boolean))];
  return {
    transaction_id: id,
    type: first.transaction_type,
    date: first.date,
    amount: first.amount,
    currency_code: first.currency_code,
    reference_number: first.reference_number,
    account_name: accounts.join(' ↔ '),
    zoho_status: first.status,
  };
}

async function deleteWithRetry(orgId, id) {
  for (let retry = 0; ; retry++) {
    const res = await callZoho({ method: 'DELETE', path: `banktransactions/${encodeURIComponent(id)}`, query: { organization_id: orgId }, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    if (res.status !== 429 || retry >= MAX_RETRIES) return res;
    await sleep((Number(res.headers.get('retry-after')) || 5) * 1000);
  }
}

// Connection tootne ke baad: shayad delete ho chuka — Zoho "does not exist" (404 / code 1002) de to haan
async function alreadyGone(orgId, id) {
  const { status, data } = await callZoho({ method: 'GET', path: `banktransactions/${encodeURIComponent(id)}`, query: { organization_id: orgId }, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  return status === 404 || data.code === 1002;
}

async function loadIndex(orgId) {
  const entries = await listAll(orgId);
  const index = groupById(entries);
  if (entries.length && index.byId.size === 0) {
    throw Object.assign(new Error('transaction_id field not found in Zoho entries'), { status: 502 });
  }
  return index;
}

// Ek type (deposit / transfer_fund) ki saari entries, transfer ki dono sides ek row me
export async function listBankTransactions(orgId, type) {
  const { byId } = await loadIndex(orgId);
  return [...byId].map(([id, sides]) => details(id, sides)).filter((t) => t.type === type);
}

// Sirf chuni hui IDs delete — har ID pehle Zoho ki taaza list se check hoti hai
// onProgress(processed, { stats, results, last } | { waiting }) har ID ke baad (progress bar + job disk par save)
// Net / Zoho band ho to wahi ID intezaar karke dobara. isCancelled() true ho ya Zoho login toot jaye to baaki IDs 'cancelled'.
export async function deleteSelected(orgId, ids, onProgress = () => {}, isCancelled = () => false) {
  const { byId } = await loadIndex(orgId);
  const results = [];
  const report = () => {
    const lastDeleted = results.findLast((r) => r.status === 'deleted');
    onProgress(results.length, {
      stats: {
        deleted: results.filter((r) => r.status === 'deleted').length,
        failed: results.filter((r) => r.status !== 'deleted').length,
      },
      results,
      ...(lastDeleted && { last: lastDeleted.reference_number || lastDeleted.transaction_id }),
    });
  };
  report();
  let stopReason = null;

  for (const id of ids) {
    if (stopReason || isCancelled()) {
      const info = byId.has(id) ? details(id, byId.get(id)) : { transaction_id: id };
      results.push({ ...info, status: 'cancelled', message: stopReason || 'Cancelled — not deleted' });
      report();
      continue;
    }
    const sides = byId.get(id);
    if (!sides) { results.push({ transaction_id: id, status: 'not_found', message: 'This entry no longer exists in Zoho' }); report(); continue; }
    const info = details(id, sides);
    if (!DELETABLE_TYPES.has(info.type)) {
      results.push({ ...info, status: 'skipped_type', message: `Type is "${info.type}" — only deposit/transfer_fund can be deleted` });
      report();
      continue;
    }
    try {
      const res = await withNetworkWait(
        async (afterNetworkError) => (afterNetworkError && await alreadyGone(orgId, id) ? { gone: true } : deleteWithRetry(orgId, id)),
        { onWaiting: (waiting) => onProgress(results.length, { waiting }), isCancelled },
      );
      const { status, data } = res;
      if (res.gone || (status < 300 && data.code === 0)) results.push({ ...info, status: 'deleted' });
      else {
        // Code 57: token me ERP.banking.DELETE scope nahi hai
        const err = data.code === 57
          ? { message: data.message || `HTTP ${status}`, hint: 'add ERP.banking.DELETE to ZOHO_SCOPES in .env, then disconnect and reconnect Zoho' }
          : explainZohoError({ status, code: data.code, message: data.message });
        results.push({ ...info, status: 'failed', zoho_code: data.code, message: describeZohoError(err), ...(err.reconnect && { reconnect: true }) });
        if (err.reconnect) stopReason = 'Not deleted — the Zoho connection was lost. Reconnect Zoho and try again';
      }
    } catch (e) {
      const err = explainZohoError({ status: e.status, message: e.message });
      results.push({ ...info, status: 'failed', message: describeZohoError(err), ...(err.reconnect && { reconnect: true }) });
      if (err.reconnect) stopReason = 'Not deleted — the Zoho connection was lost. Reconnect Zoho and try again';
    }
    report();
    await sleep(GAP_MS);
  }
  return results;
}
