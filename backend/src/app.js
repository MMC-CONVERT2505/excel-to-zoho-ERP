import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { appLockRoutes, requireAppLogin } from './auth/app-lock.js';
import authRoutes from './auth/auth.routes.js';
import zohoRoutes from './zoho/zoho.routes.js';
import importRoutes from './import/import.routes.js';
import deleteRoutes from './delete/delete.routes.js';
import { restoreJobs } from './import/jobs.js';

const app = express();

if (config.isProd) app.set('trust proxy', 1); // Nginx / Hostinger proxy ke peeche: sahi IP aur https
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.use('/auth', appLockRoutes);                  // app password (lock ke bina khulta hai)
app.use(['/auth', '/api'], requireAppLogin);      // iske aage sab password ke baad hi
app.use('/auth', authRoutes);     // sirf authentication
app.use('/api/zoho', zohoRoutes); // Zoho API calls (token auth module se aata hai)
app.use('/api/import', importRoutes); // Excel import
app.use('/api/delete', deleteRoutes); // Excel se bank transactions delete

// Production: frontend ka build (frontend/dist) yahi server deta hai — ek port, ek domain
if (config.isProd) {
  const indexHtml = path.join(config.frontendDist, 'index.html');
  if (!fs.existsSync(indexHtml)) console.warn(`Frontend build nahi mila (${indexHtml}) — pehle frontend me "npm run build" chalao.`);
  app.use(express.static(config.frontendDist, { index: false }));
  app.get(/^\/(?!api\/|auth\/).*/, (_req, res) => res.sendFile(indexHtml));
}

// Pichhle run ke saved jobs (routes ke restorers register hone ke baad) — server ruka tha to adhoore jobs ka result banta hai
restoreJobs();

export default app;
