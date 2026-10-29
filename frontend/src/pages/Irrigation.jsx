/* eslint-disable no-unused-vars */
import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polygon, Popup } from 'react-leaflet'
import { Droplets, Thermometer, Calendar, Plus, Download, MapPin } from 'lucide-react'
import { FARM_BOUNDARY, buildZones } from './GISMapping'
import './Irrigation.css'

// Mote Patil Sugarcane Farms — exact coordinates
const FARM_LAT = 19.4308
const FARM_LNG = 74.9010
const FARM_NAME = 'Mote Patil Sugarcane Farms, Maharashtra'

// Farm boundary polygon for map
const farmPolygon = [
  [19.431147, 74.900480],
  [19.431153, 74.901019],
  [19.431138, 74.901906],
  [19.430525, 74.901972],
  [19.430661, 74.901574],
  [19.430316, 74.901609],
  [19.429984, 74.901629],
  [19.430051, 74.901130],
  [19.430128, 74.900718],
  [19.430202, 74.900242],
  [19.430285, 74.899713],
  [19.430611, 74.900040],
  [19.430935, 74.900324],
  [19.431147, 74.900480],
]

// Real zones generated dynamically from farm geometry
const FARM_ZONES = buildZones(FARM_BOUNDARY)

// Helper to convert GeoJSON polygon coordinates [lng, lat] to Leaflet [lat, lng]
function geoJsonToLeaflet(feature) {
  if (!feature?.geometry?.coordinates) return []
  const coords = feature.geometry.coordinates[0]
  return coords.map(([lng, lat]) => [lat, lng])
}

// How often the weather API is refreshed automatically (5 minutes)
const WEATHER_REFRESH_MS = 5 * 60 * 1000

// Staggered irrigation schedule windows for farm zones
const ZONE_SCHEDULE_CONFIG = [
  { startHour: 5,  startMin: 0,  endHour: 6,  endMin: 30, blockName: 'North Block' },
  { startHour: 6,  startMin: 30, endHour: 8,  endMin: 0,  blockName: 'North-East Block' },
  { startHour: 8,  startMin: 0,  endHour: 9,  endMin: 30, blockName: 'Central Block' },
  { startHour: 15, startMin: 0,  endHour: 16, endMin: 30, blockName: 'Central-West Block' },
  { startHour: 16, startMin: 30, endHour: 18, endMin: 0,  blockName: 'South Block' },
  { startHour: 18, startMin: 0,  endHour: 19, endMin: 30, blockName: 'South-East Block' },
  { startHour: 19, startMin: 30, endHour: 21, endMin: 0,  blockName: 'East Block' },
  { startHour: 21, startMin: 0,  endHour: 22, endMin: 30, blockName: 'West Block' },
]

// Soil physical profiles: water demand and moisture retention per soil type
const SOIL_PROFILES = {
  Clay:  { baseWater: 4.6, moistureOffset: 6,  drainage: 'High water retention' },
  Loam:  { baseWater: 5.4, moistureOffset: 0,  drainage: 'Balanced moisture buffer' },
  Sandy: { baseWater: 6.2, moistureOffset: -8, drainage: 'Fast drainage, high porosity' },
}

// Ideal/benchmark values for Co-86032 sugarcane (general growth-stage averages)
const SUGARCANE_BENCHMARK = {
  soilMoisture: { min: 60, max: 80 },   // %
  temp: { min: 26, max: 34 },           // °C — optimal growth range
  et0: { min: 3.5, max: 5.5 },          // mm/day — normal water loss
  humidity: { min: 60, max: 80 },       // %
}

// Simplified Penman-Monteith ET₀ estimate for sugarcane
// Uses temperature and humidity from live weather
function calcET0(tempC, humidity) {
  const vpd = (1 - humidity / 100) * 0.6108 * Math.exp(17.27 * tempC / (tempC + 237.3))
  const et0 = 0.408 * vpd * (tempC / 10) + 0.5
  return Math.max(0.5, Math.min(et0, 8))
}

