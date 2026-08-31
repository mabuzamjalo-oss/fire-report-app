import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getIncidents, updateIncidentStatus, SOCKET_URL } from './api';
import './App.css';

const CATEGORY_LABELS = {
  structure_fire: '🏠 Structure Fire',
  veld_fire: '🌾 Veld / Wildfire',
  vehicle_fire: '🚗 Vehicle Fire',
  informal_settlement_fire: '🏘️ Informal Settlement Fire',
  hazmat: '☣️ Hazmat',
  other: '🔥 Other',
};

// What each status can advance to next. Mirrors the backend's STATUS_FLOW —
// keeping the same rules here means the button only ever offers a valid move.
const NEXT_STATUS = {
  assigned: 'en_route',
  en_route: 'on_scene',
  on_scene: 'contained',
  contained: 'cleared',
};

const NEXT_LABEL = {
  assigned: 'Mark En Route',
  en_route: 'Mark On Scene',
  on_scene: 'Mark Contained',
  contained: 'Mark Cleared',
};

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const loadIncidents = useCallback(async () => {
    try {
      const data = await getIncidents();
      // Responder only cares about incidents that have a unit assigned
      // and aren't finished yet.
      setIncidents(data.filter((i) => i.status !== 'reported' && i.status !== 'cleared'));
    } catch (err) {
      console.error('Failed to load incidents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIncidents();
    const socket = io(SOCKET_URL, {
  extraHeaders: {
    'ngrok-skip-browser-warning': 'true'
  },
  transports: ['websocket', 'polling']
});
    socket.on('incident:assigned', loadIncidents);
    socket.on('incident:statusUpdate', loadIncidents);
    return () => socket.disconnect();
  }, [loadIncidents]);

  async function handleAdvance(incident) {
    const nextStatus = NEXT_STATUS[incident.status];
    if (!nextStatus) return;

    setUpdatingId(incident.id);
    try {
      await updateIncidentStatus(incident.id, nextStatus, null);
      await loadIncidents();
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.error || err.message));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="responder-app">
      <header className="responder-header">
        <h1>🚒 Responder</h1>
        <p>Your assigned incidents</p>
      </header>

      <div className="responder-list">
        {loading && <p className="muted">Loading...</p>}
        {!loading && incidents.length === 0 && (
          <p className="muted">No active assignments right now.</p>
        )}

        {incidents.map((incident) => (
          <div key={incident.id} className="responder-card">
            <div className="responder-card-top">
              <span className="category">{CATEGORY_LABELS[incident.category]}</span>
              <span className={`status-pill ${incident.status}`}>
                {incident.status.replace('_', ' ')}
              </span>
            </div>

            {incident.description && (
              <p className="description">{incident.description}</p>
            )}

            <p className="coords">
              📍 {incident.latitude?.toFixed(5)}, {incident.longitude?.toFixed(5)}
            </p>
            <a
              className="directions-link"
              href={`https://www.google.com/maps/dir/?api=1&destination=${incident.latitude},${incident.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Google Maps →
            </a>

            {NEXT_STATUS[incident.status] && (
              <button
                className="advance-button"
                disabled={updatingId === incident.id}
                onClick={() => handleAdvance(incident)}
              >
                {updatingId === incident.id ? 'Updating...' : NEXT_LABEL[incident.status]}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
