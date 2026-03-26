import { useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon } from 'react-leaflet'
import { Droplets, Thermometer, Calendar, Plus, Download, Activity, Search, MapPin, Loader } from 'lucide-react'
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

const fieldPolygon = [
  [30.9050, 75.8530], [30.9100, 75.8620],
  [30.9080, 75.8680], [30.9020, 75.8640], [30.9000, 75.8560]
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

/**
 * Normalize a raw query string:
 *  - Trim whitespace
 *  - Collapse multiple spaces / commas into a single space
 *  - Extract just the city portion (first token before a comma) so that
 *    "Mumbai, Maharashtra" or "Mumbai Maharashtra" both resolve to "Mumbai"
 *    while still passing the full cleaned string as a fallback.
 */
function normalizeQuery(raw) {
  const trimmed = raw.trim()
  // If there's a comma, take everything before the first comma as primary city
  const beforeComma = trimmed.split(',')[0].trim()
  return beforeComma || trimmed
}

/**
 * Score how closely a geocoding result name matches the query.
 * Lower score = better match.
 */
function matchScore(resultName, query) {
  const r = resultName.toLowerCase()
  const q = query.toLowerCase()
  if (r === q) return 0                          // exact
  if (r.startsWith(q)) return 1                  // starts with query
  if (r.includes(q)) return 2                    // contains query
  return 3                                       // partial / fuzzy
}

/**
 * Pick the best result from the geocoding API response.
 * Prefers results whose name closely matches the query string.
 */
function pickBestResult(results, query) {
  if (!results || results.length === 0) return null

  // Filter only for Indian locations
  const indiaResults = results.filter(r => r.country_code === 'IN' || r.country === 'India')
  if (indiaResults.length === 0) return null

  // Sort by match score, then by population (higher = more prominent city)
  const scored = indiaResults.map(r => ({
    ...r,
    score: matchScore(r.name, query),
  }))
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return (b.population || 0) - (a.population || 0)
  })
  return scored[0]
}

export default function Irrigation() {
  const [activeTab, setActiveTab] = useState('schedule')

  const [locationInput, setLocationInput] = useState('')
  const [locationName, setLocationName] = useState('')
  const [forecast, setForecast] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState('')

  async function fetchWeather() {
    const raw = locationInput.trim()
    if (!raw) return

    setWeatherLoading(true)
    setWeatherError('')
    setForecast(null)
    setLocationName('')

    // Derive a clean city-first query (handles "Mumbai, Maharashtra", "Mumbai Maharashtra", etc.)
    const cityQuery = normalizeQuery(raw)

    try {
      // Step 1: Geocode — fetch more results so we can pick the best match
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=100&language=en&format=json`
      )
      const geoData = await geoRes.json()

      // If city-first query failed, try the full raw input as fallback
      let best = pickBestResult(geoData.results, cityQuery)

      if (!best && cityQuery !== raw) {
        const fallbackRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(raw)}&count=100&language=en&format=json`
        )
        const fallbackData = await fallbackRes.json()
        best = pickBestResult(fallbackData.results, raw)
      }

      if (!best) {
        setWeatherError('Location not found. Please try a different name (e.g. "Mumbai" or "Indore").')
        setWeatherLoading(false)
        return
      }

      const { latitude, longitude, name, admin1, country } = best
      // Build a readable label: "Mumbai, Maharashtra, IN"
      const parts = [name, admin1, country].filter(Boolean)
      setLocationName(parts.join(', '))

      // Step 2: Fetch 5-day forecast
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max` +
        `&forecast_days=5&timezone=auto`
      )
      const weatherData = await weatherRes.json()
      const d = weatherData.daily

      const parsed = d.time.map((_, i) => ({
        day: DAY_LABELS[i],
        ...getWeatherInfo(d.weathercode[i]),
        high: Math.round(d.temperature_2m_max[i]),
        low: Math.round(d.temperature_2m_min[i]),
        rain: `${(d.precipitation_sum[i] ?? 0).toFixed(1)}mm`,
        humidity: d.relative_humidity_2m_max[i] ?? '--',
      }))

      setForecast(parsed)
    } catch (err) {
      setWeatherError('Failed to fetch weather. Please check your connection.')
    } finally {
      setWeatherLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') fetchWeather()
  }

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
                <Popup>
                  <div style={{ fontFamily: 'Inter', fontSize: 12 }}>
                    <strong>Block B – Active Irrigation</strong><br />
                    Moisture: 34% | Temp: 28°C<br />
                    Status: Active Irrigation Zone
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
              <div><span className="text-muted text-sm">Active Sensor: </span><span className="text-green">SENS-04B-1 • Moisture 34%</span></div>
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

          {/* Weather Tab — Dynamic */}
          {activeTab === 'weather' && (
            <div className="weather-forecast">

              {/* Location Search Box */}
              <div className="weather-search-box">
                <div className="weather-search-row">
                  <div className="weather-search-input-wrap">
                    <MapPin size={13} className="weather-pin-icon" />
                    <input
                      type="text"
                      className="weather-search-input"
                      placeholder="e.g. Mumbai, Indore, Ludhiana"
                      value={locationInput}
                      onChange={e => setLocationInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                  <button
                    className="btn-primary weather-search-btn"
                    onClick={fetchWeather}
                    disabled={weatherLoading || !locationInput.trim()}
                  >
                    {weatherLoading ? <Loader size={13} className="spin" /> : <Search size={13} />}
                    {weatherLoading ? 'Fetching…' : 'Get Weather'}
                  </button>
                </div>
                {locationName && !weatherLoading && (
                  <div className="weather-location-label">
                    <MapPin size={11} /> Showing forecast for <strong>{locationName}</strong>
                  </div>
                )}
              </div>

              {/* Error State */}
              {weatherError && (
                <div className="weather-error">⚠️ {weatherError}</div>
              )}

              {/* Loading Skeleton */}
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

              {/* Forecast Rows */}
              {!weatherLoading && forecast && forecast.map((d, i) => (
                <div key={i} className="forecast-row">
                  <div className="forecast-day">{d.day}</div>
                  <div className="forecast-icon" title={d.label}>{d.icon}</div>
                  <div className="forecast-temp">
                    <span className="text-red">{d.high}°</span> / <span className="text-blue">{d.low}°</span>
                  </div>
                  <div className="forecast-rain"><Droplets size={11} /> {d.rain}</div>
                  <div className="forecast-humidity">{d.humidity}% RH</div>
                </div>
              ))}

              {/* Empty state */}
              {!weatherLoading && !forecast && !weatherError && (
                <div className="weather-empty">
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🌍</div>
                  <div className="weather-empty-text">Enter a location above to load a live 5-day forecast</div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}