// Derive live schedule dynamically from real current farm zones, live weather, and soil moisture
function buildLiveSchedule(weather, satMoisture, zones = FARM_ZONES) {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMin = now.getMinutes()
  const nowDecimal = currentHour + currentMin / 60

  const rain = weather?.precipitation ?? 0
  const temp = weather?.temp ?? 30
  const humidity = weather?.humidity ?? 65
  const et0 = calcET0(temp, humidity)

  // Satellite or live model moisture baseline
  const baseSat = satMoisture ? satMoisture.surfacePct : 58

  return zones.map((z, idx) => {
    const slot = ZONE_SCHEDULE_CONFIG[idx % ZONE_SCHEDULE_CONFIG.length]
    const profile = SOIL_PROFILES[z.soil] || SOIL_PROFILES.Loam
    const startDecimal = slot.startHour + slot.startMin / 60
    const endDecimal = slot.endHour + slot.endMin / 60

    // Zone soil moisture tailored to its soil type and vegetative vigor (NDVI)
    const ndviOffset = Math.round(((z.ndvi || 0.5) - 0.5) * 12)
    const liveMoisture = Math.max(10, Math.min(95, Math.round(baseSat + profile.moistureOffset + ndviOffset)))

    // Water demand adjusted for ET₀ and active rainfall
    const rainReduction = rain > 5 ? 0.3 : rain > 2 ? 0.65 : rain > 0.5 ? 0.85 : 1.0
    const tempFactor = temp > 38 ? 1.25 : temp > 35 ? 1.15 : temp > 32 ? 1.05 : 1.0
    const adjustedWater = (profile.baseWater * rainReduction * tempFactor).toFixed(1)

    const time = `${String(slot.startHour).padStart(2, '0')}:${String(slot.startMin).padStart(2, '0')} – ${String(slot.endHour).padStart(2, '0')}:${String(slot.endMin).padStart(2, '0')}`

    let status, color, note
    if (rain > 5) {
      status = 'Paused – Rain'
      color = '#a855f7'
      note = `Heavy rain (${rain}mm) active — irrigation paused to conserve water and prevent waterlogging.`
    } else if (liveMoisture < 35 && rain < 1) {
      status = 'Drought Risk'
      color = '#f97316'
      note = `${z.soil} soil critically dry (${liveMoisture}%). ET₀ = ${et0.toFixed(1)} mm/day. Immediate hydration required.`
    } else if (nowDecimal >= endDecimal) {
      status = 'Complete'
      color = '#22c55e'
      note = rain > 0.5
        ? `Completed with ${rain}mm rain contribution. Water quota conserved.`
        : `Completed on schedule. Target root hydration achieved.`
    } else if (nowDecimal >= startDecimal) {
      status = 'In Progress'
      color = '#06b6d4'
      note = `Active drip cycle running. Flow calibrated for ${z.soil} soil percolation.`
    } else {
      status = 'Scheduled'
      color = '#3b82f6'
      note = temp > 35
        ? `High temp (${temp}°C) — demand increased by ${Math.round((tempFactor - 1) * 100)}% for ${slot.blockName}.`
        : `On schedule. Calibrated for ${z.soil} soil (${profile.drainage}).`
    }

    return {
      id: z.id,
      zoneNumber: z.id + 1,
      zoneName: `Zone ${z.id + 1} (${slot.blockName})`,
      crop: 'ऊस (Sugarcane Co-86032)',
      soil: z.soil,
      areaHa: z.areaHa,
      ndvi: z.ndvi,
      geometry: z.geometry,
      centroid: z.centroid,
      time,
      water: `${adjustedWater} M³/Ha`,
      moisture: liveMoisture,
      status,
      color,
      note,
    }
  })
}

// Score a live value against a benchmark min/max range.
// Returns a graduated 0-100 score based on distance from the ideal range,
// instead of a strict pass/fail, so the dashboard always shows a meaningful number.
function scoreRange(value, min, max) {
  const mid = (min + max) / 2
  const halfRange = (max - min) / 2

  if (value >= min && value <= max) {
    // Inside range: score 80-100, higher the closer to the midpoint
    const distFromMid = Math.abs(value - mid)
    const score = Math.round(100 - (distFromMid / halfRange) * 20)
    return { status: 'optimal', message: 'Within ideal range', score }
  }

  // Outside range: score falls off the further away it is,
  // reaching 0 once the value is ~1x the range-width beyond the edge
  const dist = value < min ? min - value : value - max
  const status = value < min ? 'low' : 'high'
  const message = value < min ? `Below ideal (min ${min})` : `Above ideal (max ${max})`
  const score = Math.max(0, Math.round(100 - (dist / halfRange) * 60))
  return { status, message, score }
}

