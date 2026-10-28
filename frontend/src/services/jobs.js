import { useEffect } from 'react';

const POLL_MS = 700;
const OFFLINE_POLL_MS = 5000; // server tak na pahunche to dheere-dheere koshish karte raho
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Backend job ko khatam hone tak poll karo — koi time limit nahi (job 2 din bhi chale to chalega).
// onUpdate(job) har baar. onOffline(true/false): server tak pahunch nahi rahe / wapas mil gaya.
// Job khatam -> job, job.error -> throw. 404 (server ko job hi nahi pata) -> lostMessage.
export async function pollJob(getJob, onUpdate, { lostMessage, onOffline = () => {} }) {
  let offline = false;
  for (;;) {
    await wait(offline ? OFFLINE_POLL_MS : POLL_MS);
    let job;
    try {
      job = await getJob();
    } catch (e) {
      if (e.status === 404) throw new Error(lostMessage);
      if (e.status === 401) throw e; // app password ka session khatam — job server par chalta rahega
      if (!offline) { offline = true; onOffline(true); }
      continue; // network / server restart — job server par chal raha hai ya save hai, koshish jaari
    }
    if (offline) { offline = false; onOffline(false); }
    onUpdate(job);
    if (job.done) {
      if (job.error) throw new Error(job.error);
      return job;
    }
  }
}

// Chal rahe job ki id browser me — reload / tab band karke kholne par wahi progress / result wapas
export const savedJob = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  clear: (key) => { try { localStorage.removeItem(key); } catch { /* private mode */ } },
};

// Kaam chalte waqt tab band / reload karne par browser warning de
export function useLeaveWarning(active) {
  useEffect(() => {
    if (!active) return undefined;
    const onLeave = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [active]);
}

// Zoho connection/token ki dikkat — user ko "Reconnect Zoho" dikhana hai
export const isAuthError = (message) =>
  /not connected|connect again|reconnect zoho|invalid_token|oauth|token (has )?expired|invalid_code/i.test(String(message ?? ''));
