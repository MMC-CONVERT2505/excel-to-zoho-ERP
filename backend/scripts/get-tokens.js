// Terminal mein access token, refresh token aur organization ID dikhata hai.
// Chalao: cd backend && npm run tokens
// Pehle browser se Zoho Connect hona chahiye (data/tokens.json ban jaata hai).
import { config } from '../src/config/env.js';
import { getAccessToken } from '../src/auth/auth.service.js';
import { callZoho } from '../src/zoho/zoho.service.js';

try {
  // Access token expire ho gaya ho toh yeh khud refresh karke naya deta hai
  const tokens = await getAccessToken();

  let orgIds = config.zoho.orgId ? [config.zoho.orgId] : [];
  if (!orgIds.length) {
    const { status, data } = await callZoho({ method: 'GET', path: 'organizations', query: {} });
    if (status >= 400) throw new Error(data.message || `Organizations load nahi hui (${status}).`);
    orgIds = (data.organizations || []).map((o) => `${o.organization_id}  (${o.name})`);
  }

  console.log(`
ACCESS TOKEN     : ${tokens.access_token}
  expires at     : ${new Date(tokens.expires_at).toLocaleString()}
REFRESH TOKEN    : ${tokens.refresh_token}
ORGANIZATION ID  : ${orgIds.join('\n                   ') || 'Koi organization nahi mili'}
API DOMAIN       : ${tokens.api_domain}
`);
} catch (e) {
  console.error(`Error: ${e.message}`);
  if (e.status === 401) console.error('Pehle frontend se "Connect Zoho ERP" karo, phir dobara chalao.');
  process.exit(1);
}
