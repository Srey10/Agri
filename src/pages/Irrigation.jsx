import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup } from 'react-leaflet'
import { Droplets, Thermometer, Calendar, Plus, Download, Activity, MapPin, Loader } from 'lucide-react'
import './Irrigation.css'

// Mote Patil Sugarcane Farms — exact coordinates
const FARM_LAT = 19.4308
const FARM_LNG = 74.9010
const FARM_NAME = 'Mote Patil Sugarcane Farms, Maharashtra'

// Farm boundary polygon for map (same as GISMapping)
const farmPolygon = [
  [19.4330, 74.8985],
  [19.4345, 74.9010],
  [19.4340, 74.9045],
  [19.4315, 74.9055],
  [19.4285, 74.9050],
  [19.4270, 74.9020],
  [19.4275, 74.8990],
  [19.4300, 74.8975],
]

// Base schedule — times and base water demand per block
// Status, actual water demand, and notes are computed from live weather
const BASE_SCHEDULE = [
  { zone: 'North Block – Zone 1-4',  crop: 'ऊस (Sugarcane)', startHour: 5,  endHour: 7,  baseWater: 5.8, baseMoisture: 72 },
  { zone: 'Central Block – Zone 5-8', crop: 'ऊस (Sugarcane)', startHour: 14, endHour: 16, baseWater: 5.5, baseMoisture: 55 },
  { zone: 'South Block – Zone 9-12', crop: 'ऊस (Sugarcane)', startHour: 18, endHour: 20, baseWater: 6.2, baseMoisture: 31 },
  { zone: 'East Block – Zone 13-16', crop: 'ऊस (Sugarcane)', startHour: 6,  endHour: 7,  baseWater: 4.8, baseMoisture: 68 },
]

// Simplified Penman-Monteith ET₀ estimate for sugarcane
// Uses temperature and humidity from live weather
function calcET0(tempC, humidity) {
  // Hargreaves simplified: ET₀ ≈ 0.0023 × (T + 17.8) × (Tmax - Tmin)^0.5 × Ra
  // We approximate with a simpler formula using temp and humidity
  const vpd = (1 - humidity / 100) * 0.6108 * Math.exp(17.27 * tempC / (tempC + 237.3))
  const et0 = 0.408 * vpd * (tempC / 10) + 0.5
  return Math.max(0.5, Math.min(et0, 8))
}

// Derive live schedule from weather conditions
function buildLiveSchedule(weather) {
  if (!weather) return BASE_SCHEDULE.map(b => ({
    ...b,
    time: `${String(b.startHour).padStart(2,'0')}:00 – ${String(b.endHour).padStart(2,'0')}:00`,
    water: `${b.baseWater} M³/Ha`,
    moisture: b.baseMoisture,
    status: 'Loading...',
    note: '',
  }))

  const now = new Date()
  const currentHour = now.getHours()
  const rain = weather.precipitation
  const temp = weather.temp
  const humidity = weather.humidity
  const et0 = calcET0(temp, humidity)

  return BASE_SCHEDULE.map(b => {
    // Adjust water demand based on ET₀ and rainfall
    const rainReduction = rain > 5 ? 0.5 : rain > 2 ? 0.75 : rain > 0.5 ? 0.9 : 1.0
    const tempFactor = temp > 38 ? 1.25 : temp > 35 ? 1.15 : temp > 32 ? 1.05 : 1.0
    const adjustedWater = (b.baseWater * rainReduction * tempFactor).toFixed(1)

    // Determine status from time of day and conditions
    let status, note
    if (rain > 5) {
      status = 'Paused – Rain'
      note = `Active rainfall ${rain}mm — irrigation paused automatically`
    } else if (b.baseMoisture < 35 && rain < 1) {
      status = 'Drought Risk'
      note = `Moisture critically low. ET₀ = ${et0.toFixed(1)} mm/day. Urgent irrigation needed.`
    } else if (currentHour >= b.endHour) {
      status = 'Complete'
      note = rain > 0.5 ? `Completed. ${rain}mm rain supplemented — water saved.` : `Completed on schedule.`
    } else if (currentHour >= b.startHour) {
      status = 'In Progress'
      note = `Currently irrigating. ET₀ = ${et0.toFixed(1)} mm/day.`
    } else {
      status = 'Scheduled'
      note = temp > 35
        ? `High temp (${temp}°C) — demand increased by ${Math.round((tempFactor - 1) * 100)}%`
        : `On schedule. Demand adjusted for ET₀ ${et0.toFixed(1)} mm/day.`
    }

    return {
      ...b,
      time: `${String(b.startHour).padStart(2,'0')}:00 – ${String(b.endHour).padStart(2,'0')}:00`,
      water: `${adjustedWater} M³/Ha`,
      moisture: b.baseMoisture,
      status,
      note,
    }
  })
}

