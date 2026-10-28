import * as XLSX from 'xlsx';

// Deposit template: To Account, Deposit Date, Paid Via, Reference#, Description, Currency,
// Exchange Rate, From Account, Received From, Received Via, Amount (AED), Reporting Tags
export const DEPOSIT_COLUMNS = {
  aliases: {
    to: ['toaccount'],
    date: ['depositdate', 'date'],
    paidVia: ['paidvia'],
    reference: ['reference'],
    description: ['description'],
    currency: ['currency'],
    exchangeRate: ['exchangerate'],
    from: ['fromaccount'],
    receivedFrom: ['receivedfrom'],
    receivedVia: ['receivedvia'],
    reportingTags: ['reportingtags'],
  },
  required: ['to', 'date', 'from', 'amount'],
};

// Transfer template: From Account, Reporting Tags, To Account, Reporting Tags, Date, Amount,
// Reference#, Description, Currency, Exchange Rate
// Dono "Reporting Tags" ek hi naam ke hain, isliye account column ke turant baad wala uska tag column maana jata hai.
export const TRANSFER_COLUMNS = {
  aliases: {
    from: ['fromaccount'],
    fromTags: ['fromreportingtags', 'fromaccountreportingtags'],
    to: ['toaccount'],
    toTags: ['toreportingtags', 'toaccountreportingtags'],
    date: ['date', 'transferdate'],
    reference: ['reference'],
    description: ['description'],
    currency: ['currency'],
    exchangeRate: ['exchangerate'],
  },
  required: ['from', 'to', 'date', 'amount'],
  tagsAfter: { fromTags: 'from', toTags: 'to' },
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = (n) => String(n).padStart(2, '0');

function validYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? `${y}-${pad(m)}-${pad(d)}`
    : null;
}

export function toIsoDate(v) {
  if (v instanceof Date) return validYmd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number') {
    const dt = new Date(Math.floor(v - 25569) * 86400000);
    return validYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/); // DD/MM/YYYY
  if (m) return validYmd(+m[3], +m[2], +m[1]);
  return null;
}

export function toAmount(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function readSheet(buffer, spec) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const table = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) : [];
  if (!table.length) return { rows: [], missing: spec.required };

  const header = table[0].map(norm);
  const col = {};
  for (const [key, names] of Object.entries(spec.aliases)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i !== -1) col[key] = i;
  }
  for (const [key, accountKey] of Object.entries(spec.tagsAfter || {})) {
    const i = col[accountKey] + 1;
    if (col[key] === undefined && col[accountKey] !== undefined && header[i] === 'reportingtags') col[key] = i;
  }
  // "Amount (AED)" / "Amount (INR)" jaisa koi bhi "Amount ..." column
  const amountIdx = header.findIndex((h) => h.startsWith('amount'));
  if (amountIdx !== -1) col.amount = amountIdx;
  const missing = spec.required.filter((k) => col[k] === undefined);

  // Jo columns pehchaane nahi gaye (spelling galat ho to chupchaap chhoot jaate) — user ko dikhane ke liye
  const used = new Set(Object.values(col));
  const ignoredColumns = table[0]
    .map((h, i) => ({ h: String(h ?? '').trim(), i }))
    .filter(({ h, i }) => h && !used.has(i) && !REPORT_KEYS.includes(norm(h)))
    .map(({ h }) => h);

  const rows = [];
  table.slice(1).forEach((cells, idx) => {
    if (cells.every((c) => String(c).trim() === '')) return;
    const row = { rowNumber: idx + 2 };
    for (const [key, i] of Object.entries(col)) row[key] = cells[i];
    rows.push(row);
  });
  return { rows, missing, ignoredColumns };
}

// Browser jo report banata hai (user ki sheet + ye 3 columns) — dobara upload hone par ye columns ignore hote hain.
// frontend/src/services/report.js ke REPORT_HEADERS ke saath sync rakho.
const REPORT_HEADERS = ['Import Status', 'Import Details', 'Zoho Transaction ID'];
const REPORT_KEYS = REPORT_HEADERS.map(norm);
