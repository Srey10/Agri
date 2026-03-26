import { useState, useEffect } from 'react'
import { Thermometer, Droplets, Wind, TrendingUp, AlertTriangle, Clock, CheckCircle, Activity, Wheat, MapPin } from 'lucide-react'
import MapView from '../components/MapView'
import './Dashboard.css'

const recentActivity = [
  { type: 'alert', icon: '🔍', color: '#ef4444', title: 'Anomaly Detected: Block B-12', sub: 'Irregular NDVI signature detected. Possible pest infestation.', time: '2 mins ago' },
  { type: 'success', icon: '💧', color: '#22c55e', title: 'Irrigation Cycle Complete', sub: 'Main North Field-11: 95% saturation reached, 86% optimal.', time: '45 mins ago' },
  { type: 'info', icon: '📦', color: '#f97316', title: 'Traceability Updated', sub: 'Batch #803 Harvest Logs verified by Blockchain Node 08.', time: '1 hour ago' },
]

const fields = [
  { id: 'FU-04-B', name: 'North Field – Block B', crop: 'गेहूं (Wheat)', moisture: 34, health: 87, status: 'active', location: 'Ludhiana, Punjab' },
  { id: 'FU-05-C', name: 'South Paddy Zone', crop: 'धान (Paddy)', moisture: 72, health: 92, status: 'irrigated', location: 'Karnal, Haryana' },
  { id: 'FU-06-A', name: 'East Sugarcane Block', crop: 'गन्ना (Sugarcane)', moisture: 28, health: 71, status: 'drought-risk', location: 'Meerut, U.P.' },
]

