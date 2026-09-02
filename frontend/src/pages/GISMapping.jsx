/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from 'react'
import * as turf from '@turf/turf'
import MapView from '../components/MapView'
import { Layers, Activity, Droplets, Leaf } from 'lucide-react'
import './GISMapping.css'

// Farm boundary: Mote Patil Sugarcane Farms, Maharashtra
// Traced from satellite imagery at 19.430895, 74.900874
// The farm has a diagonal NW road boundary and is ~8-10 hectares
export const FARM_BOUNDARY = {
  type: 'Feature',
  properties: { name: 'Mote Patil Sugarcane Farms' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [74.8985, 19.4330],   // NW corner (along diagonal road)
      [74.9010, 19.4345],   // North tip
      [74.9045, 19.4340],   // NE corner
      [74.9055, 19.4315],   // East
      [74.9050, 19.4285],   // SE corner
      [74.9020, 19.4270],   // South
      [74.8990, 19.4275],   // SW corner
      [74.8975, 19.4300],   // West
      [74.8985, 19.4330],   // close ring
    ]]
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export const NDVI_VALUES = [
  0.72, 0.45, 0.31, 0.68,
  0.55, 0.82, 0.38, 0.61,
  0.77, 0.42, 0.30, 0.88,
  0.50, 0.65, 0.35, 0.90,
]

// eslint-disable-next-line react-refresh/only-export-components
export const SOIL_VALUES = [
  'Clay',  'Loam',  'Sandy', 'Clay',
  'Loam',  'Sandy', 'Clay',  'Loam',
  'Sandy', 'Clay',  'Loam',  'Sandy',
  'Clay',  'Loam',  'Sandy', 'Clay',
]

// eslint-disable-next-line react-refresh/only-export-components
export function classifyHealth(ndvi, rainfall) {
  if (rainfall === null || rainfall === undefined) {
    if (ndvi >= 0.65) return 'Healthy'
    if (ndvi >= 0.40) return 'Moderate'
    return 'Problematic'
  }
  if (ndvi >= 0.65 && rainfall >= 3) return 'Healthy'
  if (ndvi < 0.40 && rainfall < 1) return 'Problematic'
  return 'Moderate'
}

// eslint-disable-next-line react-refresh/only-export-components
export function healthColor(status) {
  const colors = { Healthy: '#22c55e', Moderate: '#eab308', Problematic: '#ef4444' }
  return colors[status]
}

export function buildZones(farmBoundary) {
  const bbox = turf.bbox(farmBoundary)
  // cellSide ~0.002 degrees produces a 4×4 grid over the actual ~0.007° farm bbox
  const grid = turf.squareGrid(bbox, 0.002, { units: 'degrees' })

  const zones = []
  grid.features.forEach((cell, idx) => {
    const intersection = turf.intersect(turf.featureCollection([cell, farmBoundary]))
    if (!intersection) return

    const zoneCentroid = turf.centroid(intersection)
    const areaM2 = turf.area(intersection)
    const areaHa = Math.round(areaM2 / 10000 * 100) / 100
    const centroidCoords = zoneCentroid.geometry.coordinates // [lng, lat]

    const isContained = turf.booleanContains(farmBoundary, zoneCentroid)
    if (!isContained) {
      console.warn(`Zone ${idx} centroid is outside farm boundary`)
    }

    zones.push({
      id: zones.length,
      geometry: intersection,
      centroid: [centroidCoords[1], centroidCoords[0]], // [lat, lng] for Leaflet
      centroidLngLat: centroidCoords, // [lng, lat] for API calls
      areaM2,
      areaHa,
      ndvi: NDVI_VALUES[zones.length] ?? 0.5,
      soil: SOIL_VALUES[zones.length] ?? 'Loam',
      rainfall: null,
      health: null,
      color: null,
    })
  })

  return zones
}

