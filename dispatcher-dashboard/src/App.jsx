import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { io } from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getIncidents, getUnits, assignUnit, SOCKET_URL } from './api';
import './App.css';

// Leaflet's default marker icons don't load correctly with Vite's bundler
// unless we point them at the CDN explicitly.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom pin icons so incidents (fire) and units (trucks) are visually
// distinct on the map at a glance, instead of both using the same default pin.
function makeIcon(emoji, backgroundColor) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: ${backgroundColor};
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 5px rgba(0,0,0,0.4);
      border: 2px solid white;
    "><span style="transform: rotate(45deg); font-size: 16px;">${emoji}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

const incidentIcon = makeIcon('🔥', '#e53935'); // red teardrop = fire incident
const unitAvailableIcon = makeIcon('🚒', '#43a047'); // green teardrop = available unit
const unitDispatchedIcon = makeIcon('🚒', '#fb8c00'); // orange teardrop = dispatched unit

const CATEGORY_LABELS = {
  structure_fire: '🏠 Structure Fire',
  veld_fire: '🌾 Veld / Wildfire',
  vehicle_fire: '🚗 Vehicle Fire',
  informal_settlement_fire: '🏘️ Informal Settlement Fire',
  hazmat: '☣️ Hazmat',
  other: '🔥 Other',
};

const STATUS_COLORS = {
  reported: '#e53935',
  assigned: '#fb8c00',
  en_route: '#fdd835',
  on_scene: '#1e88e5',
  contained: '#43a047',
  cleared: '#9e9e9e',
};

// Default map view centered on Cape Town
const DEFAULT_CENTER = [-33.9249, 18.4241];

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [incidentsData, unitsData] = await Promise.all([
        getIncidents(),
        getUnits(),
      ]);
      setIncidents(incidentsData);
      setUnits(unitsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const socket = io(SOCKET_URL);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // New report comes in from a citizen — prepend it to the list
    socket.on('incident:new', (incident) => {
      setIncidents((prev) => [incident, ...prev]);
    });

    // Responder or dispatcher advanced the status
    socket.on('incident:statusUpdate', (update) => {
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === update.id ? { ...inc, status: update.status } : inc))
      );
    });

    // A unit was assigned — refresh both lists to reflect new availability
    socket.on('incident:assigned', () => {
      loadData();
    });

    return () => socket.disconnect();
  }, [loadData]);

  async function handleAssign(unitId) {
    if (!selectedIncident) return;
    try {
      await assignUnit(unitId, selectedIncident.id, null);
      setSelectedIncident(null);
      loadData();
    } catch (err) {
      alert('Failed to assign unit: ' + (err.response?.data?.error || err.message));
    }
  }

  const availableUnits = units.filter((u) => u.status === 'available');
  const activeIncidents = incidents.filter((i) => i.status !== 'cleared');

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🚒 Fire Dispatch Dashboard</h1>
        <span className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Live' : '○ Disconnected'}
        </span>
      </header>

      <div className="dashboard-body">
        <aside className="incident-list">
          <h2>Active Incidents ({activeIncidents.length})</h2>
          {loading && <p className="muted">Loading...</p>}
          {!loading && activeIncidents.length === 0 && (
            <p className="muted">No active incidents.</p>
          )}
          {activeIncidents.map((incident) => (
            <div
              key={incident.id}
              className={`incident-card ${selectedIncident?.id === incident.id ? 'selected' : ''}`}
              onClick={() => setSelectedIncident(incident)}
            >
              <div className="incident-card-top">
                <span>{CATEGORY_LABELS[incident.category] || incident.category}</span>
                <span
                  className="status-pill"
                  style={{ backgroundColor: STATUS_COLORS[incident.status] }}
                >
                  {incident.status.replace('_', ' ')}
                </span>
              </div>
              {incident.description && (
                <p className="incident-description">{incident.description}</p>
              )}
              <p className="incident-time">
                {new Date(incident.created_at).toLocaleTimeString()}
              </p>
            </div>
          ))}
        </aside>

        <main className="map-area">
          <MapContainer center={DEFAULT_CENTER} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            {activeIncidents.map((incident) => (
              <Marker
                key={incident.id}
                position={[incident.latitude, incident.longitude]}
                icon={incidentIcon}
                eventHandlers={{ click: () => setSelectedIncident(incident) }}
              >
                <Popup>
                  <strong>{CATEGORY_LABELS[incident.category]}</strong>
                  <br />
                  Status: {incident.status}
                  <br />
                  {incident.description}
                </Popup>
              </Marker>
            ))}
            {units.map((unit) =>
              unit.latitude ? (
                <Marker
                  key={unit.id}
                  position={[unit.latitude, unit.longitude]}
                  icon={unit.status === 'available' ? unitAvailableIcon : unitDispatchedIcon}
                >
                  <Popup>
                    🚒 {unit.name} — {unit.status}
                  </Popup>
                </Marker>
              ) : null
            )}
          </MapContainer>
        </main>

        <aside className="assignment-panel">
          {selectedIncident ? (
            <>
              <h2>Assign Unit</h2>
              <p className="muted">
                {CATEGORY_LABELS[selectedIncident.category]} — {selectedIncident.status}
              </p>
              {selectedIncident.photo_urls?.length > 0 && (
                <img
                  src={selectedIncident.photo_urls[0]}
                  alt="Incident photo"
                  className="incident-photo"
                />
              )}
              {selectedIncident.status !== 'reported' ? (
                <p className="muted">This incident already has a unit assigned.</p>
              ) : availableUnits.length === 0 ? (
                <p className="muted">No available units right now.</p>
              ) : (
                <div className="unit-list">
                  {availableUnits.map((unit) => (
                    <button
                      key={unit.id}
                      className="unit-button"
                      onClick={() => handleAssign(unit.id)}
                    >
                      🚒 {unit.name}
                      <span className="unit-type">{unit.unit_type.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Select an incident to assign a unit.</p>
          )}

          <h2 style={{ marginTop: '2rem' }}>All Units ({units.length})</h2>
          <div className="unit-status-list">
            {units.map((unit) => (
              <div key={unit.id} className="unit-status-row">
                <span>{unit.name}</span>
                <span className={`unit-status-pill ${unit.status}`}>{unit.status}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
