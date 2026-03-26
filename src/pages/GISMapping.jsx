import { useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { Layers, Navigation, Search, Filter, ZoomIn, ZoomOut } from 'lucide-react'
import './GISMapping.css'

const allFields = [
  { id: 'FU-04-B', lat: 30.9010, lng: 75.8573, crop: 'Wheat (गेहूं)', area: 42, ndvi: 0.74, moisture: 34, state: 'Punjab', dist: 'Ludhiana', status: 'active', color: '#22c55e' },
  { id: 'FU-05-C', lat: 28.8800, lng: 76.9000, crop: 'Paddy (धान)', area: 28, ndvi: 0.82, moisture: 72, state: 'Haryana', dist: 'Karnal', status: 'irrigated', color: '#3b82f6' },
  { id: 'FU-06-A', lat: 28.9700, lng: 77.7000, crop: 'Sugarcane (गन्ना)', area: 35, ndvi: 0.61, moisture: 28, state: 'U.P.', dist: 'Meerut', status: 'drought', color: '#f97316' },
  { id: 'FU-07-D', lat: 26.4500, lng: 74.6300, crop: 'Mustard (सरसों)', area: 56, ndvi: 0.68, moisture: 42, state: 'Rajasthan', dist: 'Ajmer', status: 'active', color: '#eab308' },
  { id: 'FU-08-E', lat: 20.7400, lng: 77.0000, crop: 'Cotton (कपास)', area: 31, ndvi: 0.71, moisture: 55, state: 'Maharashtra', dist: 'Akola', status: 'active', color: '#22c55e' },
  { id: 'FU-09-F', lat: 15.5200, lng: 75.0200, crop: 'Sugarcane (गन्ना)', area: 19, ndvi: 0.88, moisture: 68, state: 'Karnataka', dist: 'Hubli', status: 'irrigated', color: '#3b82f6' },
  { id: 'FU-10-G', lat: 10.9600, lng: 78.0800, crop: 'Rice (चावल)', area: 24, ndvi: 0.79, moisture: 78, state: 'Tamil Nadu', dist: 'Trichy', status: 'active', color: '#22c55e' },
  { id: 'FU-11-H', lat: 22.5726, lng: 88.3639, crop: 'Jute (जूट)', area: 18, ndvi: 0.65, moisture: 62, state: 'W. Bengal', dist: 'Kolkata', status: 'active', color: '#14b8a6' },
]

const layers = ['Crop Health (NDVI)', 'Soil Moisture', 'Temperature Map', 'Rainfall Forecast', 'Irrigation Zones']

export default function GISMapping() {
  const [selectedField, setSelectedField] = useState(allFields[0])
  const [activeLayer, setActiveLayer] = useState('Crop Health (NDVI)')
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = allFields.filter(f =>
    f.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.state.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="gis-page fade-in">
      <div className="gis-header">
        <div>
          <h1 className="dash-title">🗺️ GIS Mapping – Pan-India View</h1>
          <p className="dash-sub">Real-time geospatial monitoring across all registered farm units</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="badge badge-green pulse"><span className="dot dot-green"></span> Live Stream</div>
          <div className="badge badge-blue">8 Fields Active</div>
        </div>
      </div>

      <div className="gis-main">
        {/* Left: Layer controls + Field List */}
        <div className="gis-sidebar">
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-section-title"><Layers size={14} /> Map Layers</div>
            {layers.map(l => (
              <div key={l} className={`layer-option ${activeLayer === l ? 'active' : ''}`} onClick={() => setActiveLayer(l)}>
                <div className="layer-dot" style={{ background: activeLayer === l ? 'var(--green-accent)' : 'var(--border)' }}></div>
                {l}
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-section-title" style={{ marginBottom: 10 }}><Filter size={14} /> Field Units</div>
            <div className="gis-search">
              <Search size={13} />
              <input className="gis-search-input" placeholder="Search fields..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="field-list">
              {filtered.map(f => (
                <div key={f.id} className={`field-list-item ${selectedField?.id === f.id ? 'active' : ''}`} onClick={() => setSelectedField(f)}>
                  <div className="field-list-dot" style={{ background: f.color }}></div>
                  <div className="field-list-info">
                    <div className="field-list-id">{f.id} – {f.state}</div>
                    <div className="field-list-crop">{f.crop}</div>
                  </div>
                  <div className="field-list-ndvi" style={{ color: f.ndvi > 0.7 ? 'var(--green-accent)' : 'var(--orange)' }}>
                    NDVI {f.ndvi}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Map */}
        <div className="gis-map-col">
          <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1 }}>
            <div className="gis-map-toolbar">
              <div className="gis-map-title">Active Layer: <span className="text-green">{activeLayer}</span></div>
              <div className="gis-map-actions">
                <button className="btn-ghost" style={{ fontSize: 11 }}><Navigation size={13} /> My Location</button>
                <button className="btn-ghost" style={{ fontSize: 11 }}>📥 Export KML</button>
              </div>
            </div>
            <MapContainer center={[22.5, 78.9]} zoom={5} style={{ height: '500px', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" opacity={0.9} />
              {filtered.map((f, i) => (
                <CircleMarker key={i} center={[f.lat, f.lng]} radius={selectedField?.id === f.id ? 16 : 10}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: f.color, fillOpacity: 0.9 }}
                  eventHandlers={{ click: () => setSelectedField(f) }}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter', minWidth: 180 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{f.id} – {f.dist}, {f.state}</div>
                      <div style={{ fontSize: 11, color: '#555' }}>Crop: {f.crop}</div>
                      <div style={{ fontSize: 11 }}>NDVI: <strong style={{ color: f.ndvi > 0.7 ? '#22c55e' : '#f97316' }}>{f.ndvi}</strong></div>
                      <div style={{ fontSize: 11 }}>Moisture: {f.moisture}% | Area: {f.area} Ha</div>
                      <div style={{ fontSize: 11 }}>Status: <span style={{ color: f.color, fontWeight: 600 }}>{f.status}</span></div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* Right: Selected Field Details */}
        <div className="gis-detail">
          {selectedField ? (
            <>
              <div className="card">
                <div className="field-detail-header">
                  <div>
                    <div className="field-detail-id">{selectedField.id}</div>
                    <div className="field-detail-name">{selectedField.dist}, {selectedField.state}</div>
                  </div>
                  <div className={`badge ${selectedField.status === 'active' ? 'badge-green' : selectedField.status === 'irrigated' ? 'badge-blue' : 'badge-orange'}`}>
                    {selectedField.status}
                  </div>
                </div>
                <div className="field-detail-crop">{selectedField.crop}</div>
                <hr className="divider" />
                <div className="field-metrics-grid">
                  {[
                    { label: 'NDVI Score', val: selectedField.ndvi, unit: '', color: selectedField.ndvi > 0.7 ? 'var(--green-accent)' : 'var(--orange)' },
                    { label: 'Area', val: selectedField.area, unit: ' Ha', color: 'var(--blue)' },
                    { label: 'Soil Moisture', val: selectedField.moisture, unit: '%', color: 'var(--teal)' },
                  ].map(m => (
                    <div key={m.label} className="field-metric-box">
                      <div className="field-metric-val" style={{ color: m.color }}>{m.val}{m.unit}</div>
                      <div className="field-metric-label">{m.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="card-section-title">NDVI Health</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${selectedField.ndvi * 100}%`, background: `linear-gradient(90deg, ${selectedField.ndvi > 0.7 ? 'var(--green-primary)' : 'var(--orange)'}, ${selectedField.ndvi > 0.7 ? 'var(--green-accent)' : 'var(--yellow)'})` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span className="text-sm text-muted">0</span>
                    <span className="text-sm text-muted">1.0</span>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-section-title">📡 Satellite Metadata</div>
                <div className="sat-data">
                  <div className="sat-row"><span>Satellite</span><span>Sentinel-2A</span></div>
                  <div className="sat-row"><span>Resolution</span><span>10m/pixel</span></div>
                  <div className="sat-row"><span>Last Pass</span><span>Today 08:34 IST</span></div>
                  <div className="sat-row"><span>Cloud Cover</span><span className="text-green">4%</span></div>
                  <div className="sat-row"><span>Coordinates</span><span>{selectedField.lat.toFixed(4)}, {selectedField.lng.toFixed(4)}</span></div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-section-title">⚡ AI Recommendations</div>
                <div className="ai-rec-list">
                  <div className="ai-rec-item">💧 Increase irrigation by 15% in next 3 days</div>
                  <div className="ai-rec-item">🌾 Apply nitrogen fertilizer at 40 kg/Ha</div>
                  <div className="ai-rec-item">🔍 Schedule pest inspection for {selectedField.id}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
              Click a field to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
