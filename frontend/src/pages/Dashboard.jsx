import { useState, useEffect } from 'react'
import { Thermometer, Droplets, Wind, AlertTriangle, Clock, MapPin } from 'lucide-react'
import MapView from '../components/MapView'
import { FARM_BOUNDARY, buildZones, classifyHealth, healthColor, fetchRainfall } from './GISMapping'
import './Dashboard.css'

// Farm center coordinates — Mote Patil Sugarcane Farms
const FARM_LAT = 19.4308
const FARM_LNG = 74.9010

const partialZones = buildZones(FARM_BOUNDARY)

// Fetch live weather + forecast from Open-Meteo for the exact farm location
async function fetchWeather() {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${FARM_LAT}&longitude=${FARM_LNG}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,uv_index,weather_code` +
    `&daily=precipitation_sum,temperature_2m_max` +
    `&forecast_days=3&timezone=Asia%2FKolkata`
  const res = await fetch(url)
  const data = await res.json()
  return data
}

// Map WMO weather code to a human-readable alert description
function weatherAlert(code, precipSum) {
  if (code >= 95) return { level: 'high', text: 'Thunderstorm activity detected near farm. Secure equipment and pause field operations.' }
  if (code >= 61) return { level: 'medium', text: 'Rain expected. Monitor waterlogging in low-lying zones. Pause fertiliser application.' }
  if (precipSum < 1) return { level: 'medium', text: 'Dry spell forecast for next 3 days. Sugarcane in growth phase — activate drip irrigation on all blocks.' }
  return { level: 'low', text: 'Weather conditions are favourable for sugarcane growth. Continue normal operations.' }
}

// UV index label
function uvLabel(uv) {
  if (uv >= 11) return 'Extreme'
  if (uv >= 8) return 'Very High'
  if (uv >= 6) return 'High'
  if (uv >= 3) return 'Moderate'
  return 'Low'
}

// Generate activity feed dynamically from zone health data
function generateActivity(zones, weather) {
  const activities = []
  const problematic = zones.filter(z => z.health === 'Problematic')
  const moderate = zones.filter(z => z.health === 'Moderate')
  const now = new Date()

  if (problematic.length > 0) {
    activities.push({
      icon: '🔴', color: '#ef4444',
      title: `${problematic.length} Problematic Zone${problematic.length > 1 ? 's' : ''} Detected`,
      sub: `Zone${problematic.length > 1 ? 's' : ''} ${problematic.map(z => z.id + 1).join(', ')} show low NDVI + insufficient rainfall. Immediate attention required.`,
      time: 'Just now'
    })
  }

  if (weather?.current?.precipitation > 0) {
    activities.push({
      icon: '🌧️', color: '#3b82f6',
      title: `Live Rainfall: ${weather.current.precipitation} mm`,
      sub: `Current precipitation recorded at farm location. Soil moisture levels updating.`,
      time: `${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    })
  } else {
    activities.push({
      icon: '💧', color: '#22c55e',
      title: 'No Active Rainfall',
      sub: `0 mm precipitation at farm. Drip irrigation recommended for ${moderate.length + problematic.length} at-risk zones.`,
      time: `${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    })
  }

  if (weather?.current?.temperature_2m > 35) {
    activities.push({
      icon: '🌡️', color: '#f97316',
      title: `High Temperature Alert: ${weather.current.temperature_2m}°C`,
      sub: 'Temperatures above 35°C accelerate evapotranspiration. Increase irrigation frequency.',
      time: '5 mins ago'
    })
  } else if (weather?.current?.temperature_2m) {
    activities.push({
      icon: '🌤️', color: '#eab308',
      title: `Temperature: ${weather.current.temperature_2m}°C`,
      sub: 'Conditions within normal range for sugarcane growth. Monitor afternoon heat.',
      time: '5 mins ago'
    })
  }

  activities.push({
    icon: '📡', color: '#14b8a6',
    title: 'GIS Zone Analysis Complete',
    sub: `${zones.length} zones analysed. Health classification updated from live rainfall data.`,
    time: '10 mins ago'
  })

  return activities
}

// Generate AI insight from actual zone data
function generateInsight(zones, weather) {
  const problematic = zones.filter(z => z.health === 'Problematic')
  const moderate = zones.filter(z => z.health === 'Moderate')
  const healthy = zones.filter(z => z.health === 'Healthy')
  const temp = weather?.current?.temperature_2m
  const rain = weather?.current?.precipitation
  const humidity = weather?.current?.relative_humidity_2m

  if (problematic.length === 0 && moderate.length <= 2) {
    return `All ${healthy.length} zones at Mote Patil Sugarcane Farms are in good health. Current temperature ${temp ?? '—'}°C and humidity ${humidity ?? '—'}% are within optimal range for Co-86032 variety. Continue regular irrigation schedule.`
  }

  if (problematic.length > 0) {
    const soilTypes = [...new Set(problematic.map(z => z.soil))]
    return `Zone${problematic.length > 1 ? 's' : ''} ${problematic.map(z => z.id + 1).join(', ')} (${soilTypes.join('/')}) show critical stress — NDVI below 0.40 with rainfall under 1mm. At ${temp ?? '—'}°C and ${humidity ?? '—'}% humidity, risk of red rot and moisture stress is elevated. Recommend immediate soil sampling and potassium sulphate application at 50 kg/ha.`
  }

  return `${moderate.length} zones at moderate health. With ${rain ?? 0}mm current rainfall and ${temp ?? '—'}°C temperature, increase drip irrigation by 15% on Clay-soil zones. Apply foliar micronutrient spray within 48 hours.`
}

const fields = [
  { id: 'MPS-Z01', name: 'North Block', crop: 'ऊस (Sugarcane)', status: 'active', location: 'Mote Patil Farm, Maharashtra' },
  { id: 'MPS-Z02', name: 'Central Block', crop: 'ऊस (Sugarcane)', status: 'irrigated', location: 'Mote Patil Farm, Maharashtra' },
  { id: 'MPS-Z03', name: 'South Block', crop: 'ऊस (Sugarcane)', status: 'drought-risk', location: 'Mote Patil Farm, Maharashtra' },
]

export default function Dashboard({ user }) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [dashZones, setDashZones] = useState(partialZones)
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [zonesLoading, setZonesLoading] = useState(true)

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch live weather for exact farm location
  useEffect(() => {
    fetchWeather()
      .then(data => setWeather(data))
      .catch(() => setWeather(null))
      .finally(() => setWeatherLoading(false))
  }, [])

  // Fetch live rainfall per zone and classify health
  useEffect(() => {
    fetchRainfall(partialZones).then(rainfallValues => {
      const enriched = partialZones.map((z, i) => {
        const rainfall = rainfallValues[i]
        const health = classifyHealth(z.ndvi, rainfall)
        return { ...z, rainfall, health, color: healthColor(health) }
      })
      setDashZones(enriched)
      setZonesLoading(false)
    })
  }, [])

  const healthyCnt = dashZones.filter(z => z.health === 'Healthy').length
  const moderateCnt = dashZones.filter(z => z.health === 'Moderate').length
  const problematicCnt = dashZones.filter(z => z.health === 'Problematic').length

  const temp = weather?.current?.temperature_2m
  const humidity = weather?.current?.relative_humidity_2m
  const windSpeed = weather?.current?.wind_speed_10m
  const uvIndex = weather?.current?.uv_index
  const precipitation = weather?.current?.precipitation ?? 0
  const weatherCode = weather?.current?.weather_code ?? 0
  const precipSum3d = weather?.daily?.precipitation_sum?.reduce((a, b) => a + b, 0) ?? 0

  const alert = weatherAlert(weatherCode, precipSum3d)
  const activity = generateActivity(dashZones, weather)
  const aiInsight = generateInsight(dashZones, weather)

  // Risk badge based on problematic zones + weather
  const riskLevel = problematicCnt >= 3 || (temp > 38) ? 'HIGH' :
    problematicCnt >= 1 || moderateCnt >= 5 ? 'MODERATE' : 'LOW'
  const riskBadge = riskLevel === 'HIGH' ? 'badge-red' : riskLevel === 'MODERATE' ? 'badge-yellow' : 'badge-green'

  // Water demand: base 4.5 + temp factor + drought factor
  const waterDemand = temp ? (4.5 + (temp - 30) * 0.08 + (precipitation < 1 ? 0.6 : 0)).toFixed(1) : '—'

  return (
    <div className="dashboard fade-in">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🌾 Mote Patil Sugarcane Farms – Command Center</h1>
          <p className="dash-sub">Mote Patil Farm House Rd, Maharashtra · {currentTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="dash-header-right">
          <div className={`badge ${riskBadge}`}><span className={`dot dot-${riskLevel === 'HIGH' ? 'red' : riskLevel === 'MODERATE' ? 'orange' : 'green'}`}></span> {riskLevel} RISK</div>
          <div className="live-time">{currentTime.toLocaleTimeString('en-IN')}</div>
        </div>
      </div>

      {/* Alert Banner — driven by live weather */}
      <div className={`alert-banner ${alert.level === 'high' ? 'alert-high' : alert.level === 'medium' ? 'alert-medium' : 'alert-low'}`}>
        <div className="alert-icon"><AlertTriangle size={20} /></div>
        <div className="alert-content">
          <div className="alert-title">
            {alert.level === 'high' ? '⛈️' : alert.level === 'medium' ? '🌡️' : '✅'} Farm Weather Update — Mote Patil Sugarcane Farms
          </div>
          <div className="alert-sub">{weatherLoading ? 'Fetching live weather data...' : alert.text}</div>
        </div>
        <div className="alert-stats">
          <div className="alert-stat">
            <Thermometer size={16} className="text-red" />
            <span className="text-red font-bold">{weatherLoading ? '—' : `${temp}°C`}</span>
          </div>
          <div className="alert-stat">
            <Droplets size={16} className="text-blue" />
            <span className="text-blue font-bold">{weatherLoading ? '—' : `${humidity}%`}</span>
          </div>
        </div>
      </div>

      {/* Top Stats — partially live */}
      <div className="stats-row">
        {[
          {
            label: 'Predicted Water Demand',
            value: waterDemand,
            unit: 'M³ / Hectare',
            icon: '💧',
            sub: temp > 35 ? `High temp (${temp}°C) driving elevated demand` : `Based on live temp ${temp ?? '—'}°C & rainfall ${precipitation}mm`,
            color: 'var(--blue)',
            pct: Math.min(parseFloat(waterDemand) / 10 * 100, 100)
          },
          {
            label: 'Zone Health Score',
            value: zonesLoading ? '—' : Math.round((healthyCnt / dashZones.length) * 100) || 0,
            unit: '% Healthy',
            icon: '🌾',
            sub: zonesLoading ? 'Analysing zones...' : `${healthyCnt} healthy · ${moderateCnt} moderate · ${problematicCnt} problem`,
            color: problematicCnt > 2 ? 'var(--red)' : problematicCnt > 0 ? 'var(--yellow)' : 'var(--green-accent)',
            pct: zonesLoading ? 0 : Math.round((healthyCnt / dashZones.length) * 100)
          },
          {
            label: 'Current Rainfall',
            value: weatherLoading ? '—' : precipitation,
            unit: 'mm now',
            icon: '🌧️',
            sub: weatherLoading ? 'Fetching...' : `3-day total: ${precipSum3d.toFixed(1)}mm · UV: ${uvLabel(uvIndex)}`,
            color: precipitation > 3 ? 'var(--blue)' : precipitation > 0 ? 'var(--teal)' : 'var(--orange)',
            pct: Math.min(precipitation * 20, 100)
          },
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
              <div className="progress-fill" style={{ width: `${stat.pct}%`, background: `linear-gradient(90deg, ${stat.color}88, ${stat.color})` }} />
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
              <div className="map-title">🗺️ Live GIS – Mote Patil Sugarcane Farms, Maharashtra</div>
              <div className="map-controls">
                <span className="badge badge-green">🌱 {healthyCnt} Healthy</span>
                <span className="badge badge-yellow">⚠️ {moderateCnt} Moderate</span>
                <span className="badge badge-red">🔴 {problematicCnt} Problem</span>
              </div>
            </div>
            <div style={{ height: 360 }}>
              <MapView
                zones={dashZones}
                farmBoundary={FARM_BOUNDARY}
                onZoneClick={() => {}}
                selectedZoneId={null}
              />
            </div>
            <div className="map-legend">
              <div className="legend-item"><span className="dot" style={{ background: '#22c55e' }}></span> Healthy Zone</div>
              <div className="legend-item"><span className="dot" style={{ background: '#eab308' }}></span> Moderate Zone</div>
              <div className="legend-item"><span className="dot" style={{ background: '#ef4444' }}></span> Problematic Zone</div>
            </div>
          </div>

          {/* Zone summary cards — driven by live data */}
          <div className="fields-row">
            {fields.map((f, i) => {
              // Map field cards to zone groups
              const zoneGroup = dashZones.slice(i * Math.ceil(dashZones.length / 3), (i + 1) * Math.ceil(dashZones.length / 3))
              const avgNdvi = zoneGroup.length ? (zoneGroup.reduce((s, z) => s + z.ndvi, 0) / zoneGroup.length).toFixed(2) : '—'
              const avgRain = zoneGroup.length && zoneGroup[0].rainfall !== null
                ? (zoneGroup.reduce((s, z) => s + (z.rainfall || 0), 0) / zoneGroup.length).toFixed(1)
                : '—'
              const blockHealth = zoneGroup.filter(z => z.health === 'Healthy').length >= zoneGroup.length / 2 ? 'active'
                : zoneGroup.filter(z => z.health === 'Problematic').length > 0 ? 'drought-risk' : 'irrigated'
              const healthScore = zoneGroup.length
                ? Math.round((zoneGroup.filter(z => z.health === 'Healthy').length / zoneGroup.length) * 100)
                : 0

              return (
                <div key={f.id} className="card card-hover field-card">
                  <div className="field-card-top">
                    <div>
                      <div className="field-card-id">{f.id}</div>
                      <div className="field-card-name">{f.name}</div>
                      <div className="field-card-loc"><MapPin size={11} /> {f.location}</div>
                    </div>
                    <div className={`badge ${blockHealth === 'active' ? 'badge-green' : blockHealth === 'irrigated' ? 'badge-blue' : 'badge-orange'}`}>
                      {blockHealth === 'active' ? '🟢 Healthy' : blockHealth === 'irrigated' ? '⚠️ Moderate' : '🔴 At Risk'}
                    </div>
                  </div>
                  <div className="field-crop">{f.crop}</div>
                  <div className="field-metrics">
                    <div className="field-metric"><span>NDVI</span><strong>{avgNdvi}</strong></div>
                    <div className="field-metric"><span>Rain</span><strong>{avgRain !== '—' ? `${avgRain}mm` : '—'}</strong></div>
                    <div className="field-metric"><span>Health</span><strong className="text-green">{healthScore}%</strong></div>
                  </div>
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{ width: `${healthScore}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="dash-right-col">
          {/* Live Weather */}
          <div className="card">
            <div className="card-section-title">
              🌤️ Live Weather – Mote Patil Farm
              {!weatherLoading && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green-accent)', fontWeight: 400 }}>● LIVE</span>}
            </div>
            {weatherLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>Fetching weather from Open-Meteo...</div>
            ) : (
              <div className="weather-grid">
                {[
                  { icon: <Thermometer size={16} />, label: 'Temp', val: `${temp}°C`, color: temp > 35 ? 'var(--red)' : 'var(--orange)' },
                  { icon: <Droplets size={16} />, label: 'Humidity', val: `${humidity}%`, color: 'var(--blue)' },
                  { icon: <Wind size={16} />, label: 'Wind', val: `${windSpeed} km/h`, color: 'var(--teal)' },
                  { icon: '☀️', label: 'UV Index', val: uvLabel(uvIndex), color: uvIndex >= 8 ? 'var(--red)' : 'var(--yellow)' },
                ].map(w => (
                  <div key={w.label} className="weather-item" style={{ borderColor: w.color + '33' }}>
                    <span style={{ color: w.color }}>{w.icon}</span>
                    <div className="weather-val" style={{ color: w.color }}>{w.val}</div>
                    <div className="weather-label">{w.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Activity Feed */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-section-title">
              Recent Activity
              {!zonesLoading && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green-accent)', fontWeight: 400 }}>● LIVE</span>}
            </div>
            <div className="activity-list">
              {(zonesLoading || weatherLoading) ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading live data...</div>
              ) : (
                activity.map((a, i) => (
                  <div key={i} className="activity-item">
                    <div className="activity-icon" style={{ background: a.color + '22', color: a.color }}>{a.icon}</div>
                    <div className="activity-content">
                      <div className="activity-title">{a.title}</div>
                      <div className="activity-sub">{a.sub}</div>
                      <div className="activity-time"><Clock size={10} /> {a.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Dynamic AI Insight */}
          
          </div>
        </div>
      </div>
  )
}
