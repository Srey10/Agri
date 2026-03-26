import { useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import { Package, AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react'
import './Traceability.css'

const batches = [
  { id: '#TR-902', name: 'Golden Wheat', variety: 'DBW-222', status: 'IN TRANSIT', harvested: '13 Oct 2025', from: 'Farm Block – Ludhiana, Punjab', to: 'Regional Hub – Chandigarh', weight: 45, quality: 'A+', temp: 18.4, humidity: 62 },
  { id: '#TR-881', name: 'Basmati Rice', variety: 'Pusa-1121', status: 'QUALITY CHECK', harvested: '11 Oct 2025', from: 'Farm Block – Karnal, Haryana', to: 'Processing Unit – Panipat', weight: 28, quality: 'A+', temp: 17.2, humidity: 58 },
  { id: '#TR-772', name: 'Organic Sugarcane', variety: 'CoS-9301', status: 'DELIVERED', harvested: '8 Oct 2025', from: 'Farm Block – Meerut, U.P.', to: 'Sugar Mill – Muzaffarnagar', weight: 120, quality: 'A', temp: 22.1, humidity: 70 },
  { id: '#TR-655', name: 'Cotton (कपास)', variety: 'Bt-Cotton', status: 'HARVEST READY', harvested: '15 Oct 2025', from: 'Farm Block – Akola, Maharashtra', to: 'Pending Assignment', weight: 32, quality: 'B+', temp: 24.5, humidity: 55 },
]

// Route path: Ludhiana → Chandigarh
const routePath = [
  [30.9010, 75.8573], [30.9500, 76.0000], [31.0000, 76.3000], [30.7334, 76.7794]
]

const routeDeviation = [[30.9500, 76.0000], [30.9700, 76.1500], [30.9600, 76.2000], [31.0000, 76.3000]]

const statusColor = { 'IN TRANSIT': '#3b82f6', 'QUALITY CHECK': '#f97316', 'DELIVERED': '#22c55e', 'HARVEST READY': '#eab308' }

export default function Traceability() {
  const [selected, setSelected] = useState(batches[0])
  const [view, setView] = useState('live')

  return (
    <div className="trace-page fade-in">
      <div className="trace-header">
        <div>
          <h1 className="dash-title">📦 Produce Traceability & AI Quality Monitoring</h1>
          <p className="dash-sub">Real-time geospatial lifecycle monitoring • Blockchain verified</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`view-btn ${view === 'live' ? 'active' : ''}`} onClick={() => setView('live')}>Live View</button>
          <button className={`view-btn ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}>History Archive</button>
          <button className="btn-primary" style={{ fontSize: 12 }}><Package size={14} /> New Batch Scan</button>
        </div>
      </div>

      {/* System Health */}
      <div className="trace-health-bar">
        <div className="health-item">
          <CheckCircle size={14} className="text-green" />
          <span>System Health: </span><strong className="text-green">99.2% Traceability Confidence</strong>
        </div>
        <div className="health-item">
          <span className="dot dot-green pulse"></span>
          <span>Blockchain: Ludhiana Node-08 Active</span>
        </div>
        <div className="health-item">
          <Clock size={14} className="text-muted" />
          <span className="text-muted">Last sync: 2 mins ago</span>
        </div>
      </div>

      <div className="trace-main">
        {/* Left: Batch List */}
        <div className="trace-sidebar">
          <div className="card-section-title" style={{ padding: '0 0 10px 0' }}>Batch Tracking</div>
          <div className="batch-list">
            {batches.map(b => (
              <div key={b.id} className={`batch-card ${selected.id === b.id ? 'active' : ''}`} onClick={() => setSelected(b)}>
                <div className="batch-card-top">
                  <div className="batch-name">{b.name}</div>
                  <div className="batch-status-dot" style={{ background: statusColor[b.status] }}></div>
                </div>
                <div className="batch-id">{b.id}</div>
                <div className="batch-dates">Harvested {b.harvested}</div>
                <div className="progress-bar" style={{ marginTop: 8, marginBottom: 4 }}>
                  <div className="progress-fill" style={{ width: b.status === 'DELIVERED' ? '100%' : b.status === 'IN TRANSIT' ? '60%' : b.status === 'QUALITY CHECK' ? '80%' : '40%' }} />
                </div>
                <div className={`badge ${b.status === 'DELIVERED' ? 'badge-green' : b.status === 'IN TRANSIT' ? 'badge-blue' : b.status === 'QUALITY CHECK' ? 'badge-orange' : 'badge-yellow'}`} style={{ fontSize: 10 }}>
                  {b.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Map + Quality */}
        <div className="trace-center">
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div className="trace-map-header">
              <div>
                <div className="trace-map-title">🗺️ Movement Mapping – {selected.id} {selected.name}</div>
                <div className="text-sm text-muted" style={{ marginTop: 3 }}>Departure: {selected.from}</div>
                <div className="text-sm text-muted">Destination: {selected.to}</div>
              </div>
              <div className="badge badge-blue pulse">LIVE GPS</div>
            </div>
            <MapContainer center={[30.9010, 75.8573]} zoom={8} style={{ height: 300 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" opacity={0.85} />
              <Polyline positions={routePath} pathOptions={{ color: '#22c55e', weight: 4 }} />
              {selected.status === 'IN TRANSIT' && (
                <>
                  <Polyline positions={routeDeviation} pathOptions={{ color: '#f97316', weight: 3, dashArray: '8,4' }} />
                  <CircleMarker center={[30.9700, 76.1500]} radius={12} pathOptions={{ color: '#fff', weight: 2, fillColor: '#f97316', fillOpacity: 1 }}>
                    <Popup><strong>⚠️ Route Deviation Detected</strong><br />Batch moved 4.2km outside planned corridor</Popup>
                  </CircleMarker>
                </>
              )}
              <CircleMarker center={[30.9010, 75.8573]} radius={10} pathOptions={{ color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }}>
                <Popup>🟢 Departure: {selected.from}</Popup>
              </CircleMarker>
              <CircleMarker center={[30.7334, 76.7794]} radius={10} pathOptions={{ color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }}>
                <Popup>🔵 Destination: {selected.to}</Popup>
              </CircleMarker>
            </MapContainer>

            {selected.status === 'IN TRANSIT' && (
              <div className="route-deviation-alert">
                <AlertTriangle size={14} /> Route Deviation Detected – {selected.id} moved 4.2km outside planned logistics corridor.
                <span className="intercept-btn">INTERCEPT PROTOCOL</span>
              </div>
            )}
          </div>

          {/* Quality Analytics */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Quality Analytics</h3>
            <div className="quality-grid">
              {[
                { label: 'Storage Humidity', val: `${selected.humidity}%`, sub: 'Optimal: 60-65%', icon: '💧', color: 'var(--blue)', ok: selected.humidity >= 60 && selected.humidity <= 65 },
                { label: 'Active Temp', val: `${selected.temp}°C`, sub: 'Slight variant', icon: '🌡️', color: 'var(--orange)', ok: true },
                { label: 'Est. Shelf Life', val: '14 Days', sub: 'Class: A+ Premium', icon: '📅', color: 'var(--green-accent)', ok: true },
                { label: 'Logistics Footprint', val: '1.2t', sub: 'CO₂ Equiv/Batch', icon: '♻️', color: 'var(--teal)', ok: true },
              ].map(q => (
                <div key={q.label} className="quality-card">
                  <div className="quality-icon">{q.icon}</div>
                  <div className="quality-val" style={{ color: q.color }}>{q.val}</div>
                  <div className="quality-label">{q.label}</div>
                  <div className="quality-sub" style={{ color: q.ok ? 'var(--green-accent)' : 'var(--orange)' }}>{q.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Batch Details */}
        <div className="trace-right">
          <div className="card">
            <div className="batch-detail-header">
              <div>
                <div className="batch-detail-id">{selected.id}</div>
                <div className="batch-detail-name">{selected.name}</div>
                <div className="batch-variety">{selected.variety}</div>
              </div>
              <div className={`badge ${selected.status === 'DELIVERED' ? 'badge-green' : selected.status === 'IN TRANSIT' ? 'badge-blue' : 'badge-orange'}`}>{selected.status}</div>
            </div>
            <hr className="divider" />
            <div className="batch-info-rows">
              <div className="batch-info-row"><span>From</span><span>{selected.from}</span></div>
              <div className="batch-info-row"><span>To</span><span>{selected.to}</span></div>
              <div className="batch-info-row"><span>Weight</span><span>{selected.weight} Tons</span></div>
              <div className="batch-info-row"><span>Quality Grade</span><span className="text-green">{selected.quality}</span></div>
              <div className="batch-info-row"><span>Harvested</span><span>{selected.harvested}</span></div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-section-title">⛓️ Blockchain Trail</div>
            <div className="blockchain-trail">
              {['Harvest Logged', 'Quality Passed', 'Transport Initiated', 'Checkpoint 1 ✓', selected.status === 'DELIVERED' ? 'Delivered ✓' : 'In Transit...'].map((s, i) => (
                <div key={i} className="trail-item">
                  <div className={`trail-dot ${i < 3 ? 'done' : i === 3 ? 'current' : ''}`}></div>
                  <div className="trail-label">{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
