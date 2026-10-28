import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Local setup yahin code me (|| ke baad wali values). .env me sirf wahi likho jo badalna hai — production ki values.
// Jaise PORT=4402 likha hai to 4402, nahi likha to 5000. Hosting panel ke env variables bhi isi tarah chalte hain.
// NODE_ENV=production -> password zaroori + frontend build backend se serve.
const backendDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(backendDir, '.env') });

const e = process.env;
const isProd = e.NODE_ENV === 'production';

export const config = {
  isProd,
  port: e.PORT || 5000,
  frontendUrl: (e.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  // tokens.json + jobs/ yahan save hote hain. Production me app folder ke bahar rakho, taaki redeploy par na mite.
  dataDir: e.DATA_DIR ? path.resolve(e.DATA_DIR) : path.join(backendDir, 'data'),
  // Frontend build (npm run build) — production me backend isi ko serve karta hai
  frontendDist: path.join(backendDir, '..', 'frontend', 'dist'),
  // App kholne ka password. Local me nahi lagta; production me zaroori.
  appPassword: e.APP_PASSWORD || '',
  zoho: {
    accountsUrl: e.ACCOUNTS_URL || 'https://accounts.zoho.in',
    apiDomain: e.API_DOMAIN || 'https://www.zohoapis.in',
    clientId: e.ZOHO_CLIENT_ID, // secret hai — code me nahi, sirf .env me
    clientSecret: e.ZOHO_CLIENT_SECRET,
    redirectUri: e.ZOHO_REDIRECT_URI || 'http://localhost:5000/auth/callback',
    scopes: e.ZOHO_SCOPES || 'ERP.settings.READ,ERP.contacts.ALL,ERP.invoices.ALL,ERP.banking.READ,ERP.banking.CREATE,ERP.banking.DELETE,ERP.accountants.READ',
    orgId: e.ZOHO_ORG_ID,
  },
};

const required = {
  ZOHO_CLIENT_ID: config.zoho.clientId,
  ZOHO_CLIENT_SECRET: config.zoho.clientSecret,
  ...(isProd && { FRONTEND_URL: e.FRONTEND_URL, ZOHO_REDIRECT_URI: e.ZOHO_REDIRECT_URI, APP_PASSWORD: config.appPassword }),
};
for (const [key, value] of Object.entries(required)) {
  if (!value || value.startsWith('PASTE_')) {
    console.error(`.env mein ${key} bharo.`);
    process.exit(1);
  }
}

if (isProd && config.appPassword.length < 10) {
  console.error('APP_PASSWORD kam se kam 10 characters ka rakho.');
  process.exit(1);
}
if (isProd && /localhost|127\.0\.0\.1/.test(`${config.zoho.redirectUri} ${config.frontendUrl}`)) {
  console.warn('Warning: production me ZOHO_REDIRECT_URI / FRONTEND_URL abhi bhi localhost par hain — apna domain daalo.');
}
