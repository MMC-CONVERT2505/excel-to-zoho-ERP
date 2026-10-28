import { http } from '../../services/http.js';

// type: 'deposit' | 'transfer_fund'
export function listBankTransactions(orgId, type) {
  const qs = new URLSearchParams({ organization_id: orgId, type });
  return http(`/api/delete/bank-transactions?${qs}`);
}

// Turant { jobId, total } milta hai; progress getDeleteJob se
export function deleteBankTransactions(orgId, transactionIds) {
  const qs = new URLSearchParams({ organization_id: orgId });
  return http(`/api/delete/bank-transactions?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_ids: transactionIds }),
  });
}

export function getDeleteJob(jobId) {
  return http(`/api/delete/jobs/${jobId}`);
}

export function cancelDeleteJob(jobId) {
  return http(`/api/delete/jobs/${jobId}/cancel`, { method: 'POST' });
}
