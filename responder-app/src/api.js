import axios from 'axios';

// Same IP-swap rule as the citizen app: if you open this on a phone/tablet,
// replace 'localhost' with your PC's local network IP.
const API_BASE_URL = 'http://localhost:4000/api';
export const SOCKET_URL = 'http://localhost:4000';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 10000 });

export async function getUnits() {
  const res = await api.get('/units');
  return res.data;
}

export async function getIncidents(status) {
  const params = status ? { status } : {};
  const res = await api.get('/incidents', { params });
  return res.data;
}

export async function updateIncidentStatus(incidentId, status, changedBy) {
  const res = await api.patch(`/incidents/${incidentId}/status`, {
    status,
    changed_by: changedBy,
  });
  return res.data;
}

export default api;
