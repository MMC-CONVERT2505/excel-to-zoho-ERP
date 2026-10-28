import { getAccountMap, getCurrencyMap, getTagMap, getExistingRefs } from './lookups.js';
import { toIsoDate, toAmount } from './excel.js';
import { text, resolveTags, runBankImport, findAccount, findCurrency } from './runner.js';

async function loadLookups(rows, orgId) {
  const has = (k) => rows.some((r) => text(r[k]) !== '');
  return {
    accounts: await getAccountMap(orgId),
    currencies: has('currency') ? await getCurrencyMap(orgId) : new Map(),
    tags: has('fromTags') || has('toTags') ? await getTagMap(orgId) : new Map(),
    existingRefs: has('reference') ? await getExistingRefs(orgId, 'transfer_fund') : new Map(), // duplicate check
  };
}

function buildPayload(row, L) {
  const date = toIsoDate(row.date);
  if (!date) return { error: `Invalid date: "${row.date}" (use YYYY-MM-DD or DD/MM/YYYY)` };
  const amount = toAmount(row.amount);
  if (amount === null || amount <= 0) return { error: `Invalid amount: "${row.amount}"` };

  const { account: from, error: fromError } = findAccount(L, row.from, 'From Account');
  if (fromError) return { error: fromError };
  const { account: to, error: toError } = findAccount(L, row.to, 'To Account');
  if (toError) return { error: toError };
  if (from.id === to.id) return { error: 'From and To accounts are the same' };

  const payload = {
    transaction_type: 'transfer_fund',
    from_account_id: from.id,
    to_account_id: to.id,
    amount,
    date,
  };

  if (text(row.reference)) payload.reference_number = text(row.reference);
  if (text(row.description)) payload.description = text(row.description);

  if (text(row.currency)) {
    const { code, id, error } = findCurrency(L, row.currency);
    if (error) return { error };
    // Transfer ki currency From ya To kisi ek account ki currency honi chahiye
    const accountCurrencies = [from.currency, to.currency].filter(Boolean).map((c) => c.toUpperCase());
    if (accountCurrencies.length === 2 && !accountCurrencies.includes(code)) {
      return { error: `Currency "${code}" matches neither the From (${from.currency}) nor the To (${to.currency}) account` };
    }
    payload.currency_id = id;
  }
  if (text(row.exchangeRate) !== '') {
    const rate = toAmount(row.exchangeRate);
    if (rate === null || rate <= 0) return { error: `Invalid exchange rate: "${row.exchangeRate}"` };
    payload.exchange_rate = rate;
  }

  // From aur To dono side ke alag reporting tags
  if (text(row.fromTags)) {
    const { error, tags } = resolveTags(row.fromTags, L.tags, 'From Reporting Tag');
    if (error) return { error };
    payload.from_account_tags = tags;
  }
  if (text(row.toTags)) {
    const { error, tags } = resolveTags(row.toTags, L.tags, 'To Reporting Tag');
    if (error) return { error };
    payload.to_account_tags = tags;
  }
  return { payload };
}

export const importTransfers = (rows, opts) => runBankImport(rows, opts, { loadLookups, buildPayload });
