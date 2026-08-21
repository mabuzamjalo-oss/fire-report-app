import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getIncidents, getUnits, assignUnit, SOCKET_URL } from './api';
import './App.css';

// Fix Leaflet default icons with Vite bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeIcon(emoji, backgroundColor) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: ${backgroundColor};
      width: 32px; height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 5px rgba(0,0,0,0.4);
      border: 2px solid white;
    "><span style="transform: rotate(45deg); font-size: 16px;">${emoji}</span></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
  });
}

const incidentIcon     = makeIcon('🔥', '#e53935');
const unitAvailIcon    = makeIcon('🚒', '#43a047');
const unitDispatchIcon = makeIcon('🚒', '#fb8c00');

// Fixed station pins – circular badge, not a teardrop
const stationIcon = L.divIcon({
  className: 'custom-marker',
  html: `<div style="
    background:#37474f; width:26px; height:26px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 2px 5px rgba(0,0,0,0.4); border:2px solid white;
  "><span style="font-size:13px;">🏢</span></div>`,
  iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -13],
});

const CATEGORY_LABELS = {
  structure_fire: '🏠 Structure Fire',
  veld_fire: '🌾 Veld / Wildfire',
  vehicle_fire: '🚗 Vehicle Fire',
  informal_settlement_fire: '🏘️ Informal Settlement Fire',
  hazmat: '☣️ Hazmat',
  other: '🔥 Other',
};

const STATUS_COLORS = {
  reported: '#e53935', assigned: '#fb8c00', en_route: '#fdd835',
  on_scene: '#1e88e5', contained: '#43a047', cleared: '#9e9e9e',
};

const SEVERITY_COLORS = {
  low: '#43a047', medium: '#fb8c00', high: '#e53935', critical: '#7b1fa2',
};

const DEFAULT_CENTER = [-33.9249, 18.4241];

// Lives inside <MapContainer> to imperatively fly to a selected incident
function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target?.latitude && target?.longitude) {
      map.flyTo([target.latitude, target.longitude], 15, { duration: 1.2 });
    }
  }, [target, map]);
  return null;
}

