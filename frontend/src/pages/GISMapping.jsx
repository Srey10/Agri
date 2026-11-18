/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as turf from '@turf/turf'
import MapView from '../components/MapView'
import { Layers, Activity, Droplets, Leaf, Pencil } from 'lucide-react'
import { getFarmInfo, getFieldFeature, boundaryAreaHa } from '../data/farm'
import './GISMapping.css'
import { ML_API_URL } from '../data/api'

// Farm boundary fallback helper or exports if needed
export { boundaryAreaHa }
// eslint-disable-next-line react-refresh/only-export-components
export function classifyHealth(ndvi, rainfall) {
  if (rainfall === null || rainfall === undefined) {
    if (ndvi >= 0.65) return 'Healthy'
    if (ndvi >= 0.40) return 'Moderate'
    return 'Problematic'
  }
  if (ndvi >= 0.65) return 'Healthy'
  if (ndvi < 0.40 && rainfall < 1) return 'Problematic'
  return 'Moderate'
}

// eslint-disable-next-line react-refresh/only-export-components
export function healthColor(status) {
  const colors = { Healthy: '#22c55e', Moderate: '#eab308', Problematic: '#ef4444' }
  return colors[status]
}

// Split the farmer's own boundary into roughly a 4×4 grid of zones. The cell size adapts to the
// farm size, so a 1 ha plot and a 50 ha farm both produce a handful of zones (and API calls).
// NDVI and rainfall start empty and are filled from live data; soil type is not measured, so it is null.
export function buildZones(farmBoundary) {
  if (!farmBoundary?.geometry?.coordinates?.[0]?.length) return []
  const [minX, minY, maxX, maxY] = turf.bbox(farmBoundary)
  const extent = Math.max(maxX - minX, maxY - minY)
  // Slightly oversized cells and a padded origin, so rounding in squareGrid can't leave an uncovered edge strip.
  const cellSide = (extent / 4) * 1.02
  const pad = extent * 0.005
  const gridBox = [minX - pad, minY - pad, minX - pad + cellSide * 4.01, minY - pad + cellSide * 4.01]
  const grid = turf.squareGrid(gridBox, cellSide, { units: 'degrees' })
  const farmAreaM2 = turf.area(farmBoundary)

  const zones = []
  grid.features.forEach((cell) => {
    const intersection = turf.intersect(turf.featureCollection([cell, farmBoundary]))
    if (!intersection) return

    // A concave farm can cut one cell into several pieces; each piece becomes its own zone.
    const pieces = intersection.geometry.type === 'MultiPolygon'
      ? intersection.geometry.coordinates.map(c => turf.polygon(c))
      : [intersection]

    pieces.forEach((piece) => {
      const areaM2 = turf.area(piece)
      if (areaM2 < farmAreaM2 * 0.01) return // ignore slivers

      const centroidCoords = turf.centroid(piece).geometry.coordinates // [lng, lat]
      zones.push({
        id: zones.length,
        geometry: piece,
        centroid: [centroidCoords[1], centroidCoords[0]], // [lat, lng] for Leaflet
        centroidLngLat: centroidCoords, // [lng, lat] for API calls
        areaM2,
        areaHa: Math.round(areaM2 / 10000 * 100) / 100,
        ndvi: null,
        soil: null,
        rainfall: null,
        health: null,
        color: null,
      })
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

export default function GISMapping({ user, field }) {
  const farm = getFarmInfo(user, field)
  const navigate = useNavigate()
  const boundary = useMemo(() => getFieldFeature(field), [field])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedZone, setSelectedZone] = useState(null)
  const [layerZones, setLayerZones] = useState(true)
  const [layerBoundary, setLayerBoundary] = useState(true)

  useEffect(() => {
  const loadGISData = async () => {
    if (!boundary) {
      setZones([])
      setLoading(false)
      return
    }

    const partial = buildZones(boundary)
    setZones(partial)
    setLoading(true)

    if (!partial.length) {
      setLoading(false)
      return
    }

    try {
      // 1. Fetch live rainfall per zone
      const rainfallValues = await fetchRainfall(partial)

      // 2. Fetch live Sentinel-2 / calibrated NDVI for all zones (batch request first)
      let ndviValues = new Array(partial.length).fill(null)
      try {
        const batchResponse = await fetch(`${ML_API_URL}/ndvi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boundary: boundary?.geometry,
            zones: partial.map(z => ({
              id: z.id,
              geometry: z.geometry.geometry
            }))
          })
        })
        if (batchResponse.ok) {
          const batchData = await batchResponse.json()
          if (Array.isArray(batchData.zones)) {
            const mapById = {}
            batchData.zones.forEach(bz => {
              if (bz && bz.id !== undefined && bz.ndvi !== undefined && bz.ndvi !== null) {
                mapById[bz.id] = bz.ndvi
              }
            })
            ndviValues = partial.map((z, i) => mapById[z.id] ?? null)
          }
        }
      } catch (err) {
        console.warn('Batch NDVI query failed, using individual zone queries:', err)
      }

      // Fallback to single queries if any zone is still null
      if (ndviValues.some(v => v === null)) {
        const singleValues = await Promise.all(
          partial.map(async (zone, i) => {
            if (ndviValues[i] !== null) return ndviValues[i]
            try {
              const res = await fetch(`${ML_API_URL}/ndvi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  geometry: zone.geometry.geometry,
                  id: zone.id
                })
              })
              const d = await res.json()
              return d.ndvi ?? null
            } catch (e) {
              console.error(`NDVI failed for zone ${zone.id + 1}:`, e)
              return null
            }
          })
        )
        ndviValues = singleValues
      }

      // Combine Sentinel NDVI + rainfall
      const enriched = partial.map((z, i) => {
        const rainfall = rainfallValues[i]
        const ndvi = ndviValues[i] !== null && ndviValues[i] !== undefined ? Number(ndviValues[i]) : null
        const health = ndvi !== null ? classifyHealth(ndvi, rainfall) : 'Moderate'

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
      console.error('GIS data loading failed:', error)
    } finally {
      setLoading(false)
    }
  }

  loadGISData()

}, [boundary])

  const totalAreaHa = boundaryAreaHa(boundary).toFixed(2)
  const healthyCnt = zones.filter(z => z.health === 'Healthy').length
  const moderateCnt = zones.filter(z => z.health === 'Moderate').length
  const problematicCnt = zones.filter(z => z.health === 'Problematic').length

  return (
    <div className="gis-page fade-in">
      {/* Header */}
      <div className="gis-header">
        <div>
          <h1 className="dash-title">🗺️ GIS Mapping – {farm.farmName} · {farm.fieldName}</h1>
          <p className="dash-sub">{farm.location ? `${farm.location} · ` : ''}{zones.length} zones · your saved farm boundary</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="badge badge-green pulse"><span className="dot dot-green"></span> Live Data</div>
          <div className="badge badge-blue">{zones.length} Zones</div>
          <button type="button" className="btn-outline" onClick={() => navigate(`/farm-mapping?field=${field.id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Pencil size={13} /> Edit farm boundary
          </button>
          {farm.crop && <div className="badge badge-yellow">{farm.crop}</div>}
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

          {/* Field Plots & NDVI List */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-section-title" style={{ marginBottom: 10 }}>🌾 Plot NDVI Scores</div>
            {loading ? (
              <div className="gis-loading">
                <div className="gis-loading-row"></div>
                <div className="gis-loading-row"></div>
              </div>
            ) : zones.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>No mapped plots</div>
            ) : (
              <div className="field-list">
                {zones.map((z) => (
                  <div
                    key={z.id}
                    className={`field-list-item ${selectedZone?.id === z.id ? 'active' : ''}`}
                    onClick={() => setSelectedZone(z)}
                  >
                    <div className="field-list-dot" style={{ background: z.color || '#eab308' }} />
                    <div className="field-list-info">
                      <div className="field-list-id">Plot {z.id + 1}</div>
                      <div className="field-list-crop">{z.areaHa} Ha · {z.health}</div>
                    </div>
                    <div
                      className="field-list-ndvi"
                      style={{ color: z.ndvi >= 0.65 ? 'var(--green-accent)' : z.ndvi >= 0.40 ? 'var(--yellow)' : 'var(--red)' }}
                    >
                      {z.ndvi !== null && z.ndvi !== undefined ? Number(z.ndvi).toFixed(2) : '—'}
                    </div>
                  </div>
                ))}
              </div>
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
                farmBoundary={boundary}
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
                    <div className="zone-detail-sub">{farm.crop ? `${farm.crop} · ` : ''}{farm.fieldName}, {farm.farmName}{farm.location ? `, ${farm.location}` : ''}</div>
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
                      val: selectedZone.ndvi !== null && selectedZone.ndvi !== undefined ? Number(selectedZone.ndvi).toFixed(2) : '—',
                      unit: '',
                      color: selectedZone.ndvi == null ? 'var(--text-muted)' : selectedZone.ndvi >= 0.65 ? 'var(--green-accent)' : selectedZone.ndvi >= 0.40 ? 'var(--yellow)' : 'var(--red)'
                    },
                    { label: 'Area', val: selectedZone.areaHa, unit: ' Ha', color: 'var(--blue)' },
                    {
                      label: 'Rainfall',
                      val: selectedZone.rainfall !== null && selectedZone.rainfall !== undefined ? selectedZone.rainfall : '0',
                      unit: ' mm',
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
                  <div className="card-section-title">NDVI Vegetation Score ({selectedZone.ndvi !== null && selectedZone.ndvi !== undefined ? Number(selectedZone.ndvi).toFixed(2) : '—'})</div>
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{
                      width: `${Math.max(0, Math.min(100, ((selectedZone.ndvi ?? 0.5) * 100)))}%`,
                      background: selectedZone.ndvi == null ? 'var(--border)' : `linear-gradient(90deg, ${
                        selectedZone.ndvi >= 0.65 ? 'var(--green-primary)' :
                        selectedZone.ndvi >= 0.40 ? '#92400e' : '#7f1d1d'
                      }, ${
                        selectedZone.ndvi >= 0.65 ? 'var(--green-accent)' :
                        selectedZone.ndvi >= 0.40 ? 'var(--yellow)' : 'var(--red)'
                      })`
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span className="text-sm text-muted">0.0 (Bare/Dry)</span>
                    <span className="text-sm text-muted">1.0 (Dense Green)</span>
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="card-section-title"><Droplets size={12} style={{ marginRight: 4 }} /> Soil Type</div>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: 'var(--teal)' }}>
                    {selectedZone.soil || 'Not measured yet'}
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
