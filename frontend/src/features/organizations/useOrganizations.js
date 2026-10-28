import { useCallback, useEffect, useState } from 'react';
import { getOrganizations } from './organizationsApi.js';

const STORAGE_KEY = 'zoho.organizationId';

const readStored = () => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
};
const writeStored = (id) => {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
};

// Connected Zoho organizations + selected org (browser mein yaad rehta hai)
export function useOrganizations() {
  const [organizations, setOrganizations] = useState(null); // null = loading
  const [selectedId, setSelectedId] = useState(readStored);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const list = (await getOrganizations()).organizations || [];
      setOrganizations(list);
      setSelectedId((current) => {
        if (list.some((o) => o.organization_id === current)) return current;
        const fallback = (list.find((o) => o.is_default_org) || list[0])?.organization_id || null;
        if (fallback) writeStored(fallback);
        return fallback;
      });
    } catch (e) {
      setOrganizations([]);
      setError(e.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const select = (id) => {
    setSelectedId(id);
    writeStored(id);
  };

  const selected = organizations?.find((o) => o.organization_id === selectedId) || null; 
  console.log("orgId", selected?.organization_id)
  return { organizations, selected, selectedId: selected?.organization_id || null, select, error, refresh };
}
