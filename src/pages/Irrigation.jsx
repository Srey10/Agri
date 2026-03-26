import { useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon } from 'react-leaflet'
import { Droplets, Thermometer, Wind, Calendar, Plus, Download, Activity } from 'lucide-react'
import './Irrigation.css'

const schedule = [
  { zone: 'North Field – Block B', crop: 'Wheat (गेहूं)', time: '06:00 – 07:30', status: 'Complete', water: '4.2 M³/Ha', moisture: 87 },
  { zone: 'South Paddy Zone', crop: 'Paddy (धान)', time: '14:00 – 16:00', status: 'Scheduled', water: '6.8 M³/Ha', moisture: 55 },
  { zone: 'East Sugarcane Block', crop: 'Sugarcane (गन्ना)', time: '18:30 – 20:00', status: 'Drought Risk', water: '5.5 M³/Ha', moisture: 28 },
  { zone: 'West Mustard Field', crop: 'Mustard (सरसों)', time: '05:00 – 06:00', status: 'Complete', water: '2.8 M³/Ha', moisture: 72 },
]

const sensors = [
  { id: 'SENS-04B-1', zone: 'Block B – North', moisture: 34, temp: 28, battery: 88, status: 'active', lat: 30.903, lng: 75.858 },
  { id: 'SENS-05C-2', zone: 'Paddy Zone Center', moisture: 72, temp: 26, battery: 64, status: 'active', lat: 28.882, lng: 76.902 },
  { id: 'SENS-06A-3', zone: 'East Sugarcane', moisture: 28, temp: 31, battery: 45, status: 'warning', lat: 28.972, lng: 77.703 },
  { id: 'SENS-07D-4', zone: 'Mustard West', moisture: 55, temp: 27, battery: 92, status: 'active', lat: 26.451, lng: 74.632 },
]

const fieldPolygon = [[30.9050, 75.8530], [30.9100, 75.8620], [30.9080, 75.8680], [30.9020, 75.8640], [30.9000, 75.8560]]

