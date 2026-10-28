// Internet / Zoho band ho, ya Zoho ki API limit (429) lag jaye, to row fail karne ki jagah ruko aur wahi call dobara karo.
// Koi time limit nahi — process chahe 2 din chale, net/limit wapas aate hi wahin se aage badhta hai. Sirf Cancel rokta hai.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_EVERY_MS = 10 * 1000;
const MAX_LIMIT_WAIT_MS = 15 * 60 * 1000; // 429 par Retry-After kitna bhi bade, ek baar me itna hi ruko phir check
// Ek Zoho call latak jaye (jawab hi na aaye) to use chhod kar dobara koshish — ye process ka timeout nahi hai
export const CALL_TIMEOUT_MS = 60 * 1000;

// fetch ka network error (net band, DNS, latki call) — Zoho ka jawab nahi
export const isNetworkError = (e) =>
  e?.status === undefined &&
  (e?.name === 'TimeoutError' || e?.name === 'AbortError' ||
    /fetch failed|network|socket|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(`${e?.message} ${e?.cause?.code ?? ''}`));

const since = (started) => {
  const mins = Math.floor((Date.now() - started) / 60000);
  return mins >= 60 ? ` (${Math.floor(mins / 60)} h ${mins % 60} min so far)` : mins ? ` (${mins} min so far)` : '';
};

// fn(afterNetworkError) -> Zoho response. afterNetworkError true ho to pichhli koshish ka jawab kho gaya tha —
// fn pehle check kar sakta hai ki kaam Zoho me ho to nahi gaya.
// onWaiting(message | null) se progress me "waiting" dikhta hai. isCancelled() true -> aakhri jawab/error lauta do.
export async function withNetworkWait(fn, { onWaiting = () => {}, isCancelled = () => false } = {}) {
  const started = Date.now();
  let afterNetworkError = false;
  let waiting = false;
  const wait = async (reason, ms = RETRY_EVERY_MS) => {
    waiting = true;
    onWaiting(`${reason} — waiting and retrying automatically${since(started)}. Nothing is lost; it continues from here.`);
    await sleep(ms);
  };

  try {
    for (;;) {
      let res;
      try {
        res = await fn(afterNetworkError);
      } catch (e) {
        if (!isNetworkError(e) || isCancelled()) throw e;
        afterNetworkError = true;
        await wait('No connection to Zoho (internet down?)');
        continue;
      }
      if (isCancelled()) return res;
      if (res?.status >= 500) {
        afterNetworkError = true; // 5xx par bhi kaam ho gaya ho sakta hai — agli baar pehle check
        await wait(`Zoho server error (HTTP ${res.status})`);
        continue;
      }
      if (res?.status === 429) {
        const retryAfter = Number(res.headers?.get?.('retry-after')) * 1000 || 60 * 1000;
        await wait('Zoho API limit reached', Math.min(Math.max(retryAfter, RETRY_EVERY_MS), MAX_LIMIT_WAIT_MS));
        continue;
      }
      return res;
    }
  } finally {
    if (waiting) onWaiting(null);
  }
}
