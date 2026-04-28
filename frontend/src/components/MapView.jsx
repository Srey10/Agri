import { useEffect, useRef } from 'react'
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
    map.fitBounds(bounds, { padding: [20, 20] })
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
    : [19.4308, 74.9010]

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
            eventHandlers={{ click: () => onZoneClick && onZoneClick(zone) }}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 180, fontSize: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, borderBottom: '1px solid #eee', paddingBottom: 6 }}>
                  Zone {zone.id + 1}
                </div>
                <div style={{ marginBottom: 4 }}>
                  Status:{' '}
                  <strong style={{ color: zone.color || '#888' }}>
                    {zone.health || '—'}
                  </strong>
                </div>
                <div style={{ marginBottom: 4 }}>NDVI: <strong>{zone.ndvi?.toFixed(2) ?? '—'}</strong></div>
                <div style={{ marginBottom: 4 }}>Soil: <strong>{zone.soil ?? '—'}</strong></div>
                <div style={{ marginBottom: 4 }}>
                  Rainfall: <strong>{zone.rainfall !== null && zone.rainfall !== undefined ? `${zone.rainfall} mm` : 'N/A'}</strong>
                </div>
                <div>Area: <strong>{zone.areaHa ?? '—'} Ha</strong></div>
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
