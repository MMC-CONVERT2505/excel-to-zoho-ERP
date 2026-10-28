import { http } from '../../services/http.js';

export const getStatus = () => http('/auth/status');
export const logout = () => http('/auth/logout', { method: 'POST' });
export const startLogin = () => {
  window.location.href = '/auth/login'; // backend Zoho consent page par redirect karega
};
