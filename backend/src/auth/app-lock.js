import crypto from 'crypto';
import { Router } from 'express';
import { config } from '../config/env.js';

// App ka password lock (Zoho login se alag). APP_PASSWORD khali ho (local) to lock band.
// Sahi password par HttpOnly cookie milti hai: "<expiry>.<hmac>" — password badlo to sab purani cookies bekaar.
const COOKIE = 'app_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 10; // ek IP se 15 min me itni galat koshish ke baad ruk jao
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const enabled = () => Boolean(config.appPassword);
const sign = (value) => crypto.createHmac('sha256', `app-lock:${config.appPassword}`).update(value).digest('hex');
const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

function readCookie(req) {
  const pair = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  return pair ? decodeURIComponent(pair.slice(COOKIE.length + 1)) : '';
}

function isUnlocked(req) {
  if (!enabled()) return true;
  const [expiry, mac] = readCookie(req).split('.');
  return Boolean(expiry && mac && Number(expiry) > Date.now() && safeEqual(mac, sign(expiry)));
}

const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' });

const fails = new Map(); // ip -> { count, until }
function tooManyFails(ip) {
  const f = fails.get(ip);
  if (f && f.until < Date.now()) fails.delete(ip);
  return (fails.get(ip)?.count || 0) >= MAX_FAILS;
}
function addFail(ip) {
  const f = fails.get(ip) || { count: 0, until: Date.now() + FAIL_WINDOW_MS };
  f.count++;
  fails.set(ip, f);
}

// /auth/app-session, /auth/app-login, /auth/app-logout — ye lock ke bina khulte hain
export const appLockRoutes = Router();

appLockRoutes.get('/app-session', (req, res) => {
  res.json({ required: enabled(), unlocked: isUnlocked(req) });
});

appLockRoutes.post('/app-login', (req, res) => {
  if (!enabled()) return res.json({ ok: true });
  if (tooManyFails(req.ip)) return res.status(429).json({ message: 'Too many wrong attempts — try again in 15 minutes' });
  if (!safeEqual(req.body?.password ?? '', config.appPassword)) {
    addFail(req.ip);
    return res.status(401).json({ message: 'Wrong password' });
  }
  fails.delete(req.ip);
  const expiry = String(Date.now() + SESSION_MS);
  res.cookie(COOKIE, `${expiry}.${sign(expiry)}`, { ...cookieOptions(), maxAge: SESSION_MS });
  res.json({ ok: true });
});

appLockRoutes.post('/app-logout', (_req, res) => {
  res.clearCookie(COOKIE, cookieOptions());
  res.json({ ok: true });
});

// Baaki sab /auth aur /api routes ke aage
export function requireAppLogin(req, res, next) {
  if (isUnlocked(req)) return next();
  if (req.method === 'GET' && req.path === '/login') return res.redirect(`${config.frontendUrl}/`); // browser navigation
  res.status(401).json({ code: 'APP_LOCKED', message: 'Enter the app password to continue' });
}
