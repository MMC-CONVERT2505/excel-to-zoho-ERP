import { http } from '../../services/http.js';

export const getOrganizations = () => http('/api/zoho/organizations');
