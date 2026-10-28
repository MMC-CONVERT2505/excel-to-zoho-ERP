import { config } from '../config/env.js';
import { createState, consumeState } from './state.store.js';
import * as authService from './auth.service.js';

const backToFrontend = (res, query) =>
  res.redirect(`${config.frontendUrl}/?${new URLSearchParams(query)}`);

export function login(_req, res) {
  res.redirect(authService.buildAuthUrl(createState()));
}

export async function callback(req, res) {
  const { code, state, error } = req.query;

  if (error) return backToFrontend(res, { auth: 'error', message: String(error) });
  if (!consumeState(String(state))) {
    return backToFrontend(res, { auth: 'error', message: 'Invalid or expired state' });
  }

  try {
    await authService.exchangeCode(String(code)); // code 2 min valid, one-time
    backToFrontend(res, { auth: 'success' });
  } catch (e) {
    backToFrontend(res, { auth: 'error', message: e.message });
  }
}

export async function status(_req, res) {
  res.json(await authService.getStatus()); // token kabhi frontend ko nahi jaata
}

export async function logout(_req, res) {
  await authService.disconnect();
  res.json({ ok: true });
}
