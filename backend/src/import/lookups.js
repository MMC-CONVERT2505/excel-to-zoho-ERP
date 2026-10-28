import { callZoho } from '../zoho/zoho.service.js';

const TTL = 5 * 60 * 1000;
const cache = new Map(); // `${orgId}:${kind}` -> { at, value }

async function cached(orgId, kind, loader) {
  const key = `${orgId}:${kind}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const firstArray = (data, keys) => {
  for (const k of keys) if (Array.isArray(data[k])) return data[k];
  return Object.values(data).find(Array.isArray) || [];
};

async function get(path, orgId, query = {}) {
  const { status, data } = await callZoho({ method: 'GET', path, query: { organization_id: orgId, ...query } });
  if (status >= 400 || (data.code !== undefined && data.code !== 0)) {
    throw new Error(`Failed to fetch ${path}: ${data.message || status}`);
  }
  return data;
}

async function getAllPages(path, orgId, keys) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const data = await get(path, orgId, { page, per_page: 200 });
    all.push(...firstArray(data, keys));
    if (!data.page_context?.has_more_page) break;
  }
  return all;
}

// Chart of Accounts: naam -> { id, name, currency }
export const getAccountMap = (orgId) =>
  cached(orgId, 'accounts', async () => {
    const map = new Map();
    for (const a of await getAllPages('chartofaccounts', orgId, ['chartofaccounts', 'accounts'])) {
      if (a.account_id && a.account_name) {
        map.set(String(a.account_name).trim().toLowerCase(), { id: a.account_id, name: a.account_name, currency: a.currency_code });
      }
    }
    return map;
  });

// Currencies: "AED" -> currency_id
export const getCurrencyMap = (orgId) =>
  cached(orgId, 'currencies', async () => {
    const data = await get('settings/currencies', orgId);
    const map = new Map();
    for (const c of firstArray(data, ['currencies'])) {
      if (c.currency_id && c.currency_code) map.set(String(c.currency_code).trim().toUpperCase(), c.currency_id);
    }
    return map;
  });

// Contacts: naam -> { id, type } (same naam ho to customer type ko pehle rakhta hai)
export const getCustomerMap = (orgId) =>
  cached(orgId, 'customers', async () => {
    const map = new Map();
    for (const c of await getAllPages('contacts', orgId, ['contacts'])) {
      const name = String(c.contact_name ?? '').trim().toLowerCase();
      if (!name || !c.contact_id) continue;
      if (!map.has(name) || c.contact_type === 'customer') map.set(name, { id: c.contact_id, name: c.contact_name, type: c.contact_type });
    }
    return map;
  });

// Option tree (children ke saath) ko flat list me
const flattenOptions = (list) => (list || []).flatMap((o) => [o, ...flattenOptions(o.children)]);

// Reporting tags: tag naam -> { id, name, options: Map(option naam -> option_id) }
// Options list me nahi aate; Zoho unhe GET reportingtags/options?tag_id=... se deta hai
export const getTagMap = (orgId) =>
  cached(orgId, 'tags', async () => {
    const data = await get('reportingtags', orgId);
    const map = new Map();
    for (const t of firstArray(data, ['tags', 'reporting_tags', 'reportingtags'])) {
      if (!t.tag_id || t.is_active === false) continue;
      const full = await get('reportingtags/options', orgId, { tag_id: t.tag_id });
      const options = flattenOptions(full.options || full.tag_options).filter((o) => o.is_active !== false);
      // Banking module me tag kis level pe lagta hai (transaction / line_item) — tag detail ke entities me
      const detail = await get(`reportingtags/${t.tag_id}`, orgId);
      const banking = (detail.tag?.entities || []).find((e) => e.entity_name === 'banking');
      map.set(String(t.tag_name ?? '').trim().toLowerCase(), {
        id: t.tag_id,
        name: t.tag_name,
        banking: banking ? { enabled: banking.is_enabled !== false, preference: banking.preference } : null,
        options: new Map(options.map((o) => [String(o.tag_option_name ?? o.option_name ?? '').trim().toLowerCase(), o.tag_option_id ?? o.option_id])),
        optionNames: options.map((o) => String(o.tag_option_name ?? o.option_name ?? '').trim()).filter(Boolean), // "did you mean" ke liye
      });
    }
    return map;
  });

// Ek Reference# ki entry Zoho me hai? -> transaction_id | null (network toot kar wapas aaye to "bani ya nahi" check)
// Zoho ka reference_number filter poora match nahi karta, isliye exact match yahan
export async function findByReference(orgId, reference, type, signal) {
  const ref = String(reference ?? '').trim();
  const { status, data } = await callZoho({ method: 'GET', path: 'banktransactions', query: { organization_id: orgId, reference_number: ref }, signal });
  if (status >= 400 || (data.code !== undefined && data.code !== 0)) throw Object.assign(new Error(data.message || `HTTP ${status}`), { status });
  const hit = firstArray(data, ['banktransactions', 'transactions'])
    .find((t) => t.transaction_type === type && String(t.reference_number ?? '').trim().toLowerCase() === ref.toLowerCase());
  return hit?.transaction_id ?? null;
}

// Zoho me pehle se bani entries: reference# (lowercase) -> transaction_id, sirf is type ki.
// Cache nahi — duplicate check ke liye hamesha taaza list chahiye.
export async function getExistingRefs(orgId, type) {
  const map = new Map();
  for (const t of await getAllPages('banktransactions', orgId, ['banktransactions', 'transactions'])) {
    const ref = String(t.reference_number ?? '').trim().toLowerCase();
    if (ref && t.transaction_type === type && !map.has(ref)) map.set(ref, t.transaction_id);
  }
  return map;
}