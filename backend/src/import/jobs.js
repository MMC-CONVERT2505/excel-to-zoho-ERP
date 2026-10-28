import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isNetworkError } from '../zoho/resilient.js';
import { config } from '../config/env.js';

// Import/delete jobs: frontend jobId se progress poll karta hai.
// Har job ka status (rows ka result, file nahi) data/jobs me bhi save hota hai — server restart ke baad bhi pata rahe
// kaun si rows Zoho me gayi aur kaun si baaki hain. Job chahe kitna bhi lamba chale (koi time limit nahi);
// khatam hone ke 3 din baad apne aap hat jaata hai.
const DIR = path.join(config.dataDir, 'jobs');
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const SAVE_GAP_MS = 1000;

const jobs = new Map(); // id -> { job (API me jaata hai), meta (private) }
const restorers = new Map(); // naam -> (partial, pending, job) => result — adhoore job ka result banane ke liye

const jsonFile = (id) => path.join(DIR, `${id}.json`);

function save(id) {
  const entry = jobs.get(id);
  if (!entry) return;
  const { job, meta } = entry;
  meta.saveTimer = null;
  const data = JSON.stringify({ job, pending: meta.pending, partial: meta.partial, restore: meta.restore, savedAt: Date.now() });
  fs.promises.writeFile(jsonFile(id), data).catch((e) => console.error(`Could not save job ${id}:`, e.message));
}

const scheduleSave = (id, meta) => {
  if (!meta.saveTimer) meta.saveTimer = setTimeout(() => save(id), SAVE_GAP_MS);
};

// work(onProgress, isCancelled) -> result
// onProgress(n, { stats, results, last, waiting }): progress, adhoore results (save ke liye), aakhri entry, intezaar ka message
// opts.info: job ke saath API me jaane wali jaankari (kind, dryRun, fileName)
// opts.pending: saari rows/IDs — server beech me ruk jaye to inme se jo nahi gayi wo 'cancelled' maani jaati hain
// opts.restore: registerRestorer wala naam. Upload ki file yahan save NAHI hoti (report browser me banta hai).
export function startJob(total, work, { info = {}, pending = [], restore } = {}) {
  const job = { id: randomUUID(), ...info, total, processed: 0, done: false, cancelling: false, waiting: null, last: null, error: null, result: null, startedAt: Date.now() };
  const meta = { pending, partial: [], restore, saveTimer: null };
  jobs.set(job.id, { job, meta });

  fs.mkdirSync(DIR, { recursive: true });
  save(job.id);

  const onProgress = (n, extra = {}) => {
    job.processed = n;
    if (extra.stats) job.stats = extra.stats;
    if (extra.last) job.last = extra.last;
    if ('waiting' in extra) job.waiting = extra.waiting;
    if (extra.results) meta.partial = extra.results;
    scheduleSave(job.id, meta);
  };

  work(onProgress, () => job.cancelling)
    .then((result) => { job.result = result; })
    .catch((e) => {
      job.error = isNetworkError(e)
        ? 'Could not reach Zoho (internet down?) — nothing was changed. Check the connection and try again.'
        : e.message;
    })
    .finally(() => {
      job.done = true;
      job.finishedAt = Date.now();
      job.waiting = null;
      clearTimeout(meta.saveTimer);
      meta.partial = []; // poora result job.result me hai
      save(job.id);
    });
  return job;
}

export const getJob = (id) => jobs.get(id)?.job;

// Cancel: chal rahi entry poori hoti hai, baaki chhod di jaati hain
export function cancelJob(id) {
  const job = getJob(id);
  if (job && !job.done) job.cancelling = true;
  return job;
}

export const registerRestorer = (name, fn) => restorers.set(name, fn);

function remove(id) {
  jobs.delete(id);
  fs.rmSync(jsonFile(id), { force: true });
}

// Server start par: saved jobs wapas load karo. Jo job server rukne se adhoora reh gaya,
// uska result bachi rows ko 'cancelled' maan kar bana do — user ko pata rahe kya gaya, kya baaki hai.
export function restoreJobs() {
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch { return; }
  for (const f of files) {
    const id = f.slice(0, -5);
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      const { job } = saved;
      if (job.done && Date.now() - (job.finishedAt || saved.savedAt || 0) > KEEP_MS) { remove(id); continue; }
      const meta = { pending: saved.pending || [], partial: saved.partial || [], restore: saved.restore, saveTimer: null };
      jobs.set(id, { job, meta });
      if (!job.done) {
        const restorer = restorers.get(meta.restore);
        if (restorer) job.result = restorer(meta.partial, meta.pending, job);
        else job.error = 'The server stopped while this job was running';
        Object.assign(job, { done: true, interrupted: true, waiting: null, cancelling: false, finishedAt: Date.now() });
        meta.partial = [];
        save(id);
      }
    } catch (e) {
      console.error(`Could not restore job ${id}:`, e.message);
    }
  }
}

// Khatam hue purane jobs (3 din se zyada) har ghante saaf — chal rahe job ko kabhi nahi chhuta
setInterval(() => {
  for (const [id, { job }] of jobs) if (job.done && Date.now() - job.finishedAt > KEEP_MS) remove(id);
}, 60 * 60 * 1000).unref();
