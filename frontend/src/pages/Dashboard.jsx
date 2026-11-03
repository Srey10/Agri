/* eslint-disable no-unused-vars */
import { useState, useEffect, useMemo } from 'react'
import { Thermometer, Droplets, Wind, AlertTriangle, Clock, MapPin, Bell } from 'lucide-react'
import MapView from '../components/MapView'
import AdvisoryCard from '../components/AdvisoryCard'
import { buildZones, classifyHealth, healthColor, fetchRainfall } from './GISMapping'
import { getFarmInfo, getFieldFeature, getBoundaryCenter } from '../data/farm'
import './Dashboard.css'

// Fetch live weather + forecast from Open-Meteo for the exact farm location
async function fetchWeather(FARM_LAT, FARM_LNG) {
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

// Map weather to farmer-friendly alert
function weatherAlert(code, precipSum, temp, crop = 'crops') {
  if (code >= 95) return { level: 'high', text: '⛈️ Storm warning near your farm! Secure equipment and pause field operations.' }
  if (code >= 61) return { level: 'medium', text: '🌧️ Rain expected. Hold off on fertilizer spraying and watch for standing water.' }
  if (temp > 36) return { level: 'medium', text: `🔥 High heat today. Water ${crop} early morning or late evening to prevent scorch.` }
  if (precipSum < 1) return { level: 'medium', text: `☀️ Dry spell continuing. Activate drip irrigation across all ${crop} blocks today.` }
  return { level: 'low', text: '✅ Favourable weather for crop growth. Continue routine farm operations.' }
}

// Spraying suitability helper
function getSprayCondition(windSpeed, precipitation, temp) {
  if (precipitation > 0) return { status: 'Hold Off', reason: 'Rain washes away spray', safe: false }
  if (windSpeed > 20) return { status: 'Too Windy', reason: 'Wind causes spray drift', safe: false }
  if (temp > 35) return { status: 'Spray at Dusk', reason: 'Avoid rapid evaporation in peak heat', safe: true }
  return { status: 'Good to Spray', reason: 'Calm wind & dry leaves', safe: true }
}

// Generate farmer-friendly activity feed
function generateActivity(zones, weather) {
  const activities = []
  const problematic = zones.filter(z => z.health === 'Problematic')
  const moderate = zones.filter(z => z.health === 'Moderate')
  const healthy = zones.filter(z => z.health === 'Healthy')
  const now = new Date()

  if (problematic.length > 0) {
    activities.push({
      icon: '🔴', color: '#ef4444',
      title: `${problematic.length} Plot${problematic.length > 1 ? 's' : ''} Need Urgent Attention`,
      sub: `Plot${problematic.length > 1 ? 's' : ''} ${problematic.map(z => z.id + 1).join(', ')} show crop stress. Check for dry soil and water immediately.`,
      time: 'Just now'
    })
  } else if (moderate.length > 0) {
    activities.push({
      icon: '🟡', color: '#eab308',
      title: `${moderate.length} Plot${moderate.length > 1 ? 's' : ''} Under Observation`,
      sub: `Plot${moderate.length > 1 ? 's' : ''} ${moderate.map(z => z.id + 1).join(', ')} show slight moisture stress. Run regular drip irrigation.`,
      time: 'Just now'
    })
  }

  if (weather?.current?.precipitation > 0) {
    activities.push({
      icon: '🌧️', color: '#3b82f6',
      title: `Rain Recorded: ${weather.current.precipitation} mm`,
      sub: `Natural moisture received. Soil is moist, drip irrigation can be paused.`,
      time: `${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    })
  } else {
    activities.push({
      icon: '💧', color: '#22c55e',
      title: 'No Rain Today (Dry Soil)',
      sub: 'Drip irrigation recommended for 2 hours for sugarcane root zones.',
      time: `${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    })
  }

  if (weather?.current?.temperature_2m > 35) {
    activities.push({
      icon: '🌡️', color: '#f97316',
      title: `High Heat Advisory: ${weather.current.temperature_2m}°C`,
      sub: 'Crops transpire rapidly in hot weather. Ensure water reaches deeper roots.',
      time: '15 mins ago'
    })
  } else if (weather?.current?.temperature_2m) {
    activities.push({
      icon: '🌤️', color: '#eab308',
      title: `Temperature: ${weather.current.temperature_2m}°C`,
      sub: 'Conditions within a normal range. Monitor afternoon heat.',
      time: '5 mins ago'
    })
  }

  activities.push({
    icon: '🛰️', color: '#14b8a6',
    title: 'Daily Farm Satellite Scan Complete',
    sub: `All 16 plots inspected — ${healthy.length} plots are green and healthy.`,
    time: '30 mins ago'
  })

  return activities
}

// Generate AI insight from actual zone data
function generateInsight(zones, weather, farmName) {
  const problematic = zones.filter(z => z.health === 'Problematic')
  const moderate = zones.filter(z => z.health === 'Moderate')
  const healthy = zones.filter(z => z.health === 'Healthy')
  const temp = weather?.current?.temperature_2m
  const rain = weather?.current?.precipitation
  const humidity = weather?.current?.relative_humidity_2m

  if (problematic.length === 0 && moderate.length <= 2) {
    return `All ${healthy.length} zones at ${farmName} are in good health. Current temperature ${temp ?? '—'}°C and humidity ${humidity ?? '—'}% are within optimal range. Continue regular irrigation schedule.`
  }

  if (problematic.length > 0) {
    const soilTypes = [...new Set(problematic.map(z => z.soil).filter(Boolean))]
    return `Zone${problematic.length > 1 ? 's' : ''} ${problematic.map(z => z.id + 1).join(', ')} ${soilTypes.length ? `(${soilTypes.join('/')}) ` : ''}show critical stress — low vegetation density with rainfall under 1mm. At ${temp ?? '—'}°C and ${humidity ?? '—'}% humidity, risk of crop stress is elevated. Recommend immediate inspection and irrigation.`
  }

  return `${moderate.length} zones at moderate health. With ${rain ?? 0}mm current rainfall and ${temp ?? '—'}°C temperature, increase drip irrigation by 15% on stressed zones. Apply foliar micronutrient spray within 48 hours.`
}

// Up to three summary cards, each covering a consecutive group of the field's zones.
function buildFieldCards(farm, zoneCount) {
  const prefix = farm.fieldId || 'FIELD'
  const location = [farm.farmName, farm.fieldName, farm.location].filter(Boolean).join(', ')
  const size = Math.max(1, Math.ceil(zoneCount / 3))
  const cards = []
  for (let i = 0; i < 3 && i * size < zoneCount; i++) {
    const from = i * size + 1
    const to = Math.min((i + 1) * size, zoneCount)
    cards.push({ id: `${prefix}-Z0${i + 1}`, name: from === to ? `Zone ${from}` : `Zones ${from}–${to}`, crop: farm.crop || 'Crop not set', location })
  }
  return cards
}

export default function Dashboard({ user, field }) {
  const farm = getFarmInfo(user, field)
  // Zones and weather location come from the farmer's own saved boundary
  const boundary = useMemo(() => getFieldFeature(field), [field])
  const partialZones = useMemo(() => buildZones(boundary), [boundary])
  const [farmLat, farmLng] = useMemo(() => getBoundaryCenter(boundary), [boundary])
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
    fetchWeather(farmLat, farmLng)
      .then(data => setWeather(data))
      .catch(() => setWeather(null))
      .finally(() => setWeatherLoading(false))
  }, [farmLat, farmLng])

  // Fetch live rainfall per zone and classify health
// Fetch live rainfall + Sentinel-2 NDVI per zone
useEffect(() => {
  const loadDashboardZones = async () => {
    try {
      const rainfallValues = await fetchRainfall(partialZones)

      const ndviValues = await Promise.all(
        partialZones.map(async (zone) => {
          try {
            const response = await fetch(
              'http://127.0.0.1:5000/ndvi',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  geometry: zone.geometry.geometry
                })
              }
            )

            const data = await response.json()

            console.log(
              `Dashboard Zone ${zone.id + 1} Sentinel NDVI:`,
              data
            )

            return data.ndvi ?? null
          } catch (error) {
            console.error(
              `Dashboard NDVI failed for zone ${zone.id + 1}:`,
              error
            )
            return null
          }
        })
      )

      const enriched = partialZones.map((z, i) => {
        const rainfall = rainfallValues[i]
        const ndvi = ndviValues[i]

        const health =
          ndvi !== null
            ? classifyHealth(ndvi, rainfall)
            : 'Moderate'

        return {
          ...z,
          ndvi,
          rainfall,
          health,
          color: healthColor(health)
        }
      })

      setDashZones(enriched)
    } catch (error) {
      console.error('Dashboard GIS data loading failed:', error)
    } finally {
      setZonesLoading(false)
    }
  }

  loadDashboardZones()
}, [partialZones])

  const healthyCnt = dashZones.filter(z => z.health === 'Healthy').length
  const moderateCnt = dashZones.filter(z => z.health === 'Moderate').length
  const problematicCnt = dashZones.filter(z => z.health === 'Problematic').length

  const temp = weather?.current?.temperature_2m
  const humidity = weather?.current?.relative_humidity_2m
  const windSpeed = weather?.current?.wind_speed_10m
  const precipitation = weather?.current?.precipitation ?? 0
  const weatherCode = weather?.current?.weather_code ?? 0
  const precipSum3d = weather?.daily?.precipitation_sum?.reduce((a, b) => a + b, 0) ?? 0

  const alert = weatherAlert(weatherCode, precipSum3d, temp)
  const sprayCondition = getSprayCondition(windSpeed, precipitation, temp)
  const activity = generateActivity(dashZones, weather)
  const aiInsight = generateInsight(dashZones, weather, farm.farmName)

  const [selectedPlotModal, setSelectedPlotModal] = useState(null)
  const [showAlertsModal, setShowAlertsModal] = useState(false)
  const [showAutoToast, setShowAutoToast] = useState(true)

  // Open modal pop-up with farmer guidance when a zone is clicked on map
  const openZoneModal = (zone) => {
    const isHealthy = zone.health === 'Healthy'
    const isModerate = zone.health === 'Moderate'
    setSelectedPlotModal({
      zoneId: zone.id,
      title: `Plot ${zone.id + 1} – Field Inspection`,
      tag: 'Plot Specific Advice',
      status: isHealthy ? 'Healthy (Good Growth)' : isModerate ? 'Needs Care (Mild Stress)' : 'Unhealthy (Urgent Action Needed)',
      healthClass: isHealthy ? 'healthy' : isModerate ? 'moderate' : 'problem',
      healthIcon: isHealthy ? '🌱' : isModerate ? '⚠️' : '🚨',
      cropStatus: isHealthy
        ? 'Crops are thriving with green leaves and vigorous growth.'
        : isModerate
        ? 'Mild moisture deficit or stress noted. Growth slightly slowed.'
        : 'High stress detected! Crops need immediate physical inspection and irrigation.',
      wateringAdvice: (zone.rainfall > 0)
        ? `Natural rainfall received (${zone.rainfall} mm). Soil is moist; keep drip irrigation off today.`
        : (temp > 35 ? 'High heat wave: Run drip irrigation for 2.5 to 3 hours in early morning or late evening.' : 'Normal dry weather: Run drip irrigation for 2 hours today to maintain root moisture.'),
      sprayingAdvice: sprayCondition.safe
        ? 'Good spraying conditions: gentle winds and dry leaves.'
        : `Hold off on spraying today (${sprayCondition.reason}).`,
      actionSteps: isHealthy
        ? [
            'Maintain regular watering schedule.',
            'Canopy cover is dense and healthy.',
            'No emergency intervention needed.'
          ]
        : isModerate
        ? [
            'Run drip irrigation for an additional 30-45 minutes on this plot today.',
            'Inspect drip lateral lines for clogged drippers.',
            'Re-check plot condition in 48 hours.'
          ]
        : [
            'Urgent: Irrigate this plot immediately (run drip for 3 hours).',
            'Physically walk this plot and check stalks/roots for borers or red rot.',
            'Apply potassium or foliar micronutrients to help plants recover.'
          ],
      areaHa: zone.areaHa
    })
  }

  // Open modal pop-up when a field block card is clicked
  const openBlockModal = (field, zoneGroup) => {
    const healthyCount = zoneGroup.filter(z => z.health === 'Healthy').length
    const problemCount = zoneGroup.filter(z => z.health === 'Problematic').length
    const modCount = zoneGroup.filter(z => z.health === 'Moderate').length
    const isHealthy = problemCount === 0 && modCount <= 1
    const isMod = problemCount === 0 && modCount > 1

    setSelectedPlotModal({
      title: `${field.name} (${field.id})`,
      tag: 'Field Block Overview',
      status: isHealthy ? 'Block Healthy' : isMod ? 'Block Needs Monitoring' : 'Block At Risk',
      healthClass: isHealthy ? 'healthy' : isMod ? 'moderate' : 'problem',
      healthIcon: isHealthy ? '🌾' : isMod ? '⚠️' : '🚨',
      cropStatus: `${field.crop} · ${healthyCount} of ${zoneGroup.length} plots are green and healthy.`,
      wateringAdvice: precipitation > 0
        ? `Rainfall received (${precipitation} mm). Soil moisture is good, drip can stay off today.`
        : (temp > 35 ? 'High temperature: Provide 3 hours of drip irrigation during cooler morning hours.' : 'Normal watering: 2 hours scheduled for this block today.'),
      sprayingAdvice: sprayCondition.safe ? 'Safe spraying conditions today with calm breeze.' : `Spraying not recommended today: ${sprayCondition.reason}.`,
      actionSteps: problemCount > 0
        ? [
            `Plots showing stress: ${zoneGroup.filter(z => z.health === 'Problematic').map(z => `Plot ${z.id + 1}`).join(', ')}.`,
            'Check main drip lines and sub-valves for uniform pressure across rows.',
            'Walk the block to inspect lower leaves and stems for early signs of disease.'
          ]
        : isMod
        ? [
            'Crops are stable with minor moisture stress in parts of the block.',
            'Check edge rows to confirm drip water is reaching every plant.',
            'Monitor afternoon leaf curling.'
          ]
        : [
            'Block is healthy and developing according to schedule.',
            'Continue routine watering and weed management.',
            'All plots in this block passed the satellite crop check.'
          ],
      areaHa: zoneGroup.reduce((s, z) => s + (z.areaHa || 0), 0).toFixed(2)
    })
  }

  // Overall farm status badge
  const riskLevel = problematicCnt >= 3 || (temp > 38) ? 'HIGH' :
    problematicCnt >= 1 || moderateCnt >= 5 ? 'MODERATE' : 'LOW'
  const riskBadge = riskLevel === 'HIGH' ? 'badge-red' : riskLevel === 'MODERATE' ? 'badge-yellow' : 'badge-green'
  const riskLabel = riskLevel === 'HIGH' ? 'ACTION NEEDED' : riskLevel === 'MODERATE' ? 'MONITOR PLOTS' : 'ALL HEALTHY'

  // Farmer watering advice calculation
  const wateringHours = precipitation > 2 ? '0 Hours' : (temp > 35 ? '3 Hours' : '2 Hours')
  const wateringUnit = precipitation > 2 ? 'Rain Sufficient' : 'Drip Today'
  const wateringSub = precipitation > 2
    ? `Rain (${precipitation}mm) recorded — keep drip off`
    : (temp > 35 ? `High heat (${temp}°C) — irrigate early morning` : 'Dry conditions — regular 2hr drip cycle recommended')

  // Build live farm pop-up alerts dynamically
  const activeAlerts = []
  if (problematicCnt > 0) {
    const badPlots = dashZones.filter(z => z.health === 'Problematic')
    activeAlerts.push({
      id: 'crop-problem',
      level: 'urgent',
      icon: '🚨',
      title: `${problematicCnt} Plot${problematicCnt > 1 ? 's' : ''} Need Urgent Attention`,
      message: `Plot${problematicCnt > 1 ? 's' : ''} ${badPlots.map(z => z.id + 1).join(', ')} show severe vegetation stress and low moisture. Crops need immediate watering and leaf inspection.`,
      actionText: 'View Plot Guidance',
      onAction: () => openZoneModal(badPlots[0])
    })
  } else if (moderateCnt > 0) {
    const modPlots = dashZones.filter(z => z.health === 'Moderate')
    activeAlerts.push({
      id: 'crop-mod',
      level: 'warning',
      icon: '⚠️',
      title: `${moderateCnt} Plot${moderateCnt > 1 ? 's' : ''} Under Observation`,
      message: `Plot${moderateCnt > 1 ? 's' : ''} ${modPlots.map(z => z.id + 1).join(', ')} show mild moisture stress. Increase drip cycle by 30-45 minutes today.`,
      actionText: 'Inspect Plot',
      onAction: () => openZoneModal(modPlots[0])
    })
  }

  if (temp > 35) {
    activeAlerts.push({
      id: 'weather-heat',
      level: 'warning',
      icon: '🔥',
      title: `High Heat Advisory (${temp}°C)`,
      message: 'Intense midday heat accelerates transpiration. Irrigate during early morning or after 5 PM to prevent leaf scorching.',
      actionText: 'View Watering Advice',
      onAction: () => openZoneModal(dashZones[0])
    })
  }

  if (precipitation > 0) {
    activeAlerts.push({
      id: 'weather-rain',
      level: 'info',
      icon: '🌧️',
      title: `Natural Rainfall Received (${precipitation} mm)`,
      message: 'Natural moisture recorded at the farm. Pause drip irrigation today to save pump electricity and avoid root waterlogging.',
      actionText: 'Got It',
      onAction: null
    })
  } else if (precipSum3d < 1) {
    activeAlerts.push({
      id: 'weather-dry',
      level: 'warning',
      icon: '☀️',
      title: '3-Day Dry Spell Active',
      message: 'Zero rainfall forecasted for the next 72 hours. Sugarcane in tillering stage requires uninterrupted drip irrigation cycles.',
      actionText: 'Irrigation Plan',
      onAction: () => openZoneModal(dashZones[0])
    })
  }

  if (!sprayCondition.safe) {
    activeAlerts.push({
      id: 'spray-alert',
      level: 'warning',
      icon: '🚜',
      title: `Pause Chemical Spraying: ${sprayCondition.status}`,
      message: `${sprayCondition.reason} (Wind: ${windSpeed} km/h). Wait for calm conditions before spraying nutrients or insecticides.`,
      actionText: null,
      onAction: null
    })
  }

  return (
    <div className="dashboard fade-in">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">🌾 {farm.farmName} – Command Center</h1>
          <p className="dash-sub">{[
            farm.farmerName && `Farmer: ${farm.farmerName}`,
            farm.fieldName && `Field: ${farm.fieldName}${farm.fieldAreaHa != null ? ` (${farm.fieldAreaHa.toFixed(2)} ha)` : ''}`,
            farm.location,
          ].filter(Boolean).join(' · ')}{' · '}{currentTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="dash-header-right">
          <button
            className="header-alert-btn"
            onClick={() => setShowAlertsModal(true)}
            title="Click to view all active farm pop-up alerts"
          >
            <Bell size={15} />
            <span>Pop-up Alerts</span>
            {activeAlerts.length > 0 && (
              <span className="header-alert-count">{activeAlerts.length}</span>
            )}
          </button>
          <div className={`badge ${riskBadge}`}>
            <span className={`dot dot-${riskLevel === 'HIGH' ? 'red' : riskLevel === 'MODERATE' ? 'orange' : 'green'}`}></span>
            {riskLabel}
          </div>
          <div className="live-time">{currentTime.toLocaleTimeString('en-IN')}</div>
        </div>
      </div>

      {/* Alert Banner — Clickable to open full alerts pop-up */}
      <div
        className={`alert-banner clickable ${alert.level === 'high' ? 'alert-high' : alert.level === 'medium' ? 'alert-medium' : 'alert-low'}`}
        onClick={() => setShowAlertsModal(true)}
        title="Click to open Farm Pop-up Alerts"
      >
        <div className="alert-icon"><AlertTriangle size={20} /></div>
        <div className="alert-content">
          <div className="alert-title">
            {alert.level === 'high' ? '⛈️' : alert.level === 'medium' ? '🌡️' : '✅'} Farm Guidance — {farm.farmName}
          </div>
          <div className="alert-sub">{weatherLoading ? 'Checking live farm weather...' : alert.text}</div>
        </div>
        <div className="alert-stats">
          <div className="alert-view-pill">
            <Bell size={12} /> {activeAlerts.length} Pop-up Alerts →
          </div>
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

      <AdvisoryCard
        zones={dashZones}
        temp={temp}
        rainfall={precipitation}
        crop={farm.crop}
        location={farm.location}
        ready={!zonesLoading && !weatherLoading}
      />
      
      {/* Top Stats — Farmer Simplified */}
      <div className="stats-row">
        {[
          {
            label: "Today's Watering Need",
            value: weatherLoading ? '—' : wateringHours,
            unit: wateringUnit,
            icon: '💧',
            sub: weatherLoading ? 'Calculating...' : wateringSub,
            color: 'var(--blue)',
            pct: precipitation > 2 ? 15 : (temp > 35 ? 90 : 60)
          },
          {
            label: 'Crop Health Status',
            value: zonesLoading ? '—' : `${healthyCnt} / ${dashZones.length}`,
            unit: 'Plots Healthy',
            icon: '🌾',
            sub: zonesLoading
              ? 'Inspecting farm plots...'
              : problematicCnt > 0
              ? `🚨 ${problematicCnt} plot needs urgent water/check`
              : moderateCnt > 0
              ? `⚠️ ${moderateCnt} plots need monitoring`
              : '🟢 All 16 plots are green and growing well',
            color: problematicCnt > 0 ? 'var(--red)' : moderateCnt > 1 ? 'var(--yellow)' : 'var(--green-accent)',
            pct: zonesLoading ? 0 : Math.round((healthyCnt / dashZones.length) * 100)
          },
          {
            label: 'Spraying Weather',
            value: weatherLoading ? '—' : sprayCondition.status,
            unit: sprayCondition.safe ? 'Safe today' : 'Wait',
            icon: '🚜',
            sub: weatherLoading ? 'Checking conditions...' : `${sprayCondition.reason} · Wind: ${windSpeed} km/h`,
            color: sprayCondition.safe ? 'var(--teal)' : 'var(--orange)',
            pct: sprayCondition.safe ? 85 : 30
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
              <div className="map-title">🗺️ Farm Plots Health Map – {farm.farmName}</div>
              <div className="map-controls">
                <span className="badge badge-green">🌱 {healthyCnt} Healthy</span>
                <span className="badge badge-yellow">⚠️ {moderateCnt} Need Care</span>
                <span className="badge badge-red">🔴 {problematicCnt} At Risk</span>
              </div>
            </div>
            <div style={{ height: 360 }}>
              <MapView
                zones={dashZones}
                farmBoundary={boundary}
                selectedZoneId={selectedPlotModal?.zoneId ?? null}
              />
            </div>
            <div className="map-legend">
              <div className="legend-item"><span className="dot" style={{ background: '#22c55e' }}></span> 🟢 Healthy (Growing Well)</div>
              <div className="legend-item"><span className="dot" style={{ background: '#eab308' }}></span> 🟡 Needs Attention</div>
              <div className="legend-item"><span className="dot" style={{ background: '#ef4444' }}></span> 🔴 Unhealthy (Action Needed)</div>
            </div>
          </div>

          {/* Zone summary cards — Simplified for Farmers */}
          <div className="fields-row">
            {buildFieldCards(farm, dashZones.length).map((f, i) => {
              const zoneGroup = dashZones.slice(i * Math.ceil(dashZones.length / 3), (i + 1) * Math.ceil(dashZones.length / 3))
              const avgRain = zoneGroup.length && zoneGroup[0].rainfall !== null
                ? (zoneGroup.reduce((s, z) => s + (z.rainfall || 0), 0) / zoneGroup.length).toFixed(1)
                : '0'
              const blockHealth = zoneGroup.filter(z => z.health === 'Healthy').length >= zoneGroup.length / 2 ? 'active'
                : zoneGroup.filter(z => z.health === 'Problematic').length > 0 ? 'drought-risk' : 'irrigated'
              const healthyInBlock = zoneGroup.filter(z => z.health === 'Healthy').length
              const healthScore = zoneGroup.length
                ? Math.round((healthyInBlock / zoneGroup.length) * 100)
                : 0

              return (
                <div
                  key={f.id}
                  className="card card-hover field-card"
                  onClick={() => openBlockModal(f, zoneGroup)}
                  title="Click to view detailed farmer advice"
                >
                  <div className="field-card-top">
                    <div>
                      <div className="field-card-id">{f.id}</div>
                      <div className="field-card-name">{f.name}</div>
                      <div className="field-card-loc"><MapPin size={11} /> {f.location}</div>
                    </div>
                    <div className={`badge ${blockHealth === 'active' ? 'badge-green' : blockHealth === 'irrigated' ? 'badge-yellow' : 'badge-red'}`}>
                      {blockHealth === 'active' ? '🟢 Healthy' : blockHealth === 'irrigated' ? '🟡 Needs Care' : '🔴 At Risk'}
                    </div>
                  </div>
                  <div className="field-crop">{f.crop}</div>
                  
                  {/* Simplified Farmer Metrics (No NDVI!) */}
                  <div className="field-metrics">
                    <div className="field-metric">
                      <span>Condition</span>
                      <strong style={{ color: blockHealth === 'active' ? 'var(--green-accent)' : blockHealth === 'irrigated' ? 'var(--yellow)' : 'var(--red)', fontSize: 13 }}>
                        {blockHealth === 'active' ? 'Growing Well' : blockHealth === 'irrigated' ? 'Monitor Water' : 'Stressed'}
                      </strong>
                    </div>
                    <div className="field-metric">
                      <span>Water</span>
                      <strong style={{ fontSize: 13 }}>
                        {Number(avgRain) > 0 ? `${avgRain}mm Rain` : 'Drip Needed'}
                      </strong>
                    </div>
                    <div className="field-metric">
                      <span>Healthy Plots</span>
                      <strong className="text-green" style={{ fontSize: 13 }}>
                        {healthyInBlock} / {zoneGroup.length}
                      </strong>
                    </div>
                  </div>

                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{ width: `${healthScore}%` }} />
                  </div>

                  <div className="field-card-click-hint">
                    👆 Click for Farmer Advice & Checklist
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
              🌤️ Live Weather – {farm.farmName}
              {!weatherLoading && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green-accent)', fontWeight: 400 }}>● LIVE</span>}
            </div>
            {weatherLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>Fetching weather data...</div>
            ) : (
              <div className="weather-grid">
                {[
                  { icon: <Thermometer size={16} />, label: 'Temperature', val: `${temp}°C`, color: temp > 35 ? 'var(--red)' : 'var(--orange)' },
                  { icon: <Droplets size={16} />, label: 'Humidity', val: `${humidity}%`, color: 'var(--blue)' },
                  { icon: <Wind size={16} />, label: 'Wind Speed', val: `${windSpeed} km/h`, color: 'var(--teal)' },
                  { icon: '🚜', label: 'Spraying', val: sprayCondition.status, color: sprayCondition.safe ? 'var(--green-accent)' : 'var(--orange)' },
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
              Farm Updates & Tasks
              {!zonesLoading && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green-accent)', fontWeight: 400 }}>● LIVE</span>}
            </div>
            <div className="activity-list">
              {(zonesLoading || weatherLoading) ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading farm updates...</div>
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
        </div>
      </div>

      {/* Farmer Advice Modal Pop-up */}
      {selectedPlotModal && (
        <div className="farmer-modal-overlay" onClick={() => setSelectedPlotModal(null)}>
          <div className="farmer-modal" onClick={e => e.stopPropagation()}>
            <div className="farmer-modal-header">
              <div>
                <span className="farmer-modal-tag">{selectedPlotModal.tag}</span>
                <h2 className="farmer-modal-title">{selectedPlotModal.title}</h2>
              </div>
              <button
                className="farmer-modal-close"
                onClick={() => setSelectedPlotModal(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="farmer-modal-body">
              <div className={`farmer-modal-status-banner ${selectedPlotModal.healthClass}`}>
                <span className="farmer-modal-status-icon">{selectedPlotModal.healthIcon}</span>
                <div>
                  <strong>Condition: {selectedPlotModal.status}</strong>
                  <p>{selectedPlotModal.cropStatus}</p>
                </div>
              </div>

              <div className="farmer-checklist">
                <h3>🚜 Farmer Checklist & Guidance</h3>

                <div className="checklist-item">
                  <div className="checklist-icon">💧</div>
                  <div>
                    <strong>Watering Advice</strong>
                    <p>{selectedPlotModal.wateringAdvice}</p>
                  </div>
                </div>

                <div className="checklist-item">
                  <div className="checklist-icon">🌤️</div>
                  <div>
                    <strong>Spraying & Field Work</strong>
                    <p>{selectedPlotModal.sprayingAdvice}</p>
                  </div>
                </div>

                <div className="checklist-item">
                  <div className="checklist-icon">📋</div>
                  <div>
                    <strong>Recommended Actions Today</strong>
                    <ul className="checklist-steps">
                      {selectedPlotModal.actionSteps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="farmer-modal-footer">
                <button
                  className="btn btn-primary"
                  onClick={() => setSelectedPlotModal(null)}
                >
                  ✓ Understood, Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom-Right Pop-up Alert Toast */}
      {showAutoToast && activeAlerts.length > 0 && (
        <div className="popup-toast-alert">
          <div className="popup-toast-header">
            <div className="popup-toast-title">
              <span className="popup-toast-icon">{activeAlerts[0].icon}</span>
              <div>
                <strong>{activeAlerts[0].title}</strong>
                <span className="popup-toast-time">Active Now · Farm Pop-up Alert</span>
              </div>
            </div>
            <button
              className="popup-toast-close"
              onClick={() => setShowAutoToast(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="popup-toast-msg">{activeAlerts[0].message}</p>
          <div className="popup-toast-actions">
            {activeAlerts[0].onAction && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setShowAutoToast(false)
                  activeAlerts[0].onAction()
                }}
              >
                {activeAlerts[0].actionText} →
              </button>
            )}
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setShowAutoToast(false)
                setShowAlertsModal(true)
              }}
            >
              View All ({activeAlerts.length})
            </button>
          </div>
        </div>
      )}

      {/* Pop-up Alerts Center Modal */}
      {showAlertsModal && (
        <div className="farmer-modal-overlay" onClick={() => setShowAlertsModal(false)}>
          <div className="farmer-modal" onClick={e => e.stopPropagation()}>
            <div className="farmer-modal-header">
              <div>
                <span className="farmer-modal-tag">Farm Alert Center</span>
                <h2 className="farmer-modal-title">🔔 Active Farm Alerts ({activeAlerts.length})</h2>
              </div>
              <button
                className="farmer-modal-close"
                onClick={() => setShowAlertsModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="farmer-modal-body">
              <div className="alerts-modal-list">
                {activeAlerts.map(item => (
                  <div key={item.id} className={`alert-modal-card ${item.level}`}>
                    <span className="alert-modal-card-icon">{item.icon}</span>
                    <div className="alert-modal-card-content">
                      <div className="alert-modal-card-title">{item.title}</div>
                      <div className="alert-modal-card-msg">{item.message}</div>
                      {item.onAction && (
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ marginTop: 4 }}
                          onClick={() => {
                            setShowAlertsModal(false)
                            item.onAction()
                          }}
                        >
                          {item.actionText} →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="farmer-modal-footer">
                <button
                  className="btn btn-primary"
                  onClick={() => setShowAlertsModal(false)}
                >
                  ✓ Close Alerts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