// Compare live farm conditions against the sugarcane benchmark
function compareToBenchmark(weather, avgMoisture) {
  if (!weather) return null
  const b = SUGARCANE_BENCHMARK
  const et0 = calcET0(weather.temp, weather.humidity)

  const checks = [
    { label: 'Soil Moisture', value: avgMoisture, unit: '%', ...scoreRange(avgMoisture, b.soilMoisture.min, b.soilMoisture.max) },
    { label: 'Field Temperature', value: weather.temp, unit: '°C', ...scoreRange(weather.temp, b.temp.min, b.temp.max) },
    { label: 'ET₀ (Water Loss Rate)', value: Number(et0.toFixed(1)), unit: 'mm/day', ...scoreRange(et0, b.et0.min, b.et0.max) },
    { label: 'Humidity', value: weather.humidity, unit: '%', ...scoreRange(weather.humidity, b.humidity.min, b.humidity.max) },
  ]

  const overallScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length)
  return { checks, overallScore }
}

// Combines rainfall, ET0 (water loss), and soil moisture into one irrigation decision
function generateIrrigationAdvisory(weather, avgMoisture) {
  if (!weather) return { level: 'loading', text: 'Fetching live data for irrigation advisory...' }

  const et0 = calcET0(weather.temp, weather.humidity)
  const rain = weather.precipitation
  const netBalance = rain - et0 // positive = gaining water, negative = losing water

  let level, text
  if (rain > 5) {
    level = 'pause'
    text = `Heavy rainfall (${rain}mm) is naturally saturating the soil. Irrigation should pause — net balance is +${netBalance.toFixed(1)}mm today.`
  } else if (avgMoisture < 35 && netBalance < 0) {
    level = 'urgent'
    text = `Soil moisture is critically low (${avgMoisture}%) and ET₀ (${et0.toFixed(1)}mm/day) exceeds rainfall (${rain}mm). Net deficit of ${Math.abs(netBalance).toFixed(1)}mm/day — irrigate urgently.`
  } else if (avgMoisture < 50 && netBalance < 1) {
    level = 'moderate'
    text = `Moisture trending down (${avgMoisture}%). ET₀ (${et0.toFixed(1)}mm/day) is only partly offset by rainfall. Irrigate within 24 hours.`
  } else {
    level = 'ok'
    text = `Soil moisture (${avgMoisture}%) is stable. Rainfall is keeping pace with ET₀ (${et0.toFixed(1)}mm/day). No irrigation needed right now.`
  }
  return { level, text, et0, netBalance }
}