// eslint-disable-next-line react-refresh/only-export-components
export async function fetchRainfall(zones) {
  const results = await Promise.all(
    zones.map(z =>
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${z.centroid[0]}&longitude=${z.centroid[1]}&current=precipitation&forecast_days=1`
      )
        .then(r => r.json())
        .then(d => d.current.precipitation)
        .catch(() => null)
    )
  )
  return results
}

export default function GISMapping() {
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedZone, setSelectedZone] = useState(null)
  const [layerZones, setLayerZones] = useState(true)
  const [layerBoundary, setLayerBoundary] = useState(true)

  useEffect(() => {
  const loadGISData = async () => {
    const partial = buildZones(FARM_BOUNDARY)

    setZones(partial)
    setLoading(true)

    try {
      // Get rainfall
      const rainfallValues = await fetchRainfall(partial)

      // Get real Sentinel-2 NDVI for every zone
      const ndviValues = await Promise.all(
        partial.map(async (zone) => {
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
              `Zone ${zone.id + 1} Sentinel NDVI:`,
              data
            )

            return data.ndvi
          } catch (error) {
            console.error(
              `NDVI failed for zone ${zone.id + 1}:`,
              error
            )

            return null
          }
        })
      )

      // Combine Sentinel NDVI + rainfall
      const enriched = partial.map((z, i) => {

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

      setZones(enriched)

    } catch (error) {

      console.error(
        'GIS data loading failed:',
        error
      )

    } finally {

      setLoading(false)

    }
  }

  loadGISData()

}, [])

  const totalAreaHa = zones.reduce((sum, z) => sum + (z.areaHa || 0), 0).toFixed(2)
  const healthyCnt = zones.filter(z => z.health === 'Healthy').length
  const moderateCnt = zones.filter(z => z.health === 'Moderate').length
  const problematicCnt = zones.filter(z => z.health === 'Problematic').length

  return (
    <div className="gis-page fade-in">
      {/* Header */}
      <div className="gis-header">
        <div>
          <h1 className="dash-title">🗺️ GIS Mapping – Mote Patil Sugarcane Farms</h1>
          <p className="dash-sub">Mote Patil Farm House Rd, Maharashtra · 4×4 zone grid</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="badge badge-green pulse"><span className="dot dot-green"></span> Live Data</div>
          <div className="badge badge-blue">{zones.length} Zones</div>
          <div className="badge badge-yellow">Sugarcane</div>
        </div>
      </div>

      <div className="gis-main">
        {/* Left Sidebar */}
        <div className="gis-sidebar">
          {/* Layer Info */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-section-title" style={{ marginBottom: 12 }}><Layers size={13} /> Map Layers</div>
            <div className="layer-option active">
              <div className="layer-dot" style={{ background: 'var(--green-accent)' }}></div>
              Satellite (Esri)
            </div>
            <div
              className={`layer-option ${layerZones ? 'active' : ''}`}
              onClick={() => setLayerZones(v => !v)}
              style={{ cursor: 'pointer' }}
            >
              <div className="layer-dot" style={{ background: layerZones ? '#eab308' : 'var(--border)' }}></div>
              Zone Health Grid
            </div>
            <div
              className={`layer-option ${layerBoundary ? 'active' : ''}`}
              onClick={() => setLayerBoundary(v => !v)}
              style={{ cursor: 'pointer' }}
            >
              <div className="layer-dot" style={{ background: layerBoundary ? '#ffffff' : 'var(--border)' }}></div>
              Farm Boundary
            </div>
          </div>

          {/* Summary Panel */}
          <div className="card">
            <div className="card-section-title" style={{ marginBottom: 12 }}><Activity size={13} /> Zone Summary</div>

            {loading ? (
              <div className="gis-loading">
                <div className="gis-loading-row"></div>
                <div className="gis-loading-row"></div>
                <div className="gis-loading-row"></div>
              </div>
            ) : (
              <>
                <div className="gis-summary-row">
                  <span><span style={{ color: '#22c55e', marginRight: 6 }}>●</span>Healthy</span>
                  <span className="badge badge-green" style={{ fontSize: 11 }}>{healthyCnt}</span>
                </div>
                <div className="gis-summary-row">
                  <span><span style={{ color: '#eab308', marginRight: 6 }}>●</span>Moderate</span>
                  <span className="badge badge-yellow" style={{ fontSize: 11 }}>{moderateCnt}</span>
                </div>
                <div className="gis-summary-row">
                  <span><span style={{ color: '#ef4444', marginRight: 6 }}>●</span>Problematic</span>
                  <span className="badge badge-red" style={{ fontSize: 11 }}>{problematicCnt}</span>
                </div>
                <hr className="divider" />
                <div className="gis-summary-row">
                  <span className="text-muted text-sm">Total Zones</span>
                  <span className="text-sm">{zones.length}</span>
                </div>
                <div className="gis-summary-row">
                  <span className="text-muted text-sm">Total Area</span>
                  <span className="text-sm">{totalAreaHa} Ha</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Map Column */}
        <div className="gis-map-col">
          <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="gis-map-toolbar">
              <div className="gis-map-title" style={{ display: 'flex', alignItems: 'center' }}>
                <Leaf size={13} style={{ marginRight: 6 }} />
                Active Layer: <span className="text-green" style={{ marginLeft: 4 }}>Zone Health (NDVI + Rainfall)</span>
              </div>
              <div className="gis-map-actions">
                <div className="badge badge-blue" style={{ fontSize: 10 }}>📡 Sentinel-2A</div>
                <div className="badge badge-green" style={{ fontSize: 10 }}>10m/px</div>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 480 }}>
              <MapView
                zones={zones}
                farmBoundary={FARM_BOUNDARY}
                onZoneClick={z => setSelectedZone(z)}
                selectedZoneId={selectedZone?.id ?? null}
                showZones={layerZones}
                showBoundary={layerBoundary}
              />
            </div>
          </div>
        </div>

        {/* Right Panel — Zone Details */}
        <div className="gis-detail">
          {selectedZone ? (
            <>
              <div className="card">
                <div className="zone-detail-header">
                  <div>
                    <div className="zone-detail-id">Zone {selectedZone.id + 1}</div>
                    <div className="zone-detail-sub">Sugarcane · Mote Patil Farms, Maharashtra</div>
                  </div>
                  <div className={`badge ${selectedZone.health === 'Healthy' ? 'badge-green' : selectedZone.health === 'Moderate' ? 'badge-yellow' : 'badge-red'}`}>
                    {selectedZone.health}
                  </div>
                </div>

                <hr className="divider" />

                <div className="field-metrics-grid">
                  {[
                    {
                      label: 'NDVI',
                      val: selectedZone.ndvi?.toFixed(2),
                      unit: '',
                      color: selectedZone.ndvi >= 0.65 ? 'var(--green-accent)' : selectedZone.ndvi >= 0.40 ? 'var(--yellow)' : 'var(--red)'
                    },
                    { label: 'Area', val: selectedZone.areaHa, unit: ' Ha', color: 'var(--blue)' },
                    {
                      label: 'Rainfall',
                      val: selectedZone.rainfall !== null && selectedZone.rainfall !== undefined ? selectedZone.rainfall : 'N/A',
                      unit: selectedZone.rainfall !== null && selectedZone.rainfall !== undefined ? ' mm' : '',
                      color: 'var(--teal)'
                    },
                  ].map(m => (
                    <div key={m.label} className="field-metric-box">
                      <div className="field-metric-val" style={{ color: m.color }}>{m.val}{m.unit}</div>
                      <div className="field-metric-label">{m.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="card-section-title">NDVI Health</div>
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{
                      width: `${(selectedZone.ndvi || 0) * 100}%`,
                      background: `linear-gradient(90deg, ${
                        selectedZone.ndvi >= 0.65 ? 'var(--green-primary)' :
                        selectedZone.ndvi >= 0.40 ? '#92400e' : '#7f1d1d'
                      }, ${
                        selectedZone.ndvi >= 0.65 ? 'var(--green-accent)' :
                        selectedZone.ndvi >= 0.40 ? 'var(--yellow)' : 'var(--red)'
                      })`
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span className="text-sm text-muted">0</span>
                    <span className="text-sm text-muted">1.0</span>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="card-section-title"><Droplets size={12} style={{ marginRight: 4 }} /> Soil Type</div>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: 'var(--teal)' }}>
                    {selectedZone.soil}
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-section-title">📡 Satellite Metadata</div>
                <div className="sat-data">
                  <div className="sat-row"><span>Satellite</span><span>Sentinel-2A</span></div>
                  <div className="sat-row"><span>Resolution</span><span>10m/pixel</span></div>
                  <div className="sat-row"><span>Coordinates</span><span>{selectedZone.centroid?.[0]?.toFixed(4)}, {selectedZone.centroid?.[1]?.toFixed(4)}</span></div>
                  <div className="sat-row"><span>Area</span><span>{selectedZone.areaHa} Ha</span></div>
                  <div className="sat-row"><span>Zone ID</span><span>Z-{String(selectedZone.id + 1).padStart(2, '0')}</span></div>
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🗺️</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>No Zone Selected</div>
              <div style={{ fontSize: 12 }}>Click a colored zone on the map to view its health data</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
