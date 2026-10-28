import { useCallback, useEffect, useState } from 'react';
import * as authApi from './authApi.js';

export function useAuth() {
  const [status, setStatus] = useState(null); // null = loading
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await authApi.getStatus());
    } catch (e) {
      setStatus({ connected: false });
      setNotice({ type: 'error', text: `Could not reach the backend: ${e.message}` });
    }
  }, []);

  // Callback ke baad ?auth=success|error padho, phir URL saaf karo
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has('auth')) {
      setNotice(
        p.get('auth') === 'success'
          ? { type: 'ok', text: 'Zoho ERP connected.' }
          : { type: 'error', text: p.get('message') || 'Connection failed.' }
      );
      window.history.replaceState({}, '', window.location.pathname);
    }
    refresh();
  }, [refresh]);

  const disconnect = async () => {
    setBusy(true);
    try {
      await authApi.logout();
      setNotice({ type: 'ok', text: 'Disconnected. Token revoked.' });
      await refresh();
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    }
    setBusy(false);
  };

  return { status, notice, setNotice, busy, connect: authApi.startLogin, disconnect, refresh };
}
