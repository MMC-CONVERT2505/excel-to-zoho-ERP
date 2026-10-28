import { callZoho } from '../zoho/zoho.service.js';

const TTL = 5 * 60 * 1000;
const cache = new Map(); // orgId -> { at, byName }

// Response me jo pehla array mile wo uthao (key ka naam confirm hone tak safe tareeka)
function extractList(data) {
  for (const k of ['chartofaccounts', 'accounts']) if (Array.isArray(data[k])) return data[k];
  return Object.values(data).find(Array.isArray) || [];
}

// Chart of Accounts -> Map(lowercase account_name -> { id, name, currency })
export async function getAccountMap(orgId) {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL) return hit.byName;

  const byName = new Map();
  for (let page = 1; page <= 50; page++) {
    const { status, data } = await callZoho({
      method: 'GET',
      path: 'chartofaccounts',
      query: { organization_id: orgId, page, per_page: 200 },
    });
    if (status >= 400 || (data.code !== undefined && data.code !== 0)) {
      throw new Error(`Chart of Accounts fetch fail: ${data.message || status}`);
    }
    for (const a of extractList(data)) {
      if (a.account_id && a.account_name) {
        byName.set(String(a.account_name).trim().toLowerCase(), {
          id: a.account_id,
          name: a.account_name,
          currency: a.currency_code,
        });
      }
    }
    if (!data.page_context?.has_more_page) break;
  }
  cache.set(orgId, { at: Date.now(), byName });
  return byName;
}