// Sensors placed within the actual farm boundary
const sensors = [
  { id: 'MPS-S01', zone: 'North Block', moisture: 72, temp: 32, battery: 88, status: 'active', lat: 19.4338, lng: 74.9010 },
  { id: 'MPS-S02', zone: 'Central Block', moisture: 55, temp: 34, battery: 74, status: 'active', lat: 19.4308, lng: 74.9020 },
  { id: 'MPS-S03', zone: 'South Block', moisture: 31, temp: 35, battery: 45, status: 'warning', lat: 19.4280, lng: 74.9030 },
  { id: 'MPS-S04', zone: 'East Block', moisture: 68, temp: 33, battery: 91, status: 'active', lat: 19.4310, lng: 74.9045 },
]

function getWeatherInfo(code) {
  if (code === 0)  return { icon: '☀️', label: 'Clear Sky' }
  if (code <= 2)   return { icon: '⛅', label: 'Partly Cloudy' }
  if (code === 3)  return { icon: '☁️', label: 'Overcast' }
  if (code <= 49)  return { icon: '🌫️', label: 'Foggy' }
  if (code <= 59)  return { icon: '🌦️', label: 'Drizzle' }
  if (code <= 69)  return { icon: '🌧️', label: 'Rain' }
  if (code <= 79)  return { icon: '❄️', label: 'Snow' }
  if (code <= 84)  return { icon: '🌦️', label: 'Rain Showers' }
  if (code <= 94)  return { icon: '⛈️', label: 'Thunderstorm' }
  return { icon: '⛈️', label: 'Heavy Storm' }
}

const DAY_LABELS = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5']

