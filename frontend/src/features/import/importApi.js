import { http } from '../../services/http.js';

// kind: 'deposits' | 'transfers'. Turant { jobId, total } milta hai; progress getImportJob se.
// Content-Type mat lagana: FormData ke liye browser khud boundary ke saath lagata hai
export function startImport(kind, file, orgId, dryRun) {
  const body = new FormData();
  body.append('file', file);
  const qs = new URLSearchParams({ organization_id: orgId, dryRun: String(dryRun) });
  return http(`/api/import/${kind}?${qs}`, { method: 'POST', body });
}

export function getImportJob(jobId) {
  return http(`/api/import/jobs/${jobId}`);
}

export function cancelImportJob(jobId) {
  return http(`/api/import/jobs/${jobId}/cancel`, { method: 'POST' });
}
