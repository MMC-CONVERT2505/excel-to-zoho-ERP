import { config } from '../config/env.js';
import { getAccessToken } from '../auth/auth.service.js';

// signal: optional AbortSignal (timeout). headers: rate-limit (429) par Retry-After padhne ke liye
export async function callZoho({ method, path, query, body, signal }) {
  const { access_token, api_domain } = await getAccessToken();

  const qs = new URLSearchParams(query);
  if (!qs.has('organization_id') && config.zoho.orgId) {
    qs.set('organization_id', config.zoho.orgId);
  }

  const hasBody = !['GET', 'HEAD'].includes(method);
  const res = await fetch(`${api_domain}/erp/v3/${path}?${qs}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${access_token}`, // exact format
      ...(hasBody && { 'Content-Type': 'application/json' }),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
    signal,
  });

  return { status: res.status, headers: res.headers, data: await res.json().catch(() => ({})) };
}
