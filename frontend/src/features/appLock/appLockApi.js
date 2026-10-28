import { http } from '../../services/http.js';

export const getSession = () => http('/auth/app-session');
export const unlock = (password) => http('/auth/app-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password }),
});
