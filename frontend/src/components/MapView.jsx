import { useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// FarmBoundsEffect: fits the map viewport to the farm boundary on mount
function FarmBoundsEffect({ farmBoundary }) {
  const map = useMap()
  useEffect(() => {
    if (!farmBoundary) return
    const coords = farmBoundary.geometry.coordinates[0]
    // coords are [lng, lat] in GeoJSON — Leaflet needs [lat, lng]
    const latLngs = coords.map(([lng, lat]) => [lat, lng])
    const bounds = L.latLngBounds(latLngs)
    map.fitBounds(bounds, { padding: [20, 20], animate: false }) // no animation: the map may unmount mid-transition
  }, [map, farmBoundary])
  return null
}

// LegendControl: adds a Leaflet custom control with health status color swatches
function LegendControl() {
  const map = useMap()
  useEffect(() => {
    const legend = L.control({ position: 'bottomright' })
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'gis-legend')
      div.innerHTML = `
        <div class="gis-legend-title">Zone Health</div>
        <div class="gis-legend-item"><span class="gis-legend-swatch" style="background:#22c55e"></span>Healthy</div>
        <div class="gis-legend-item"><span class="gis-legend-swatch" style="background:#eab308"></span>Moderate</div>
        <div class="gis-legend-item"><span class="gis-legend-swatch" style="background:#ef4444"></span>Problematic</div>
      `
      return div
    }
    legend.addTo(map)
    return () => legend.remove()
  }, [map])
  return null
}

// Convert GeoJSON polygon coordinates [lng,lat] to Leaflet [lat,lng] positions
function geoJsonToLeaflet(feature) {
  if (!feature?.geometry?.coordinates) return []
  const coords = feature.geometry.coordinates[0]
  return coords.map(([lng, lat]) => [lat, lng])
}

export default function MapView({ zones = [], farmBoundary, onZoneClick, selectedZoneId, showZones = true, showBoundary = true }) {
  const center = farmBoundary
    ? (() => {
        const coords = farmBoundary.geometry.coordinates[0]
        const lats = coords.map(c => c[1])
        const lngs = coords.map(c => c[0])
        return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2]
      })()
    : [22.5, 79] // India; farmBoundary is always set for mapped farmers

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: '100%', width: '100%', minHeight: 480 }}
      zoomControl={true}
    >
      {/* Satellite tile layer — Esri World Imagery */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
        maxZoom={19}
      />

      {/* Farm boundary outline */}
      {farmBoundary && showBoundary && (
        <Polygon
          positions={geoJsonToLeaflet(farmBoundary)}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: '#ffffff',
            fillOpacity: 0.05,
            dashArray: '6,4',
          }}
        />
      )}

      {/* Zone polygons — color-coded by health status */}
      {showZones && zones.map(zone => {
        if (!zone.geometry) return null
        const positions = geoJsonToLeaflet(zone.geometry)
        const isSelected = zone.id === selectedZoneId
        return (
          <Polygon
            key={zone.id}
            positions={positions}
            pathOptions={{
              color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.4)',
              weight: isSelected ? 3 : 1,
              fillColor: zone.color || '#888888',
              fillOpacity: 0.55,
            }}
            eventHandlers={onZoneClick ? { click: () => onZoneClick(zone) } : undefined}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 210, fontSize: 13, color: '#1e293b' }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🌾 Plot {zone.id + 1}</span>
                  <span style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontWeight: 700,
                    background: zone.health === 'Healthy' ? '#dcfce7' : zone.health === 'Moderate' ? '#fef9c3' : '#fee2e2',
                    color: zone.health === 'Healthy' ? '#15803d' : zone.health === 'Moderate' ? '#854d0e' : '#b91c1c'
                  }}>
                    {zone.health === 'Healthy' ? '🟢 Healthy' : zone.health === 'Moderate' ? '🟡 Needs Care' : '🔴 Unhealthy'}
                  </span>
                </div>
                <div style={{ marginBottom: 6, fontSize: 12, lineHeight: 1.4 }}>
                  <strong>Advice: </strong>
                  {zone.health === 'Healthy'
                    ? 'Crops are thriving. Continue regular watering.'
                    : zone.health === 'Moderate'
                    ? 'Mild moisture stress. Run drip irrigation today.'
                    : 'High stress detected! Inspect leaves & irrigate immediately.'}
                </div>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#64748b' }}>
                  Rain Today: <strong style={{ color: '#0f172a' }}>{zone.rainfall !== null && zone.rainfall !== undefined ? (zone.rainfall > 0 ? `${zone.rainfall} mm` : '0 mm (Dry)') : '0 mm'}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Plot Size: <strong style={{ color: '#0f172a' }}>{zone.areaHa ?? '—'} Hectares</strong>
                </div>
              </div>
            </Popup>
          </Polygon>
        )
      })}

      {/* Fit map to farm boundary on mount */}
      {farmBoundary && <FarmBoundsEffect farmBoundary={farmBoundary} />}

      {/* Legend */}
      <LegendControl />
    </MapContainer>
  )
}
