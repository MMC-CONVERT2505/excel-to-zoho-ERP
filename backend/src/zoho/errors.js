// Zoho ke error ko user ki bhasha me: { message, hint, reconnect }
// reconnect: true -> connection/token ki dikkat, user ko Zoho dobara connect karna hoga

const CODE_HINTS = {
  57: 'The Zoho connection does not have permission for this — add the ERP.banking scopes to ZOHO_SCOPES in .env, then disconnect and reconnect Zoho',
  9004: 'The currency does not match the bank account — use the bank (To) account\'s currency in the Currency column',
  3045: 'Received From must be a customer in Zoho, not a vendor',
};

const AUTH_PATTERN = /not connected|connect again|invalid_token|invalid oauth|oauth token|token (has )?expired|invalid_code/i;

export function explainZohoError({ status, code, message }) {
  const text = message || (status ? `HTTP ${status}` : 'Unknown error');
  if (status === 401 || AUTH_PATTERN.test(text)) {
    return { message: text, hint: 'Zoho connection expired or was removed — reconnect Zoho and retry the failed rows', reconnect: true };
  }
  if (status === 429) return { message: text, hint: 'Zoho API limit reached — wait a few minutes, then retry the failed rows' };
  if (status >= 500) return { message: text, hint: 'Zoho server problem — retry the failed rows later' };
  if (CODE_HINTS[code]) return { message: text, hint: CODE_HINTS[code] };
  if (status === undefined && /fetch failed|network|ECONN|ETIMEDOUT|ENOTFOUND/i.test(text)) {
    return { message: text, hint: 'Could not reach Zoho (network problem) — check the internet connection and retry the failed rows' };
  }
  return { message: text };
}

// Ek line ka text: "message — hint"
export const describeZohoError = (e) => (e.hint ? `${e.message} — ${e.hint}` : e.message);