// ── Real satellite soil moisture: NASA POWER API ──────────────────────────
// Uses GWETTOP (surface wetness) and GWETROOT (root-zone wetness), both
// expressed as a 0-1 fraction of saturation. No API key, no HDF5 parsing —
// plain JSON over HTTPS, same pattern as the Open-Meteo weather call below.
// Data has ~8-12 day satellite processing latency, so we request a 30-day
// window and use the most recent day that has a valid reading.
function formatDateForNASA(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

async function fetchSatelliteSoilMoisture(lat, lng) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)

  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point` +
    `?parameters=GWETTOP,GWETROOT` +
    `&community=AG` +
    `&longitude=${lng}&latitude=${lat}` +
    `&start=${formatDateForNASA(start)}&end=${formatDateForNASA(end)}` +
    `&format=JSON`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`NASA POWER request failed (${res.status})`)
  const data = await res.json()

  const top = data.properties.parameter.GWETTOP
  const root = data.properties.parameter.GWETROOT

  // NASA fills missing/unprocessed days with -999 — walk backward to the
  // most recent day that actually has a value
  const dates = Object.keys(top).sort().reverse()
  const latestDate = dates.find(d => top[d] !== -999 && top[d] != null)
  if (!latestDate) throw new Error('No recent soil moisture data available for this location')

  return {
    date: latestDate,
    surfacePct: Math.round(top[latestDate] * 100),   // fraction of saturation → %
    rootZonePct: Math.round(root[latestDate] * 100),
    source: 'NASA POWER (GWETTOP/GWETROOT)',
  }
}

async function fetchOpenMeteoSoilMoisture(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm&timezone=Asia%2FKolkata`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo soil request failed (${res.status})`)
  const data = await res.json()
  const c = data.current
  const surface = ((c.soil_moisture_0_to_1cm + c.soil_moisture_1_to_3cm) / 2)
  const root = ((c.soil_moisture_3_to_9cm + c.soil_moisture_9_to_27cm) / 2)
  const todayStr = (c.time || new Date().toISOString()).slice(0, 10).replace(/-/g, '')
  return {
    date: todayStr,
    surfacePct: Math.round(surface * 100),
    rootZonePct: Math.round(root * 100),
    source: 'Open-Meteo Soil Model',
  }
}

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

function formatTime(date) {
  if (!date) return '—'
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const DAY_LABELS = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5']

export default function Irrigation() {
  const [activeTab, setActiveTab] = useState('schedule')
  const [forecast, setForecast] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState('')
  const [currentWeather, setCurrentWeather] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [satMoisture, setSatMoisture] = useState(null)
  const [satMoistureLoading, setSatMoistureLoading] = useState(false)
  const [satMoistureError, setSatMoistureError] = useState('')
  const [selectedZoneId, setSelectedZoneId] = useState(null)
  const intervalRef = useRef(null)
  const satIntervalRef = useRef(null)

  // Auto-fetch weather for the exact farm coordinates on mount,
  // then keep refreshing every 5 minutes.
  useEffect(() => {
    fetchFarmWeather()
    intervalRef.current = setInterval(fetchFarmWeather, WEATHER_REFRESH_MS)
    return () => clearInterval(intervalRef.current)
  }, [])

  // Satellite soil moisture updates far less often than weather (daily
  // satellite passes with a few days of processing lag), so refresh
  // every 12 hours rather than every 5 minutes.
  useEffect(() => {
    loadSatelliteSoilMoisture()
    satIntervalRef.current = setInterval(loadSatelliteSoilMoisture, 12 * 60 * 60 * 1000)
    return () => clearInterval(satIntervalRef.current)
  }, [])

  async function loadSatelliteSoilMoisture() {
    setSatMoistureLoading(true)
    setSatMoistureError('')
    try {
      const result = await fetchSatelliteSoilMoisture(FARM_LAT, FARM_LNG)
      setSatMoisture(result)
    } catch (err) {
      try {
        const fallback = await fetchOpenMeteoSoilMoisture(FARM_LAT, FARM_LNG)
        setSatMoisture(fallback)
      } catch (fallbackErr) {
        setSatMoistureError('Could not fetch soil moisture — using field estimates instead.')
      }
    } finally {
      setSatMoistureLoading(false)
    }
  }

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
      setLastRefreshed(new Date())
    } catch (err) {
      setWeatherError('Failed to fetch weather data. Check your connection.')
    } finally {
      setWeatherLoading(false)
    }
  }

  const liveSchedule = buildLiveSchedule(currentWeather, satMoisture)

  // Average soil moisture across scheduled blocks (replaces the old sensor-derived figure)
  const avgMoisture = Math.round(
    liveSchedule.reduce((sum, s) => sum + s.moisture, 0) / liveSchedule.length
  )

  // Combined rainfall + ET0 + soil moisture irrigation advisory
  const advisory = generateIrrigationAdvisory(currentWeather, avgMoisture)

  // Live conditions compared against the sugarcane benchmark
  const benchmarkData = compareToBenchmark(currentWeather, avgMoisture)

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
            val: avgMoisture, unit: '%', icon: '🌱',
            sub: satMoisture
              ? `${satMoisture.source} · as of ${satMoisture.date.slice(0,4)}-${satMoisture.date.slice(4,6)}-${satMoisture.date.slice(6,8)}`
              : satMoistureLoading ? 'Fetching soil moisture reading...' : 'Using field estimates (satellite unavailable)',
            color: 'var(--teal)', badge: satMoisture ? 'LIVE' : 'AI INSIGHT'
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

      {/* Irrigation Advisory — combines rainfall + ET0 + soil moisture, live */}
      <div className={`ai-rec-banner ai-rec-${advisory.level}`}>
        <div className="ai-rec-icon">
          {advisory.level === 'urgent' ? '🚨' : advisory.level === 'pause' ? '🌧️' : advisory.level === 'moderate' ? '⚠️' : '🤖'}
        </div>
        <div className="ai-rec-content">
          <div className="ai-rec-title">Irrigation Advisory – {FARM_NAME}</div>
          <div className="ai-rec-text">{advisory.text}</div>
        </div>
        <button className="btn-primary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Apply Adjustment</button>
      </div>

      {/* Main Content */}
      <div className="irr-main">
        {/* Map — centered on actual farm */}
        {/* Map — centered on actual farm */}
        <div className="irr-map-col">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="irr-map-header">
              <div className="irr-map-title">Mote Patil Farm – {liveSchedule.length} Zones Live Irrigation View</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div className="irr-legend-item" style={{ color: '#22c55e' }}>🟢 Complete</div>
                <div className="irr-legend-item" style={{ color: '#06b6d4' }}>💠 In Progress</div>
                <div className="irr-legend-item" style={{ color: '#3b82f6' }}>🔵 Scheduled</div>
                <div className="irr-legend-item" style={{ color: '#f97316' }}>🟠 Drought Risk</div>
              </div>
            </div>
            <MapContainer center={[FARM_LAT, FARM_LNG]} zoom={15} style={{ height: '340px' }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles © Esri"
                maxZoom={19}
              />
              {/* Outer boundary outline */}
              <Polygon
                positions={farmPolygon}
                pathOptions={{
                  color: '#ffffff',
                  weight: 2,
                  fillColor: 'transparent',
                  dashArray: '6,4',
                }}
              />
              {/* Dynamic current zones from GIS */}
              {liveSchedule.map(s => {
                const positions = geoJsonToLeaflet(s.geometry)
                if (!positions.length) return null
                const isSelected = selectedZoneId === s.id
                return (
                  <Polygon
                    key={s.id}
                    positions={positions}
                    pathOptions={{
                      color: isSelected ? '#ffffff' : s.color,
                      weight: isSelected ? 3 : 1.5,
                      fillColor: s.color,
                      fillOpacity: isSelected ? 0.65 : 0.45,
                    }}
                    eventHandlers={{
                      click: () => setSelectedZoneId(s.id === selectedZoneId ? null : s.id),
                    }}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'Inter', fontSize: 12, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--green-accent)', marginBottom: 2 }}>
                          {s.zoneName}
                        </div>
                        <div><strong>Soil Type:</strong> {s.soil} Soil</div>
                        <div><strong>Zone Area:</strong> {s.areaHa} Ha</div>
                        <div><strong>Status:</strong> {s.status}</div>
                        <div><strong>Irrigation Window:</strong> {s.time}</div>
                        <div><strong>Water Allocation:</strong> {s.water}</div>
                        <div><strong>Soil Moisture:</strong> {s.moisture}%</div>
                      </div>
                    </Popup>
                  </Polygon>
                )
              })}
            </MapContainer>
          </div>
        </div>

        {/* Right Panel */}
        <div className="irr-right-col">
          <div className="irr-tabs">
            {['schedule', 'weather', 'benchmark'].map(t => (
              <button key={t} className={`irr-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                {t === 'schedule' ? '📅 Schedule' : t === 'weather' ? '🌦️ Weather' : '📊 Benchmark'}
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
              {liveSchedule.map((s) => {
                const isSelected = selectedZoneId === s.id
                return (
                  <div
                    key={s.id}
                    className="schedule-item"
                    onClick={() => setSelectedZoneId(s.id === selectedZoneId ? null : s.id)}
                    style={{
                      cursor: 'pointer',
                      borderColor: isSelected ? 'var(--green-accent)' : undefined,
                      borderLeftWidth: isSelected ? '4px' : undefined,
                      borderLeftColor: isSelected ? 'var(--green-accent)' : undefined,
                      background: isSelected ? 'rgba(34, 197, 94, 0.08)' : undefined,
                      transition: 'var(--transition)',
                    }}
                  >
                    <div className="schedule-top">
                      <div className="schedule-zone">
                        {s.zoneName}
                      </div>
                      <div className={`badge ${
                        s.status === 'Complete' ? 'badge-green' :
                        s.status === 'In Progress' ? 'badge-blue' :
                        s.status === 'Scheduled' ? 'badge-blue' :
                        s.status === 'Paused – Rain' ? 'badge-purple' :
                        'badge-orange'
                      }`}>{s.status}</div>
                    </div>
                    <div className="schedule-crop" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{s.crop}</span>
                      <span className="badge" style={{ background: 'var(--bg-card2)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 10 }}>
                        {s.soil} Soil • {s.areaHa} Ha
                      </span>
                    </div>
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
                      <div
                        className="progress-fill"
                        style={{
                          width: `${s.moisture}%`,
                          background: s.moisture < 35 ? 'var(--orange)' : s.moisture > 85 ? 'var(--blue)' : undefined
                        }}
                      />
                    </div>
                    <div className="text-sm text-muted" style={{ marginTop: 3 }}>
                      Soil Moisture: <strong>{s.moisture}%</strong> {s.moisture < 35 ? '⚠️ Low' : s.moisture > 80 ? '💧 Saturated' : '✅ Optimal'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Weather Tab — auto-loaded for farm coordinates, refreshes every 5 min */}
          {activeTab === 'weather' && (
            <div className="weather-forecast">
              {/* Farm location label */}
              <div className="weather-location-label" style={{ marginBottom: 4 }}>
                <MapPin size={11} /> Live 5-day forecast for <strong>{FARM_NAME}</strong>
                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green-accent)' }}>● {FARM_LAT.toFixed(4)}, {FARM_LNG.toFixed(4)}</span>
              </div>

              {/* Last refreshed */}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
                Last refreshed: {formatTime(lastRefreshed)} · Auto-refreshes every 5 min
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

              {/* Satellite soil moisture detail */}
              {satMoisture && (
                <div style={{ background: 'var(--bg-card2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    Satellite Soil Moisture — {satMoisture.source}
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)' }}>{satMoisture.surfacePct}%</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Surface wetness</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{satMoisture.rootZonePct}%</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Root-zone wetness</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4, fontStyle: 'italic' }}>
                    Satellite-estimated at ~50km resolution — reflects regional conditions around the farm, not a per-plot sensor reading.
                  </div>
                </div>
              )}
              {satMoistureError && <div className="weather-error">⚠️ {satMoistureError}</div>}

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

          {/* Benchmark Tab — live conditions vs ideal sugarcane ranges */}
          {activeTab === 'benchmark' && (
            <div className="irr-benchmark">
              {benchmarkData ? (
                <>
                  <div className="benchmark-score-banner">
                    <div className="benchmark-score-val">{benchmarkData.overallScore}%</div>
                    <div className="benchmark-score-label">Aligned with Co-86032 Sugarcane Benchmark</div>
                  </div>
                  {benchmarkData.checks.map((c, i) => (
                    <div key={i} className="benchmark-row">
                      <div className="benchmark-row-top">
                        <span>{c.label}</span>
                        <span className={`badge ${c.status === 'optimal' ? 'badge-green' : c.status === 'low' ? 'badge-blue' : 'badge-orange'}`}>
                          {c.status === 'optimal' ? '✓ Optimal' : c.status === 'low' ? '↓ Low' : '↑ High'}
                        </span>
                      </div>
                      <div className="benchmark-row-val">{c.value}{c.unit}</div>
                      <div className="benchmark-row-msg">{c.message}</div>
                      <div className="progress-bar" style={{ marginTop: 6 }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${c.score}%`,
                            background: c.status === 'optimal' ? 'var(--green-accent)' : c.status === 'low' ? 'var(--blue)' : 'var(--orange)'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading benchmark comparison...</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}