export default function Irrigation() {
  const [activeTab, setActiveTab] = useState('schedule')

  return (
    <div className="irrigation-page fade-in">
      <div className="irr-header">
        <div>
          <h1 className="dash-title">💧 Smart Irrigation Planning</h1>
          <p className="dash-sub">Real-time precision water management • Field Unit 04-B, Punjab</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="badge badge-green pulse"><span className="dot dot-green"></span> System Optimized</div>
          <button className="btn-primary" style={{ fontSize: 12 }}><Plus size={14} /> Add Event</button>
          <button className="btn-outline" style={{ fontSize: 12 }}><Download size={14} /> Download Log</button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="irr-stats">
        {[
          { label: 'Predictive Water Demand', val: '4.2', unit: 'M³/Hectare', icon: '💧', sub: '+8% due to heatwave warning', color: 'var(--blue)', badge: 'AI INSIGHT' },
          { label: 'Current Soil Moisture', val: '34', unit: '%', icon: '🌱', sub: 'Sensor UNIT 04-B Reading', color: 'var(--teal)', badge: 'LIVE' },
          { label: 'Field Temperature', val: '28', unit: '°C', icon: '🌡️', sub: 'Stable (+0.5° today)', color: 'var(--orange)', badge: 'SENSOR' },
          { label: 'Water Saved (Month)', val: '18.4', unit: 'K Litres', icon: '♻️', sub: 'vs conventional method', color: 'var(--green-accent)', badge: 'AI OPT' },
        ].map(s => (
          <div key={s.label} className="card irr-stat">
            <div className="irr-stat-top">
              <span className="irr-stat-icon">{s.icon}</span>
              <span className={`badge ${s.badge === 'AI INSIGHT' ? 'badge-blue' : s.badge === 'LIVE' ? 'badge-green' : 'badge-orange'}`}>{s.badge}</span>
            </div>
            <div className="irr-stat-val" style={{ color: s.color }}>{s.val} <span className="irr-stat-unit">{s.unit}</span></div>
            <div className="irr-stat-label">{s.label}</div>
            <div className="irr-stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* AI Recommendation */}
      <div className="ai-rec-banner">
        <div className="ai-rec-icon">🤖</div>
        <div className="ai-rec-content">
          <div className="ai-rec-title">AI Recommendation – Predictive Irrigation</div>
          <div className="ai-rec-text">Based on satellite weather forecasts, heavy rainfall is expected in <strong>12 hours in Ludhiana</strong>. We recommend reducing the automated irrigation cycle by <strong>15%</strong> to prevent water runoff and soil erosion.</div>
        </div>
        <button className="btn-primary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Apply Adjustment</button>
      </div>

      {/* Main Content */}
      <div className="irr-main">
        {/* Map */}
        <div className="irr-map-col">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="irr-map-header">
              <div className="irr-map-title">Field Irrigation Zones – Live View</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="irr-legend-item" style={{ color: 'var(--green-accent)' }}>🟢 Active</div>
                <div className="irr-legend-item" style={{ color: 'var(--blue)' }}>🔵 Scheduled</div>
                <div className="irr-legend-item" style={{ color: 'var(--orange)' }}>🟠 Drought Risk</div>
              </div>
            </div>
            <MapContainer center={[30.9010, 75.8573]} zoom={12} style={{ height: '340px' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" opacity={0.85} />
              <Polygon positions={fieldPolygon} pathOptions={{ color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.2, dashArray: '8,4' }}>
                <Popup><div style={{ fontFamily: 'Inter', fontSize: 12 }}><strong>Block B – Active Irrigation</strong><br />Moisture: 34% | Temp: 28°C<br />Status: Active Irrigation Zone</div></Popup>
              </Polygon>
              {sensors.map((s, i) => (
                <CircleMarker key={i} center={[s.lat, s.lng]} radius={10}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: s.status === 'active' ? '#22c55e' : '#f97316', fillOpacity: 1 }}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter', fontSize: 12 }}>
                      <strong>{s.id}</strong><br />Zone: {s.zone}<br />
                      Moisture: {s.moisture}% | Temp: {s.temp}°C<br />
                      Battery: {s.battery}%
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
            <div className="irr-map-footer">
              <div><span className="text-muted text-sm">Active Sensor: </span><span className="text-green">SENS-04B-1 • Moisture 34%</span></div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="irr-right-col">
          {/* Tabs */}
          <div className="irr-tabs">
            {['schedule', 'sensors', 'weather'].map(t => (
              <button key={t} className={`irr-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                {t === 'schedule' ? '📅 Schedule' : t === 'sensors' ? '📡 Sensors' : '🌦️ Weather'}
              </button>
            ))}
          </div>

          {activeTab === 'schedule' && (
            <div className="irr-schedule">
              {schedule.map((s, i) => (
                <div key={i} className="schedule-item">
                  <div className="schedule-top">
                    <div className="schedule-zone">{s.zone}</div>
                    <div className={`badge ${s.status === 'Complete' ? 'badge-green' : s.status === 'Scheduled' ? 'badge-blue' : 'badge-orange'}`}>{s.status}</div>
                  </div>
                  <div className="schedule-crop">{s.crop}</div>
                  <div className="schedule-meta">
                    <span><Calendar size={11} /> {s.time}</span>
                    <span><Droplets size={11} /> {s.water}</span>
                  </div>
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{ width: `${s.moisture}%` }} />
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: 3 }}>Soil Moisture: {s.moisture}%</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'sensors' && (
            <div className="sensors-list">
              {sensors.map((s, i) => (
                <div key={i} className="sensor-card">
                  <div className="sensor-header">
                    <div>
                      <div className="sensor-id">{s.id}</div>
                      <div className="sensor-zone">{s.zone}</div>
                    </div>
                    <div className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-orange'}`}>{s.status}</div>
                  </div>
                  <div className="sensor-metrics">
                    <div className="s-metric"><Droplets size={12} style={{ color: 'var(--blue)' }} /><strong>{s.moisture}%</strong><span>Moisture</span></div>
                    <div className="s-metric"><Thermometer size={12} style={{ color: 'var(--orange)' }} /><strong>{s.temp}°C</strong><span>Temp</span></div>
                    <div className="s-metric"><Activity size={12} style={{ color: 'var(--green-accent)' }} /><strong>{s.battery}%</strong><span>Battery</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'weather' && (
            <div className="weather-forecast">
              {[
                { day: 'Today', icon: '☀️', high: 38, low: 24, rain: '0mm', humidity: 14 },
                { day: 'Tomorrow', icon: '⛈️', high: 31, low: 22, rain: '18mm', humidity: 68 },
                { day: 'Day 3', icon: '🌦️', high: 28, low: 21, rain: '8mm', humidity: 54 },
                { day: 'Day 4', icon: '⛅', high: 30, low: 23, rain: '2mm', humidity: 42 },
                { day: 'Day 5', icon: '☀️', high: 34, low: 24, rain: '0mm', humidity: 28 },
              ].map((d, i) => (
                <div key={i} className="forecast-row">
                  <div className="forecast-day">{d.day}</div>
                  <div className="forecast-icon">{d.icon}</div>
                  <div className="forecast-temp"><span className="text-red">{d.high}°</span> / <span className="text-blue">{d.low}°</span></div>
                  <div className="forecast-rain"><Droplets size={11} /> {d.rain}</div>
                  <div className="forecast-humidity">{d.humidity}% RH</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