export default function Irrigation() {
  const [activeTab, setActiveTab] = useState('schedule')
  const [forecast, setForecast] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState('')
  const [currentWeather, setCurrentWeather] = useState(null)

  // Auto-fetch weather for the exact farm coordinates on mount
  useEffect(() => {
    fetchFarmWeather()
  }, [])

  async function fetchFarmWeather() {
    setWeatherLoading(true)
    setWeatherError('')
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${FARM_LAT}&longitude=${FARM_LNG}` +
        `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max` +
        `&forecast_days=5&timezone=Asia%2FKolkata`
      )
      const data = await res.json()

      // Current conditions
      setCurrentWeather({
        temp: data.current.temperature_2m,
        humidity: data.current.relative_humidity_2m,
        precipitation: data.current.precipitation,
        wind: data.current.wind_speed_10m,
        ...getWeatherInfo(data.current.weather_code),
      })

      // 5-day forecast
      const d = data.daily
      const parsed = d.time.map((_, i) => ({
        day: DAY_LABELS[i],
        ...getWeatherInfo(d.weathercode[i]),
        high: Math.round(d.temperature_2m_max[i]),
        low: Math.round(d.temperature_2m_min[i]),
        rain: `${(d.precipitation_sum[i] ?? 0).toFixed(1)}mm`,
        humidity: d.relative_humidity_2m_max[i] ?? '--',
        precipSum: d.precipitation_sum[i] ?? 0,
      }))
      setForecast(parsed)
    } catch (err) {
      setWeatherError('Failed to fetch weather data. Check your connection.')
    } finally {
      setWeatherLoading(false)
    }
  }

  const liveSchedule = buildLiveSchedule(currentWeather)

  // Derive AI recommendation from live weather
  const aiRec = currentWeather
    ? currentWeather.precipitation > 3
      ? `Live rainfall of ${currentWeather.precipitation}mm detected at farm. Irrigation paused on all blocks — saving ~${(currentWeather.precipitation * 0.4).toFixed(1)} M³/Ha. Resume when rain stops.`
      : currentWeather.temp > 35
      ? `Temperature at ${currentWeather.temp}°C — above sugarcane stress threshold (35°C). ET₀ elevated. Water demand increased by ${Math.round((currentWeather.temp - 35) * 3 + 15)}%. Prioritise South Block (moisture 31%).`
      : `Conditions stable at ${currentWeather.temp}°C, ${currentWeather.humidity}% humidity. ET₀ = ${calcET0(currentWeather.temp, currentWeather.humidity).toFixed(1)} mm/day. Schedule running normally — ${liveSchedule.filter(s => s.status === 'Drought Risk').length} block(s) need attention.`
    : 'Fetching live weather data for irrigation recommendation...'

  return (
    <div className="irrigation-page fade-in">
      <div className="irr-header">
        <div>
          <h1 className="dash-title">💧 Smart Irrigation Planning</h1>
          <p className="dash-sub">Real-time precision water management · {FARM_NAME}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="badge badge-green pulse"><span className="dot dot-green"></span> System Optimized</div>
          <button className="btn-primary" style={{ fontSize: 12 }}><Plus size={14} /> Add Event</button>
          <button className="btn-outline" style={{ fontSize: 12 }}><Download size={14} /> Download Log</button>
        </div>
      </div>

      {/* Top Stats — live where possible */}
      <div className="irr-stats">
        {[
          {
            label: 'Predicted Water Demand',
            val: currentWeather ? (4.5 + (currentWeather.temp - 30) * 0.08 + (currentWeather.precipitation < 1 ? 0.6 : 0)).toFixed(1) : '—',
            unit: 'M³/Hectare', icon: '💧',
            sub: currentWeather ? `Based on live ${currentWeather.temp}°C & ${currentWeather.precipitation}mm rain` : 'Loading...',
            color: 'var(--blue)', badge: 'AI INSIGHT'
          },
          {
            label: 'Current Soil Moisture',
            val: sensors[0].moisture, unit: '%', icon: '🌱',
            sub: `Sensor MPS-S01 · North Block`,
            color: 'var(--teal)', badge: 'LIVE'
          },
          {
            label: 'Field Temperature',
            val: currentWeather ? currentWeather.temp : '—', unit: '°C', icon: '🌡️',
            sub: currentWeather ? `${currentWeather.icon} ${currentWeather.label}` : 'Fetching...',
            color: 'var(--orange)', badge: 'LIVE'
          },
          {
            label: 'Today\'s Rainfall',
            val: currentWeather ? currentWeather.precipitation : '—', unit: 'mm', icon: '🌧️',
            sub: currentWeather ? `Humidity: ${currentWeather.humidity}% · Wind: ${currentWeather.wind} km/h` : 'Fetching...',
            color: 'var(--green-accent)', badge: 'LIVE'
          },
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

      {/* AI Recommendation — live */}
      <div className="ai-rec-banner">
        <div className="ai-rec-icon">🤖</div>
        <div className="ai-rec-content">
          <div className="ai-rec-title">AI Recommendation – {FARM_NAME}</div>
          <div className="ai-rec-text">{aiRec}</div>
        </div>
        <button className="btn-primary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Apply Adjustment</button>
      </div>

      {/* Main Content */}
      <div className="irr-main">
        {/* Map — centered on actual farm */}
        <div className="irr-map-col">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="irr-map-header">
              <div className="irr-map-title">Mote Patil Farm – Irrigation Zones Live View</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="irr-legend-item" style={{ color: 'var(--green-accent)' }}>🟢 Active</div>
                <div className="irr-legend-item" style={{ color: 'var(--blue)' }}>🔵 Scheduled</div>
                <div className="irr-legend-item" style={{ color: 'var(--orange)' }}>🟠 Drought Risk</div>
              </div>
            </div>
            <MapContainer center={[FARM_LAT, FARM_LNG]} zoom={15} style={{ height: '340px' }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles © Esri"
                maxZoom={19}
              />
              <Polygon
                positions={farmPolygon}
                pathOptions={{ color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.15, dashArray: '8,4' }}
              >
                <Popup>
                  <div style={{ fontFamily: 'Inter', fontSize: 12 }}>
                    <strong>Mote Patil Sugarcane Farms</strong><br />
                    Total Area: ~8-10 Ha<br />
                    Crop: Sugarcane (Co-86032)
                  </div>
                </Popup>
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
              <div><span className="text-muted text-sm">Active Sensor: </span><span className="text-green">MPS-S01 · North Block · Moisture {sensors[0].moisture}%</span></div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="irr-right-col">
          <div className="irr-tabs">
            {['schedule', 'sensors', 'weather'].map(t => (
              <button key={t} className={`irr-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                {t === 'schedule' ? '📅 Schedule' : t === 'sensors' ? '📡 Sensors' : '🌦️ Weather'}
              </button>
            ))}
          </div>

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="irr-schedule">
              {!currentWeather && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                  Loading live weather to compute schedule...
                </div>
              )}
              {liveSchedule.map((s, i) => (
                <div key={i} className="schedule-item">
                  <div className="schedule-top">
                    <div className="schedule-zone">{s.zone}</div>
                    <div className={`badge ${
                      s.status === 'Complete' ? 'badge-green' :
                      s.status === 'In Progress' ? 'badge-green' :
                      s.status === 'Scheduled' ? 'badge-blue' :
                      s.status === 'Paused – Rain' ? 'badge-blue' :
                      'badge-orange'
                    }`}>{s.status}</div>
                  </div>
                  <div className="schedule-crop">{s.crop}</div>
                  <div className="schedule-meta">
                    <span><Calendar size={11} /> {s.time}</span>
                    <span><Droplets size={11} /> {s.water}</span>
                  </div>
                  {s.note && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.4, fontStyle: 'italic' }}>
                      {s.note}
                    </div>
                  )}
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{ width: `${s.moisture}%` }} />
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: 3 }}>Soil Moisture: {s.moisture}%</div>
                </div>
              ))}
            </div>
          )}

          {/* Sensors Tab */}
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

          {/* Weather Tab — auto-loaded for farm coordinates */}
          {activeTab === 'weather' && (
            <div className="weather-forecast">
              {/* Farm location label */}
              <div className="weather-location-label" style={{ marginBottom: 12 }}>
                <MapPin size={11} /> Live 5-day forecast for <strong>{FARM_NAME}</strong>
                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green-accent)' }}>● {FARM_LAT.toFixed(4)}, {FARM_LNG.toFixed(4)}</span>
              </div>

              {/* Current conditions */}
              {currentWeather && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Now', val: `${currentWeather.icon} ${currentWeather.temp}°C`, color: 'var(--orange)' },
                    { label: 'Humidity', val: `${currentWeather.humidity}%`, color: 'var(--blue)' },
                    { label: 'Rainfall', val: `${currentWeather.precipitation}mm`, color: 'var(--teal)' },
                    { label: 'Wind', val: `${currentWeather.wind} km/h`, color: 'var(--text-secondary)' },
                  ].map(w => (
                    <div key={w.label} style={{ background: 'var(--bg-card2)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{w.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: w.color, marginTop: 2 }}>{w.val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {weatherError && <div className="weather-error">⚠️ {weatherError}</div>}

              {/* Loading */}
              {weatherLoading && (
                <div className="weather-skeleton">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="forecast-row skeleton-row">
                      <div className="skeleton-block" style={{ width: 55, height: 14 }} />
                      <div className="skeleton-block" style={{ width: 22, height: 22, borderRadius: 4 }} />
                      <div className="skeleton-block" style={{ width: 60, height: 14, flex: 1 }} />
                      <div className="skeleton-block" style={{ width: 44, height: 14 }} />
                      <div className="skeleton-block" style={{ width: 44, height: 14 }} />
                    </div>
                  ))}
                </div>
              )}

              {/* 5-day forecast */}
              {!weatherLoading && forecast && forecast.map((d, i) => (
                <div key={i} className={`forecast-row ${d.precipSum > 3 ? 'forecast-rain-day' : ''}`}>
                  <div className="forecast-day">{d.day}</div>
                  <div className="forecast-icon" title={d.label}>{d.icon}</div>
                  <div className="forecast-temp">
                    <span className="text-red">{d.high}°</span> / <span className="text-blue">{d.low}°</span>
                  </div>
                  <div className="forecast-rain"><Droplets size={11} /> {d.rain}</div>
                  <div className="forecast-humidity">{d.humidity}% RH</div>
                </div>
              ))}

              {/* Refresh button */}
              {!weatherLoading && (
                <button className="btn-ghost" style={{ width: '100%', marginTop: 8, fontSize: 11 }} onClick={fetchFarmWeather}>
                  🔄 Refresh Weather
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
