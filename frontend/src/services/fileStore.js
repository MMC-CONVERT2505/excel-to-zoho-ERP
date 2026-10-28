// Upload ki Excel browser ke IndexedDB me (PC par hi) — page reload ke baad bhi report / failed rows ban sakein.
// Server par file save nahi hoti. Har import type ki sirf aakhri file rehti hai.
const DB = 'zoho-import';
const STORE = 'files';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// Fail ho to chupchaap null — ye sirf suvidha hai (private mode me IndexedDB band ho sakta hai)
export const fileStore = {
  put: (key, file) => run('readwrite', (s) => s.put(file, key)).catch(() => null),
  get: (key) => run('readonly', (s) => s.get(key)).catch(() => null),
};
