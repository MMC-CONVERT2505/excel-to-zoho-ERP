import { useCallback, useEffect, useState } from 'react';
import * as appLockApi from './appLockApi.js';

// App password: production me lagta hai, local me (APP_PASSWORD khali) backend unlocked hi bolta hai.
export function useAppLock() {
  const [unlocked, setUnlocked] = useState(null); // null = check ho raha hai
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      const s = await appLockApi.getSession();
      setUnlocked(!s.required || s.unlocked);
    } catch (e) {
      setUnlocked(false);
      setError(`Could not reach the backend: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    check();
    // Kisi bhi API call par session khatam mila (http.js) -> password screen
    const onLocked = () => { setUnlocked(false); setError('Session expired — enter the password again.'); };
    window.addEventListener('app-locked', onLocked);
    return () => window.removeEventListener('app-locked', onLocked);
  }, [check]);

  const unlock = async (password) => {
    setBusy(true);
    setError(null);
    try {
      await appLockApi.unlock(password);
      setUnlocked(true);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return { unlocked, error, busy, unlock };
}
