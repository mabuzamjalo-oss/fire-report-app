import axios from 'axios';

// Same backend as the citizen app. On your PC, localhost works fine here
// since the dashboard runs in a browser on the same machine as the backend.
// If you ever run the dashboard from a different device, swap this for
// your PC's local IP like we did in the citizen app.
const API_BASE_URL = 'https://cardinal-dreamland-clad.ngrok-free.dev/api'
export const SOCKET_URL = 'https://cardinal-dreamland-clad.ngrok-free.dev';

const api = axios.create({ 
  baseURL: API_BASE_URL, 
  timeout: 10000,
  headers: {
    'ngrok-skip-browser-warning': 'true'
  }
});

export async function getIncidents(status) {
  const params = status ? { status } : {};
  const res = await api.get('/incidents', { params });
  return res.data;
}

export async function getIncident(id) {
  const res = await api.get(`/incidents/${id}`);
  return res.data;
}

export async function updateIncidentStatus(id, status, changed_by) {
  const res = await api.patch(`/incidents/${id}/status`, { status, changed_by });
  return res.data;
}

export async function getUnits(status) {
  const params = status ? { status } : {};
  const res = await api.get('/units', { params });
  return res.data;
}

export async function assignUnit(unitId, incidentId, dispatcherId) {
  const res = await api.post(`/units/${unitId}/assign`, {
    incident_id: incidentId,
    dispatcher_id: dispatcherId,
  });
  return res.data;
}

export default api;
