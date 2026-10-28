import { config } from '../config/env.js';
import { loadTokens, saveTokens, clearTokens } from './token.store.js';

const { accountsUrl, apiDomain, clientId, clientSecret, redirectUri, scopes } = config.zoho;

// Step 1: Zoho consent page ka URL
export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    scope: scopes,
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    access_type: 'offline', // refresh token ke liye
    prompt: 'consent',
    state,
  });
  return `${accountsUrl}/oauth/v2/auth?${params}`;
}

// Zoho token endpoint: POST, params query string mein (body mein nahi)
async function tokenRequest(params) {
  const res = await fetch(`${accountsUrl}/oauth/v2/token?${new URLSearchParams(params)}`, {
    method: 'POST',
  });
  const data = await res.json();
  if (data.error) throw new Error(`Zoho error: ${data.error}`);
  return data;
}

// Step 2: code -> access token + refresh token
export async function exchangeCode(code) {
  const data = await tokenRequest({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  if (!data.refresh_token) {
    throw new Error('Refresh token not received. Please connect again.');
  }

  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    api_domain: data.api_domain || apiDomain,
    expires_at: Date.now() + data.expires_in * 1000,
    connected_at: new Date().toISOString(),
  });
}

// Step 3: valid access token do, zaroorat ho toh auto-refresh
let refreshing = null;

export async function getAccessToken() {
  const tokens = await loadTokens();
  if (!tokens) throw Object.assign(new Error('Zoho is not connected'), { status: 401 });

  if (tokens.expires_at - 60_000 > Date.now()) return tokens;

  // Ek time pe ek hi refresh (10 tokens / 10 min limit se bachne ke liye)
  if (!refreshing) {
    refreshing = (async () => {
      const data = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const updated = {
        ...tokens,
        access_token: data.access_token,
        api_domain: data.api_domain || tokens.api_domain,
        expires_at: Date.now() + data.expires_in * 1000,
      };
      await saveTokens(updated);
      return updated;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function getStatus() {
  const t = await loadTokens();
  if (!t) return { connected: false };
  return {
    connected: true,
    connectedAt: t.connected_at,
    accessTokenExpiresAt: new Date(t.expires_at).toISOString(),
    apiDomain: t.api_domain,
  };
}

export async function disconnect() {
  const t = await loadTokens();
  if (t?.refresh_token) {
    await fetch(
      `${accountsUrl}/oauth/v2/token/revoke?${new URLSearchParams({ token: t.refresh_token })}`,
      { method: 'POST' }
    ).catch(() => {});
  }
  await clearTokens();
}
