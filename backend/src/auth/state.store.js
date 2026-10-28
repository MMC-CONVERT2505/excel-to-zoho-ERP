import crypto from 'crypto';

// CSRF protection: login ke time state banta hai, callback pe verify hota hai (10 min)
const states = new Map();

export function createState() {
  const state = crypto.randomBytes(16).toString('hex');
  states.set(state, Date.now() + 10 * 60 * 1000);
  return state;
}

export function consumeState(state) {
  const expiresAt = states.get(state);
  states.delete(state);
  return Boolean(expiresAt && expiresAt > Date.now());
}
