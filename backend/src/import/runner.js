import { callZoho } from '../zoho/zoho.service.js';
import { explainZohoError, describeZohoError } from '../zoho/errors.js';
import { withNetworkWait, CALL_TIMEOUT_MS } from '../zoho/resilient.js';
import { toIsoDate } from './excel.js';
import { findByReference } from './lookups.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP_MS = 300;
export const text = (v) => String(v ?? '').trim();

// "Did you mean" — galat likhe naam ke sabse kareeb Zoho naam (spelling, spaces, chhota/bada naam)
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function suggest(input, names) {
  const q = squash(input);
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const name of names) {
    const n = squash(name);
    if (!n) continue;
    const longer = Math.max(n.length, q.length);
    const score = n === q ? 1
      : n.includes(q) || q.includes(n) ? 0.6 + 0.4 * (Math.min(n.length, q.length) / longer)
      : 1 - editDistance(q, n) / longer;
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return bestScore >= 0.6 ? best : null;
}

// Error message ke aage jodne ke liye: ' — did you mean "HDFC Bank"?' ya ''
export const didYouMean = (input, names) => {
  const s = suggest(input, names);
  return s ? ` — did you mean "${s}"?` : '';
};

// "Class:North; Dept:Sales" -> [{ tag_id, tag_option_id }]
// Agar ":" se pehle wala hissa koi tag nahi hai, to poora text kisi tag ka option naam maana jata hai
// (jaise tag "Class" ka option "Region:North").
function resolveTagPart(part, tagMap, label) {
  const [name, ...rest] = part.split(':');
  const tag = tagMap.get(name.trim().toLowerCase());
  if (tag && rest.length) {
    const optionName = rest.join(':').trim();
    const optionId = tag.options.get(optionName.toLowerCase());
    if (optionId) return { tag: { tag_id: tag.id, tag_option_id: optionId } };
  }

  const matches = [...tagMap.values()].filter((t) => t.options.has(part.toLowerCase()));
  if (matches.length === 1) return { tag: { tag_id: matches[0].id, tag_option_id: matches[0].options.get(part.toLowerCase()) } };
  if (matches.length > 1) {
    return { error: `${label} "${part}" exists in several tags (${matches.map((t) => t.name).join(', ')}) — use TagName:Option` };
  }
  if (tag) {
    const option = rest.join(':').trim();
    return { error: `${label} "${tag.name}" has no option "${option}"${didYouMean(option, tag.optionNames || [])}` };
  }
  const allOptions = [...tagMap.values()].flatMap((t) => (t.optionNames || []).map((o) => `${t.name}:${o}`));
  return { error: `${label} not found in Zoho: "${part}" (format: TagName:Option or just Option)${didYouMean(part, allOptions)}` };
}

// depositLevel: Zoho me Banking ki line_item/transaction preference sirf deposits pe lagti hai (baaki banking transaction level pe)
export function resolveTags(raw, tagMap, label = 'Reporting Tag', { depositLevel = false } = {}) {
  const tags = [];
  for (const part of text(raw).split(/[;,]/).map((p) => p.trim()).filter(Boolean)) {
    const { error, tag } = resolveTagPart(part, tagMap, label);
    if (error) return { error };
    // Ek tag ka ek hi option lag sakta hai
    if (tags.some((t) => t.tag_id === tag.tag_id)) return { error: `${label}: two options given for the same tag ("${part}")` };
    // Hum tag poori transaction pe bhejte hain; deposit ke liye Banking preference line_item ho to Zoho reject karta hai
    const info = [...tagMap.values()].find((t) => t.id === tag.tag_id);
    if (info?.banking && !info.banking.enabled) {
      return { error: `${label} "${info.name}" is not enabled for Banking in Zoho (Settings → Reporting Tags → ${info.name})` };
    }
    if (depositLevel && info?.banking?.preference === 'line_item') {
      return { error: `${label} "${info.name}" is set to line-item level for bank deposits in Zoho — change the Banking deposit option to "At Transaction Level" (Settings → Reporting Tags → ${info.name}), or leave the tags column empty` };
    }
    tags.push(tag);
  }
  return { tags };
}

// Account naam se dhoondo; na mile to "did you mean" ke saath error
export function findAccount(L, raw, label) {
  const account = L.accounts.get(text(raw).toLowerCase());
  if (account) return { account };
  return { error: `${label} not found in Zoho: "${text(raw)}"${didYouMean(raw, [...L.accounts.values()].map((a) => a.name))}` };
}

export function findCurrency(L, raw) {
  const code = text(raw).toUpperCase();
  const id = L.currencies.get(code);
  if (id) return { code, id };
  return { error: `Currency not found in Zoho: "${text(raw)}" (use the 3-letter code, e.g. INR)${didYouMean(code, [...L.currencies.keys()])}` };
}