export default function Dashboard({ user }) {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="dashboard fade-in">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🌾 Command Center Dashboard</h1>
          <p className="dash-sub">Digital Agronomy Intelligence • {currentTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="dash-header-right">
          <div className="badge badge-red"><span className="dot dot-red"></span> CLIMATE RISK: HIGH</div>
          <div className="live-time">{currentTime.toLocaleTimeString('en-IN')}</div>
        </div>
      </div>

      {/* Climate Alert Banner */}
      <div className="alert-banner">
        <div className="alert-icon"><AlertTriangle size={20} /></div>
        <div className="alert-content">
          <div className="alert-title">🌡️ Heatwave Alert – Punjab & Haryana</div>
          <div className="alert-sub">Hot dry air mass from North-West. Soil moisture expected to drop 12% in next 48h. Increase irrigation frequency recommended.</div>
        </div>
        <div className="alert-stats">
          <div className="alert-stat"><Thermometer size={16} className="text-red" /><span className="text-red font-bold">38°C</span></div>
          <div className="alert-stat"><Droplets size={16} className="text-blue" /><span className="text-blue font-bold">14%</span></div>
        </div>
      </div>

      {/* Top Stats */}
      <div className="stats-row">
        {[
          { label: 'Predicted Water Demand', value: '4.2', unit: 'M³ / Hectare', icon: '💧', sub: '+8% increase projected next 48h', color: 'var(--blue)' },
          { label: 'Estimated Yield', value: '12.5', unit: 'Tons / Ha', icon: '🌾', sub: 'Above average for Wheat Var S-6', color: 'var(--green-accent)' },
          { label: 'Soil Health Index', value: '82', unit: '/ 100 AI', icon: '🌱', sub: 'Nitrogen levels optimal. Ph stable at 6.8', color: 'var(--teal)' },
        ].map(stat => (
          <div key={stat.label} className="card stat-card fade-in">
            <div className="stat-header">
              <div className="stat-label">{stat.label}</div>
              <div className="stat-emoji">{stat.icon}</div>
            </div>
            <div className="stat-value" style={{ color: stat.color }}>
              <span className="stat-num">{stat.value}</span>
              <span className="stat-unit">{stat.unit}</span>
            </div>
            <div className="stat-sub">{stat.sub}</div>
            <div className="progress-bar" style={{ marginTop: 10 }}>
              <div className="progress-fill" style={{ width: `${parseFloat(stat.value) / (parseFloat(stat.unit) || 15) * 100}%`, background: `linear-gradient(90deg, ${stat.color}88, ${stat.color})` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="dash-main">
        {/* Map */}
        <div className="dash-map-col">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="map-header">
              <div className="map-title">Live GIS Field Map – Punjab, India</div>
              <div className="map-controls">
                <button className="badge badge-green">🌱 Crop</button>
                <button className="badge badge-blue">💧 Soil</button>
                <button className="badge badge-yellow">🌡️ Climate</button>
              </div>
            </div>
            <div style={{ height: 360 }}>
              <MapView />
            </div>
            <div className="map-legend">
              <div className="legend-item"><span className="dot dot-green"></span> Irrigated Active</div>
              <div className="legend-item"><span className="dot dot-orange"></span> Drought Risk</div>
              <div className="legend-item"><span className="dot" style={{ background: '#eab308' }}></span> Harvest Ready</div>
            </div>
          </div>

          {/* Field Cards */}
          <div className="fields-row">
            {fields.map(f => (
              <div key={f.id} className="card card-hover field-card">
                <div className="field-card-top">
                  <div>
                    <div className="field-card-id">{f.id}</div>
                    <div className="field-card-name">{f.name}</div>
                    <div className="field-card-loc"><MapPin size={11} /> {f.location}</div>
                  </div>
                  <div className={`badge ${f.status === 'active' ? 'badge-green' : f.status === 'irrigated' ? 'badge-blue' : 'badge-orange'}`}>
                    {f.status === 'active' ? '🟢 Active' : f.status === 'irrigated' ? '💧 Irrigated' : '⚠️ Drought'}
                  </div>
                </div>
                <div className="field-crop">{f.crop}</div>
                <div className="field-metrics">
                  <div className="field-metric"><span>Moisture</span><strong>{f.moisture}%</strong></div>
                  <div className="field-metric"><span>Health</span><strong className="text-green">{f.health}</strong></div>
                </div>
                <div className="progress-bar" style={{ marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: `${f.health}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div className="dash-right-col">
          {/* Weather */}
          <div className="card">
            <div className="card-section-title">Weather – Ludhiana, Punjab</div>
            <div className="weather-grid">
              {[
                { icon: <Thermometer size={16} />, label: 'Temp', val: '38°C', color: 'var(--red)' },
                { icon: <Droplets size={16} />, label: 'Humidity', val: '14%', color: 'var(--blue)' },
                { icon: <Wind size={16} />, label: 'Wind NW', val: '22 km/h', color: 'var(--teal)' },
                { icon: '☀️', label: 'UV Index', val: 'Very High', color: 'var(--yellow)' },
              ].map(w => (
                <div key={w.label} className="weather-item" style={{ borderColor: w.color + '33' }}>
                  <span style={{ color: w.color }}>{w.icon}</span>
                  <div className="weather-val" style={{ color: w.color }}>{w.val}</div>
                  <div className="weather-label">{w.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-section-title">Recent Activity</div>
            <div className="activity-list">
              {recentActivity.map((a, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-icon" style={{ background: a.color + '22', color: a.color }}>{a.icon}</div>
                  <div className="activity-content">
                    <div className="activity-title">{a.title}</div>
                    <div className="activity-sub">{a.sub}</div>
                    <div className="activity-time"><Clock size={10} /> {a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Insight */}
          <div className="card ai-insight-card" style={{ marginTop: 16 }}>
            <div className="ai-insight-header">
              <span>🤖 AI Agronomist Insight</span>
              <div className="badge badge-green pulse">LIVE</div>
            </div>
            <p className="ai-insight-text">Based on satellite imagery and soil sensor data from your Punjab fields, <strong>Block B-12</strong> shows early signs of wheat rust fungus. Recommend applying Tebuconazole 0.1% within 72 hours.</p>
            <button className="btn-primary" style={{ marginTop: 12, width: '100%', justifyContent: 'center', fontSize: 12 }}>
              📋 View Full AI Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