export default function App() {
  const [incidents, setIncidents]         = useState([]);
  const [units, setUnits]                 = useState([]);
  const [stations, setStations]           = useState([]);
  const [selectedIncident, setSelected]   = useState(null);
  const [alerts, setAlerts]               = useState([]);   // new incident toasts
  const [aiLog, setAiLog]                 = useState([]);   // AI dispatch decisions
  const [connected, setConnected]         = useState(false);
  const [loading, setLoading]             = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [incData, unitData] = await Promise.all([getIncidents(), getUnits()]);
      setIncidents(incData);
      setUnits(unitData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load real stations from backend (all 32 Cape Town stations)
  useEffect(() => {
    fetch('http://localhost:4000/api/stations')
      .then(r => r.json())
      .then(setStations)
      .catch(err => console.warn('Stations not loaded:', err.message));
  }, []);

  useEffect(() => {
    loadData();
    const socket = io(SOCKET_URL);

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // New citizen report → toast alert
    socket.on('incident:new', (incident) => {
      setIncidents(prev => [incident, ...prev]);
      setAlerts(prev => [incident, ...prev]);
    });

    // Status change (manual or AI)
    socket.on('incident:statusUpdate', (update) => {
      setIncidents(prev =>
        prev.map(inc => inc.id === update.id ? { ...inc, status: update.status } : inc)
      );
    });

    // Unit assigned (manual or AI) → refresh units list
    socket.on('incident:assigned', () => loadData());

    // Units freed after incident cleared
    socket.on('units:released', () => loadData());

    // 🤖 AI dispatcher just made a decision — add to the AI log panel
    socket.on('ai:dispatched', (result) => {
      setAiLog(prev => [result, ...prev].slice(0, 20)); // keep last 20
      loadData(); // refresh unit statuses
    });

    return () => socket.disconnect();
  }, [loadData]);

  function handleGoToIncident(incident) {
    setSelected(incident);
    setAlerts(prev => prev.filter(a => a.id !== incident.id));
  }

  function dismissAlert(id) {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  async function handleManualAssign(unitId) {
    if (!selectedIncident) return;
    try {
      await assignUnit(unitId, selectedIncident.id, null);
      setSelected(null);
      loadData();
    } catch (err) {
      alert('Failed to assign unit: ' + (err.response?.data?.error || err.message));
    }
  }

  const availableUnits  = units.filter(u => u.status === 'available');
  const activeIncidents = incidents.filter(i => i.status !== 'cleared');

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🚒 Fire Dispatch Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="ai-badge">🤖 AI Dispatcher Active</span>
          <span className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● Live' : '○ Disconnected'}
          </span>
        </div>
      </header>

      {/* ── Alert toasts (top-right) ───────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="alert-stack">
          {alerts.map(incident => (
            <div key={incident.id} className="alert-toast" onClick={() => handleGoToIncident(incident)}>
              <span className="alert-toast-icon">🚨</span>
              <div className="alert-toast-body">
                <strong>New Incident</strong>
                <span>{CATEGORY_LABELS[incident.category] || incident.category}</span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>AI dispatching…</span>
              </div>
              <button className="alert-toast-dismiss"
                onClick={e => { e.stopPropagation(); dismissAlert(incident.id); }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="dashboard-body">

        {/* ── Left: Incident list ───────────────────────────────────────── */}
        <aside className="incident-list">
          <h2>Active Incidents ({activeIncidents.length})</h2>
          {loading && <p className="muted">Loading…</p>}
          {!loading && activeIncidents.length === 0 && <p className="muted">No active incidents.</p>}
          {activeIncidents.map(incident => (
            <div
              key={incident.id}
              className={`incident-card ${selectedIncident?.id === incident.id ? 'selected' : ''}`}
              onClick={() => handleGoToIncident(incident)}
            >
              <div className="incident-card-top">
                <span>{CATEGORY_LABELS[incident.category] || incident.category}</span>
                <span className="status-pill" style={{ backgroundColor: STATUS_COLORS[incident.status] }}>
                  {incident.status.replace('_', ' ')}
                </span>
              </div>
              {incident.description && <p className="incident-description">{incident.description}</p>}
              <p className="incident-time">{new Date(incident.created_at).toLocaleTimeString()}</p>
            </div>
          ))}
        </aside>

        {/* ── Centre: Map ───────────────────────────────────────────────── */}
        <main className="map-area">
          <MapContainer center={DEFAULT_CENTER} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            <MapFlyTo target={selectedIncident} />

            {/* Real Cape Town station pins */}
            {stations.map(s => (
              <Marker key={s.id} position={[s.latitude, s.longitude]} icon={stationIcon}>
                <Popup>🏢 {s.name} Fire Station</Popup>
              </Marker>
            ))}

            {/* Active incident pins */}
            {activeIncidents.map(incident => (
              <Marker
                key={incident.id}
                position={[incident.latitude, incident.longitude]}
                icon={incidentIcon}
                eventHandlers={{ click: () => handleGoToIncident(incident) }}
              >
                <Popup>
                  <strong>{CATEGORY_LABELS[incident.category]}</strong><br />
                  Status: {incident.status}<br />
                  {incident.description}
                </Popup>
              </Marker>
            ))}

            {/* Unit location pins */}
            {units.map(unit => unit.latitude ? (
              <Marker
                key={unit.id}
                position={[unit.latitude, unit.longitude]}
                icon={unit.status === 'available' ? unitAvailIcon : unitDispatchIcon}
              >
                <Popup>🚒 {unit.name} — {unit.status}</Popup>
              </Marker>
            ) : null)}
          </MapContainer>
        </main>

        {/* ── Right: Assignment panel + AI log ─────────────────────────── */}
        <aside className="assignment-panel">

          {/* Manual assignment (still available as override) */}
          {selectedIncident ? (
            <>
              <h2>Incident Details</h2>
              <p className="muted">
                {CATEGORY_LABELS[selectedIncident.category]} — {selectedIncident.status.replace('_', ' ')}
              </p>
              {selectedIncident.photo_urls?.length > 0 && (
                <img src={selectedIncident.photo_urls[0]} alt="Incident" className="incident-photo" />
              )}
              {selectedIncident.status === 'reported' ? (
                <>
                  <p className="ai-note">🤖 AI is auto-dispatching. You can also manually assign:</p>
                  {availableUnits.length === 0 ? (
                    <p className="muted">No available units.</p>
                  ) : (
                    <div className="unit-list">
                      {availableUnits.map(unit => (
                        <button key={unit.id} className="unit-button" onClick={() => handleManualAssign(unit.id)}>
                          🚒 {unit.name}
                          <span className="unit-type">{unit.unit_type.replace('_', ' ')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">Unit already assigned to this incident.</p>
              )}
            </>
          ) : (
            <p className="muted">Click an incident to view details.</p>
          )}

          {/* Units status summary */}
          <h2 style={{ marginTop: '1.5rem' }}>Units ({units.length})</h2>
          <div className="unit-status-list">
            {units.map(unit => (
              <div key={unit.id} className="unit-status-row">
                <span>{unit.name}</span>
                <span className={`unit-status-pill ${unit.status}`}>{unit.status}</span>
              </div>
            ))}
          </div>

          {/* 🤖 AI Dispatch Log */}
          {aiLog.length > 0 && (
            <>
              <h2 style={{ marginTop: '1.5rem' }}>🤖 AI Dispatch Log</h2>
              <div className="ai-log">
                {aiLog.map((entry, i) => (
                  <div key={i} className="ai-log-entry">
                    <div className="ai-log-header">
                      <span
                        className="ai-severity-badge"
                        style={{ background: SEVERITY_COLORS[entry.severity] || '#666' }}
                      >
                        {entry.severity?.toUpperCase()}
                      </span>
                      <span className="ai-log-time">
                        {new Date(entry.dispatched_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="ai-log-units">
                      {entry.assigned_units?.map(u => `🚒 ${u.name} (${Math.round(u.distance_meters)}m away)`).join(' · ')}
                    </p>
                    <p className="ai-log-reasoning">{entry.reasoning}</p>
                    <p className="ai-log-message">📻 "{entry.dispatch_message}"</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