async function postWithRetry(orgId, payload) {
  for (let attempt = 1; ; attempt++) {
    const res = await callZoho({ method: 'POST', path: 'banktransactions', query: { organization_id: orgId }, body: payload, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    if (res.status !== 429 || attempt >= 3) return res;
    await sleep((Number(res.headers.get('retry-after')) || 5) * 1000);
  }
}

// Har row ek alag entry (transfer)
const perRow = (buildPayload) => (rows, L) => rows.map((row) => {
  const { error, payload } = buildPayload(row, L);
  return error ? { rows: [row], errors: new Map([[row, error]]) } : { rows: [row], payload };
});

// Entry = Zoho ki ek bank transaction, jisme ek ya zyada Excel rows ho sakti hain (deposit: same Reference#).
// buildEntries(rows, L) -> [{ rows, payload } | { rows, errors: Map(row -> msg) }], optional warnings: Map(row -> msg)
// Har entry: (dry run me sirf validate) -> Zoho banktransactions POST. Result har Excel row ka alag.
// L.existingRefs (Map ref -> transaction_id) ho to wo Reference# Zoho me pehle se hai -> entry 'skipped' (duplicate nahi banti).
// onProgress(processedRows, { results, last } | { waiting }) — progress bar, aakhri bani entry, aur job ko disk par save karne ke liye.
// Net / Zoho band ho to wahi entry intezaar karke dobara bhejte hain (waiting message progress me dikhta hai).
// isCancelled() true ho to baaki entries 'cancelled' — Zoho me kuch nahi bhejte.
export async function runBankImport(rows, { orgId, dryRun, onProgress = () => {}, isCancelled = () => false }, { loadLookups, buildEntries, buildPayload }) {
  const L = await loadLookups(rows, orgId);
  const entries = (buildEntries || perRow(buildPayload))(rows, L);
  const results = [];
  let stopReason = null; // connection toot gaya to baaki entries bhejna bekaar hai

  for (const entry of entries) {
    // Har result me Excel ka reference/date/amount/account — taaki pata chale kaunsi entry success/fail hui
    const outs = entry.rows.map((row) => ({
      row: row.rowNumber,
      reference: text(row.reference),
      date: toIsoDate(row.date) || text(row.date),
      amount: text(row.amount),
      account: text(row.to),
      ...(entry.warnings?.has(row) && { message: entry.warnings.get(row) }),
    }));
    const ref = text(entry.payload?.reference_number).toLowerCase();
    const existingId = ref && L.existingRefs?.get(ref);

    if (entry.errors) {
      entry.rows.forEach((row, i) => results.push({ ...outs[i], status: 'invalid', message: entry.errors.get(row) }));
    } else if (existingId) {
      const message = `Reference# "${text(entry.payload.reference_number)}" already exists in Zoho — skipped so it is not created twice (change the Reference# if this is a different entry)`;
      outs.forEach((out) => results.push({ ...out, status: 'skipped', message, transaction_id: existingId }));
    } else if (dryRun) {
      outs.forEach((out) => results.push({ ...out, status: 'valid' }));
    } else if (stopReason || isCancelled()) {
      const message = stopReason || 'Cancelled — not sent to Zoho';
      outs.forEach((out) => results.push({ ...out, status: 'cancelled', message }));
    } else {
      let result;
      let resentBlind = false; // bina Reference# ke connection tootne ke baad dobara bheja — duplicate ho sakta hai
      try {
        const res = await withNetworkWait(async (afterNetworkError) => {
          // Pichhla jawab kho gaya tha: shayad entry ban chuki hai — Reference# se check karke hi dobara bhejo
          if (afterNetworkError && ref) {
            const id = await findByReference(orgId, entry.payload.reference_number, entry.payload.transaction_type, AbortSignal.timeout(CALL_TIMEOUT_MS));
            if (id) return { alreadyCreated: id };
          }
          if (afterNetworkError && !ref) resentBlind = true;
          return postWithRetry(orgId, entry.payload);
        }, { onWaiting: (waiting) => onProgress(results.length, { waiting }), isCancelled });

        const { status, data } = res;
        if (res.alreadyCreated) {
          result = { status: 'created', transaction_id: res.alreadyCreated };
        } else if (status < 300 && data.code === 0) {
          const id = data.banktransaction?.transaction_id ?? data.transaction?.transaction_id ?? data.transaction_id;
          result = { status: 'created', transaction_id: id };
          if (resentBlind) result.message = 'Sent again after a connection problem and this row has no Reference# — check Zoho that it was not created twice';
        } else {
          const err = explainZohoError({ status, code: data.code, message: data.message });
          result = { status: 'failed', zoho_code: data.code, message: describeZohoError(err), ...(err.reconnect && { reconnect: true }) };
        }
      } catch (e) {
        const err = explainZohoError({ status: e.status, message: e.message });
        result = { status: 'failed', message: describeZohoError(err), ...(err.reconnect && { reconnect: true }) };
      }
      if (result.reconnect) stopReason = 'Not sent — the Zoho connection was lost. Reconnect Zoho and retry the failed rows';
      outs.forEach((out) => results.push({
        ...out,
        ...result,
        ...(result.status === 'created' && (out.message || result.message) && { message: [result.message, out.message].filter(Boolean).join(' · ') }),
      }));
      if (result.status === 'created') {
        const first = outs[0];
        onProgress(results.length, { last: `${first.reference || 'no Reference#'} (row ${first.row})` });
      }
      await sleep(GAP_MS);
    }
    onProgress(results.length, { results });
  }
  return results.sort((a, b) => a.row - b.row);
}
