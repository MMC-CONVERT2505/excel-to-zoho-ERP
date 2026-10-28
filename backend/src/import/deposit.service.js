import { getAccountMap, getCurrencyMap, getCustomerMap, getTagMap, getExistingRefs } from './lookups.js';
import { toIsoDate, toAmount } from './excel.js';
import { text, resolveTags, runBankImport, findAccount, findCurrency, didYouMean } from './runner.js';

// Sirf wahi lookups load hote hain jinki sheet me zaroorat hai
async function loadLookups(rows, orgId) {
  const has = (k) => rows.some((r) => text(r[k]) !== '');
  return {
    accounts: await getAccountMap(orgId),
    currencies: has('currency') ? await getCurrencyMap(orgId) : new Map(),
    customers: has('receivedFrom') ? await getCustomerMap(orgId) : new Map(),
    tags: has('reportingTags') ? await getTagMap(orgId) : new Map(),
    existingRefs: has('reference') ? await getExistingRefs(orgId, 'deposit') : new Map(), // duplicate check
  };
}

// Ek Excel row -> { head (poore deposit ke fields), line ("Other Deposits" ki ek row) } ya { error }
function parseRow(row, L) {
  const date = toIsoDate(row.date);
  if (!date) return { error: `Invalid Deposit Date: "${row.date}" (use YYYY-MM-DD or DD/MM/YYYY)` };
  const amount = toAmount(row.amount);
  if (amount === null || amount <= 0) return { error: `Invalid amount: "${row.amount}"` };

  const { account: from, error: fromError } = findAccount(L, row.from, 'From Account');
  if (fromError) return { error: fromError };
  const { account: to, error: toError } = findAccount(L, row.to, 'To Account');
  if (toError) return { error: toError };
  if (from.id === to.id) return { error: 'From and To accounts are the same' };

  const head = { to_account_id: to.id, date };
  if (text(row.reference)) head.reference_number = text(row.reference);
  if (text(row.description)) head.description = text(row.description);

  if (text(row.currency)) {
    const { code, id, error } = findCurrency(L, row.currency);
    if (error) return { error };
    // Zoho deposit ki currency bank (To) account ki currency honi chahiye, warna code 9004
    if (to.currency && to.currency.toUpperCase() !== code) {
      return { error: `Currency is "${code}" but To Account "${to.name}" is in ${to.currency} — they must match` };
    }
    head.currency_id = id;
  }
  if (text(row.exchangeRate) !== '') {
    const rate = toAmount(row.exchangeRate);
    if (rate === null || rate <= 0) return { error: `Invalid exchange rate: "${row.exchangeRate}"` };
    head.exchange_rate = rate;
  }

  const line = { from_account_id: from.id, amount };
  const mode = text(row.receivedVia) || text(row.paidVia);
  if (mode) line.payment_mode = mode;
  if (text(row.receivedFrom)) {
    const contact = L.customers.get(text(row.receivedFrom).toLowerCase());
    if (!contact) {
      const customers = [...L.customers.values()].filter((c) => c.type === 'customer').map((c) => c.name);
      return { error: `Received From (customer) not found in Zoho: "${text(row.receivedFrom)}"${didYouMean(row.receivedFrom, customers)}` };
    }
    // Deposit me sirf customer chalta hai; vendor dene par Zoho code 3045 deta hai
    if (contact.type && contact.type !== 'customer') {
      return { error: `Received From "${row.receivedFrom}" is a ${contact.type} in Zoho, not a customer` };
    }
    line.customer_id = contact.id;
  }
  if (text(row.reportingTags)) {
    const { error, tags } = resolveTags(row.reportingTags, L.tags, 'Reporting Tag', { depositLevel: true });
    if (error) return { error };
    line.tags = tags; // har line pe — transaction level (upar wala Class) khali rehta hai
  }
  return { head, line };
}

// Deposit ke ye fields group ki har row me same hone chahiye
const SHARED = [['to_account_id', 'To Account'], ['date', 'Deposit Date'], ['currency_id', 'Currency'], ['exchange_rate', 'Exchange Rate']];

// Same Reference# wali rows -> ek deposit, har row "Other Deposits" ki ek line (sab line_items me, Excel order me).
function buildEntries(rows, L) {
  const groups = new Map();
  rows.forEach((row, i) => {
    const key = text(row.reference).toLowerCase() || `#row${i}`; // bina reference wali row akeli
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.values()].map((group) => {
    const parsed = group.map((row) => ({ row, ...parseRow(row, L) }));
    const ref = text(group[0].reference);

    const bad = parsed.filter((p) => p.error);
    if (bad.length) {
      const errors = new Map(bad.map((p) => [p.row, p.error]));
      for (const p of parsed) {
        if (!errors.has(p.row)) errors.set(p.row, `Not imported — row ${bad[0].row.rowNumber} with the same Reference# "${ref}" is invalid`);
      }
      return { rows: group, errors };
    }

    const head = parsed[0].head;
    for (const [field, label] of SHARED) {
      const values = new Set(parsed.map((p) => String(p.head[field] ?? '')));
      if (values.size > 1) {
        const msg = `Rows with Reference# "${ref}" have different ${label} values — one deposit needs the same ${label}`;
        return { rows: group, errors: new Map(group.map((r) => [r, msg])) };
      }
    }
    const description = parsed.map((p) => p.head.description).find(Boolean);

    // Saari lines (pehli bhi) line_items me — tabhi pehli line pe bhi tag lagta hai
    const payload = {
      transaction_type: 'deposit',
      ...head,
      ...(description && { description }),
      line_items: parsed.map((p) => p.line),
    };
    const warnings = new Map();
    if (group.length > 1) {
      parsed.forEach((p, i) => warnings.set(p.row, `Line ${i + 1} of ${group.length} in one deposit`));
    }
    return { rows: group, payload, warnings };
  });
}

export const importDeposits = (rows, opts) => runBankImport(rows, opts, { loadLookups, buildEntries });
