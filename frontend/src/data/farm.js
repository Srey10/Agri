import * as turf from '@turf/turf'

// Display helpers for the logged-in farmer. Everything comes from user.profile,
// which the backend loads from the farmer_profile table.

// `field` is the currently selected field from user.fields (or null).
export function getFarmInfo(user, field = null) {
  const p = user?.profile
  const location = [p?.district, p?.state].filter(Boolean).join(', ')
  return {
    hasProfile: !!p,
    farmerName: user?.name || '',
    // The farm name the farmer entered; derived from their own name only when they left it blank.
    farmName: p?.farmName || (user?.name ? `${user.name}'s Farm` : 'Your farm'),
    location,
    fieldId: p?.fieldId || '',
    crop: p?.primaryCrop || '',
    fieldName: field?.name || '',
    fieldAreaHa: field?.areaHectares ?? null,
  }
}

// The selected field's boundary as a GeoJSON Feature (what turf and MapView expect), or null.
export function getFieldFeature(field) {
  return field?.boundary ? { type: 'Feature', properties: { name: field.name }, geometry: field.boundary } : null
}

// Which field is selected: the remembered one if it still exists, otherwise the first.
const activeKey = (userId) => `agrisense_active_field_${userId}`

export function pickActiveFieldId(user) {
  const fields = user?.fields || []
  if (!fields.length) return null
  const saved = Number(localStorage.getItem(activeKey(user.id)))
  return fields.some(f => f.id === saved) ? saved : fields[0].id
}

export function rememberActiveFieldId(userId, fieldId) {
  localStorage.setItem(activeKey(userId), String(fieldId))
}

// Centre of the farm as [lat, lng] (Leaflet order); used for weather and satellite lookups.
export function getBoundaryCenter(feature) {
  const [lng, lat] = turf.centroid(feature).geometry.coordinates
  return [lat, lng]
}

export function boundaryAreaHa(feature) {
  return turf.area(feature) / 10000
}

// Leaflet [lat, lng] ring (without the repeated closing point) from a GeoJSON Polygon
export function polygonToLatLngs(geometry) {
  const ring = geometry?.coordinates?.[0] || []
  return ring.slice(0, -1).map(([lng, lat]) => [lat, lng])
}

// Build a GeoJSON Polygon from Leaflet [lat, lng] points the farmer marked.
// Converts to GeoJSON [lng, lat], drops repeated points, closes the ring, and
// rejects shapes the backend would reject. Returns { geometry, areaHa } or { error }.
export function buildBoundaryGeometry(latLngs) {
  const ring = []
  for (const [lat, lng] of latLngs) {
    const pt = [Number(lng.toFixed(7)), Number(lat.toFixed(7))] // GeoJSON order: [lng, lat]
    const last = ring[ring.length - 1]
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) ring.push(pt)
  }
  if (new Set(ring.map(p => p.join(','))).size < 3) {
    return { error: 'Mark at least 3 different corners of your farm.' }
  }
  const geometry = { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
  const feature = { type: 'Feature', properties: {}, geometry }
  if (turf.kinks(feature).features.length > 0) {
    return { error: 'The boundary lines cross each other. Drag a point or use Undo so the outline does not cross itself.' }
  }
  const areaHa = turf.area(feature) / 10000
  if (areaHa * 10000 < 10) return { error: 'The boundary is too small or its points are in a straight line.' }
  if (areaHa > 50000) return { error: 'The boundary is unrealistically large for a farm. Please check the points.' }
  return { geometry, areaHa }
}

const ACRES_TO_HA = 0.404686

// Compare the drawn area with the land size entered at registration (never overwrites it).
export function compareWithRegisteredLand(areaHa, landAcres) {
  if (!landAcres || landAcres <= 0) return null
  const registeredHa = landAcres * ACRES_TO_HA
  const ratio = areaHa / registeredHa
  return { registeredHa, ratio, differs: ratio < 0.6 || ratio > 1.6 }
}
