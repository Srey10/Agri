import { MapContainer, TileLayer, Marker, Popup, Polygon, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icon issue with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const farmMarkers = [
  { lat: 30.9010, lng: 75.8573, label: 'FU-04-B: Wheat Field (गेहूं)', type: 'Wheat', status: 'active', color: '#22c55e' },
  { lat: 30.9200, lng: 75.8700, label: 'FU-05-C: Paddy Zone (धान)', type: 'Paddy', status: 'irrigated', color: '#3b82f6' },
  { lat: 30.8850, lng: 75.8400, label: 'FU-06-A: Sugarcane (गन्ना)', type: 'Sugarcane', status: 'drought', color: '#f97316' },
  { lat: 30.9100, lng: 75.8900, label: 'FU-07-D: Mustard (सरसों)', type: 'Mustard', status: 'active', color: '#eab308' },
  { lat: 30.8700, lng: 75.8600, label: 'FU-08-E: Cotton (कपास)', type: 'Cotton', status: 'active', color: '#22c55e' },
  { lat: 30.9300, lng: 75.8300, label: 'Storage Hub – Ludhiana', type: 'Hub', status: 'hub', color: '#a855f7' },
]

const fieldPolygon = [
  [30.9050, 75.8530], [30.9100, 75.8620], [30.9080, 75.8680], [30.9020, 75.8640], [30.9000, 75.8560]
]

export default function MapView({ height = 360 }) {
  return (
    <MapContainer
      center={[30.9010, 75.8573]}
      zoom={12}
      style={{ height: height + 'px', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© OpenStreetMap contributors'
        opacity={0.9}
      />

      {farmMarkers.map((m, i) => (
        <CircleMarker
          key={i}
          center={[m.lat, m.lng]}
          radius={10}
          pathOptions={{ color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 1 }}
        >
          <Popup>
            <div style={{ fontFamily: 'Inter,sans-serif', minWidth: 160 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, borderBottom: '1px solid #eee', paddingBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: '#555' }}>Type: {m.type}</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Status: <span style={{ color: m.color, fontWeight: 700 }}>{m.status}</span></div>
              <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>📍 {m.lat.toFixed(4)}, {m.lng.toFixed(4)}</div>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      <Polygon
        positions={fieldPolygon}
        pathOptions={{ color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.15, dashArray: '8,4' }}
      >
        <Popup>
          <div style={{ fontFamily: 'Inter', fontSize: 12 }}>
            <strong>FU-04-B Active Zone</strong><br />
            Area: ~42 Hectares<br />
            Crop: Wheat (गेहूं)
          </div>
        </Popup>
      </Polygon>
    </MapContainer>
  )
}
