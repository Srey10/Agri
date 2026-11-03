import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MapPin, Loader2, Undo2, Trash2, CheckCircle, Pencil, Play, Save, Search, LogOut, AlertTriangle, Layers,
} from 'lucide-react'
import { createField, updateField } from '../data/api'
import { getFarmInfo, polygonToLatLngs, buildBoundaryGeometry, compareWithRegisteredLand } from '../data/farm'
import './FarmMapping.css'

// Satellite imagery: Esri World Imagery by default (no key; attribution required; Esri's terms
// limit heavy/commercial use). Set VITE_SATELLITE_TILE_URL to a provider with a public,
// domain-restricted key for production. Never put a private secret in a VITE_ variable.
const SATELLITE_URL = import.meta.env.VITE_SATELLITE_TILE_URL
  || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SATELLITE_ATTRIBUTION = import.meta.env.VITE_SATELLITE_ATTRIBUTION
  || 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
const STREET_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const STREET_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const TILE_ERRORS_BEFORE_FALLBACK = 8

const INDIA_CENTER = [22.5, 79]

function vertexIcon(n, active) {
  return L.divIcon({
    className: '',
    html: `<div class="fm-vertex${active ? ' fm-vertex-first' : ''}">${n}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function FlyController({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target.center, target.zoom, { duration: 1.2 })
  }, [map, target])
  return null
}

function FitController({ latLngs }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || latLngs.length < 3) return
    done.current = true
    map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], animate: false })
  }, [map, latLngs])
  return null
}

function ClickCapture({ enabled, onAdd }) {
  useMapEvents({ click: (e) => { if (enabled) onAdd([e.latlng.lat, e.latlng.lng]) } })
  return null
}

// ?new=1 adds a field, ?field=<id> edits that field. With neither, the field being viewed is edited,
// and a farmer with no fields yet (first-time onboarding) creates their first one.
export default function FarmMapping({ user, activeFieldId, onSaved, onLogout }) {
  const navigate = useNavigate()
  const [urlParams] = useSearchParams()
  const fields = user?.fields || []
  const wantsNew = urlParams.get('new') === '1' || fields.length === 0
  const requestedId = Number(urlParams.get('field')) || activeFieldId
  const target = wantsNew ? null : (fields.find(f => f.id === requestedId) || fields[0] || null)
  const farm = getFarmInfo(user, target)
  const existing = useMemo(() => polygonToLatLngs(target?.boundary), [target])
  const isEditing = !!target
  const isFirstField = fields.length === 0
  const [fieldName, setFieldName] = useState(target?.name || '')

  const [points, setPoints] = useState(existing)
  const [mode, setMode] = useState(isEditing ? 'review' : 'idle') // idle | drawing | review
  const [flyTarget, setFlyTarget] = useState(null)
  const [myLoc, setMyLoc] = useState(null) // { latlng, accuracy }
  const [locating, setLocating] = useState(false)
  const [locMessage, setLocMessage] = useState(null) // { type: 'info' | 'warn' | 'error', text }
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [baseMap, setBaseMap] = useState('satellite')
  const [mapNotice, setMapNotice] = useState('')
  const tileErrors = useRef(0)
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  const built = useMemo(() => (points.length >= 3 ? buildBoundaryGeometry(points) : null), [points])
  // The registered land size is for the whole farm, so compare it with all fields together
  const otherFieldsHa = fields.filter(f => f.id !== target?.id).reduce((sum, f) => sum + (f.areaHectares || 0), 0)
  const totalHa = built?.areaHa ? built.areaHa + otherFieldsHa : null
  const landCheck = totalHa ? compareWithRegisteredLand(totalHa, user?.profile?.landAcres) : null

  const startCenter = isEditing ? existing[0] : INDIA_CENTER
  const startZoom = isEditing ? 17 : 5

  // ---- Location -----------------------------------------------------------
  const pickMyLocation = () => {
    setProblem('')
    if (!('geolocation' in navigator)) {
      setLocMessage({ type: 'error', text: 'This browser cannot find your location. Please search for your village below, or move the map by hand.' })
      setShowSearch(true)
      return
    }
    if (!window.isSecureContext) {
      setLocMessage({ type: 'error', text: 'Location only works on a secure (https) page. Please search for your village below instead.' })
      setShowSearch(true)
      return
    }
    setLocating(true)
    setLocMessage({ type: 'info', text: 'Finding your location… please tap “Allow” if your browser asks.' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude]
        const accuracy = Math.round(pos.coords.accuracy)
        setMyLoc({ latlng, accuracy })
        setFlyTarget({ center: latlng, zoom: accuracy <= 50 ? 18 : accuracy <= 300 ? 17 : 15, nonce: Date.now() })
        setLocating(false)
        setLocMessage(accuracy > 100
          ? { type: 'warn', text: `Your location is only approximate (about ${accuracy} m). This is just a starting point: move and zoom the map to your farm, then mark its corners.` }
          : { type: 'info', text: 'Found you! The blue dot is where you are now. This is only a starting point: if your farm is somewhere else, move the map there.' })
      },
      (err) => {
        setLocating(false)
        const text = err.code === 1
          ? 'Location permission was denied. You can allow it in your browser settings, or search for your village below.'
          : err.code === 3
            ? 'Finding your location took too long. Try again, or search for your village below.'
            : 'Your phone or computer could not find a GPS position. Try again outdoors, or search for your village below.'
        setLocMessage({ type: 'error', text })
        setShowSearch(true)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const runSearch = async (e) => {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 3) { setResults({ error: 'Type at least 3 letters, e.g. your village or town.' }); return }
    setSearching(true)
    setResults(null)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('search failed')
      const data = await res.json()
      setResults(data.length ? { items: data } : { error: 'No place found. Try a nearby town, or move the map by hand.' })
    } catch {
      setResults({ error: 'Search is not working right now. You can still move and zoom the map by hand.' })
    }
    setSearching(false)
  }

  const goToPlace = (item) => {
    setFlyTarget({ center: [parseFloat(item.lat), parseFloat(item.lon)], zoom: 16, nonce: Date.now() })
    setResults(null)
  }

  // ---- Drawing ------------------------------------------------------------
  const addPoint = (p) => { setPoints(prev => [...prev, p]); setProblem('') }
  const movePoint = (i, latlng) => { setPoints(prev => prev.map((p, j) => (j === i ? latlng : p))); setProblem('') }
  const undo = () => { setPoints(prev => prev.slice(0, -1)); setProblem('') }
  const clearAll = () => {
    if (points.length > 2 && !window.confirm('Remove all the points you marked?')) return
    setPoints([]); setMode('idle'); setProblem('')
  }
  const finish = () => {
    const check = buildBoundaryGeometry(points)
    if (check.error) { setProblem(check.error); return }
    setProblem('')
    setMode('review')
  }

  const save = async () => {
    const name = fieldName.trim()
    if (!name) { setProblem('Please give this field a name, for example “North plot”.'); return }
    const check = buildBoundaryGeometry(points)
    if (check.error) { setProblem(check.error); return }
    setSaving(true)
    setProblem('')
    try {
      // Editing updates the same field by id (never creates a duplicate); otherwise a new field is created.
      const data = target
        ? await updateField(target.id, { name, boundary: check.geometry })
        : await createField({ name, boundary: check.geometry })
      onSaved(data.user, data.field.id)
      navigate('/', { replace: true })
    } catch (err) {
      setProblem(err.message || 'Could not save your farm. Please check your connection and try again.')
      setSaving(false)
    }
  }

  const onTileError = () => {
    if (baseMap !== 'satellite') return
    tileErrors.current += 1
    if (tileErrors.current >= TILE_ERRORS_BEFORE_FALLBACK) {
      setBaseMap('street')
      setMapNotice('Satellite pictures could not be loaded, so a normal map is shown instead. You can still mark your farm.')
    }
  }
  const toggleBase = () => {
    tileErrors.current = 0
    setMapNotice('')
    setBaseMap(b => (b === 'satellite' ? 'street' : 'satellite'))
  }

  const drawing = mode === 'drawing'
  const first = points[0]
  const ghost = drawing && points.length >= 3 ? [points[points.length - 1], first] : null

  const guide = mode === 'idle'
    ? { step: 'Step 1 of 3', text: 'Tap “Pick My Location” (or search for your village) so the map shows your area.' }
    : drawing
      ? { step: 'Step 2 of 3', text: 'Tap on the map at each corner of your farm. You can drag a numbered point to fix it.' }
      : { step: 'Step 3 of 3', text: 'This is your farm. Check the outline, then save it.' }

  return (
    <div className="fm-page">
      <header className="fm-header">
        <div className="fm-brand">🌾 AgriSense</div>
        <div className="fm-header-actions">
          {!isFirstField && <button type="button" className="btn-ghost" onClick={() => navigate('/')}>← Back</button>}
          <button type="button" className="btn-ghost fm-logout" onClick={onLogout}><LogOut size={15} /> Sign Out</button>
        </div>
      </header>

      <div className="fm-body">
        <aside className="fm-panel" aria-label="Farm mapping steps">
          <h1 className="fm-title">
            {isEditing
              ? `Update field: ${target.name}`
              : isFirstField
                ? `Welcome${user?.name ? `, ${user.name.split(' ')[0]}` : ''}! 🌱 Let’s mark your farm`
                : 'Add a new field'}
          </h1>
          <p className="fm-lead">
            {isEditing
              ? `Change the name or outline of this field of ${farm.farmName}, then save.`
              : isFirstField
                ? 'AgriSense needs the shape of your farm to give you crop health, weather and irrigation advice for your own land. It takes about a minute.'
                : `Name the new field and mark its corners. Your other fields of ${farm.farmName} stay as they are.`}
          </p>

          <div className="form-group">
            <label htmlFor="fm-field-name" style={{ fontWeight: 600, fontSize: 14 }}>Field name</label>
            <input
              id="fm-field-name" className="input" maxLength={100} value={fieldName}
              placeholder="e.g. North plot, River field"
              onChange={e => { setFieldName(e.target.value); setProblem('') }}
            />
          </div>

          <div className="fm-instruction">
            Mark each corner of your farm boundary on the map. The app will connect the points to create your farm.
          </div>

          <div className="fm-guide" aria-live="polite">
            <span className="fm-step">{guide.step}</span> {guide.text}
          </div>

          <button type="button" className="btn-primary fm-big-btn" onClick={pickMyLocation} disabled={locating}>
            {locating ? <><Loader2 size={18} className="spin-icon" /> Finding you…</> : <>📍 Pick My Location</>}
          </button>

          {locMessage && (
            <div className={`fm-msg fm-msg-${locMessage.type}`} role={locMessage.type === 'error' ? 'alert' : 'status'}>
              {locMessage.text}
            </div>
          )}

          <button type="button" className="fm-link" onClick={() => setShowSearch(s => !s)} aria-expanded={showSearch}>
            <Search size={14} /> {showSearch ? 'Hide search' : 'Or search for your village / town'}
          </button>
          {showSearch && (
            <div className="fm-search">
              <form onSubmit={runSearch}>
                <label htmlFor="fm-q" className="fm-sr">Village or town</label>
                <input id="fm-q" className="input" placeholder="Your village or town" value={query} onChange={e => setQuery(e.target.value)} />
                <button type="submit" className="btn-outline" disabled={searching}>
                  {searching ? <Loader2 size={14} className="spin-icon" /> : 'Search'}
                </button>
              </form>
              {results?.error && <div className="fm-msg fm-msg-warn" role="status">{results.error}</div>}
              {results?.items && (
                <ul className="fm-results">
                  {results.items.map(it => (
                    <li key={it.place_id}><button type="button" onClick={() => goToPlace(it)}>{it.display_name}</button></li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <hr className="fm-hr" />

          <div className="fm-tools">
            {mode === 'idle' && (
              <button type="button" className="btn-primary fm-big-btn" onClick={() => setMode('drawing')}>
                <Play size={18} /> Start drawing my farm
              </button>
            )}
            {drawing && (
              <>
                <div className="fm-row">
                  <button type="button" className="btn-outline" onClick={undo} disabled={!points.length}><Undo2 size={16} /> Undo last point</button>
                  <button type="button" className="btn-outline" onClick={clearAll} disabled={!points.length}><Trash2 size={16} /> Clear</button>
                </div>
                <button type="button" className="btn-primary fm-big-btn" onClick={finish} disabled={points.length < 3}>
                  <CheckCircle size={18} /> Finish boundary {points.length < 3 && `(${3 - points.length} more point${3 - points.length > 1 ? 's' : ''} needed)`}
                </button>
              </>
            )}
            {mode === 'review' && (
              <>
                <button type="button" className="btn-primary fm-big-btn" onClick={save} disabled={saving || !built?.geometry}>
                  {saving ? <><Loader2 size={18} className="spin-icon" /> Saving…</> : <><Save size={18} /> {isEditing ? 'Save changes' : 'Save field'}</>}
                </button>
                <div className="fm-row">
                  <button type="button" className="btn-outline" onClick={() => setMode('drawing')} disabled={saving}><Pencil size={16} /> Edit boundary</button>
                  <button type="button" className="btn-outline" onClick={clearAll} disabled={saving}><Trash2 size={16} /> Clear</button>
                </div>
              </>
            )}
          </div>

          {problem && <div className="fm-msg fm-msg-error" role="alert">{problem}</div>}

          {built?.areaHa && (
            <div className="fm-stats" aria-label="Farm preview">
              <div><span>Approx. area</span><strong>{built.areaHa.toFixed(2)} ha</strong><small>≈ {(built.areaHa / 0.404686).toFixed(2)} acres</small></div>
              <div><span>Boundary points</span><strong>{points.length}</strong></div>
            </div>
          )}
          {landCheck?.differs && (
            <div className="fm-msg fm-msg-warn" role="status">
              <AlertTriangle size={14} /> {fields.length > 1 || (!isEditing && fields.length > 0) ? 'Your fields together' : 'The drawn area'} ({totalHa.toFixed(2)} ha) {fields.length > 1 || (!isEditing && fields.length > 0) ? 'are' : 'is'} quite different from the land size you gave when registering
              ({user.profile.landAcres} acres ≈ {landCheck.registeredHa.toFixed(2)} ha). Please check that you marked the right corners.
              Your registered land size is not changed.
            </div>
          )}
        </aside>

        <section className="fm-map-wrap" aria-label="Farm map">
          <MapContainer center={startCenter} zoom={startZoom} maxZoom={19} className="fm-map" zoomControl scrollWheelZoom>
            {baseMap === 'satellite'
              ? <TileLayer key="sat" url={SATELLITE_URL} attribution={SATELLITE_ATTRIBUTION} maxZoom={19} eventHandlers={{ tileerror: onTileError }} />
              : <TileLayer key="osm" url={STREET_URL} attribution={STREET_ATTRIBUTION} maxZoom={19} />}

            <FlyController target={flyTarget} />
            <FitController latLngs={existing} />
            <ClickCapture enabled={drawing} onAdd={addPoint} />

            {myLoc && (
              <>
                <Circle center={myLoc.latlng} radius={myLoc.accuracy} pathOptions={{ color: '#3b82f6', weight: 1, fillOpacity: 0.12 }} interactive={false} />
                <CircleMarker center={myLoc.latlng} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 }} interactive={false} />
              </>
            )}

            {points.length >= 3 && (
              <Polygon
                positions={points}
                interactive={false}
                pathOptions={{ color: '#facc15', weight: 3, fillColor: '#facc15', fillOpacity: mode === 'review' ? 0.28 : 0.15 }}
              />
            )}
            {points.length >= 2 && points.length < 3 && <Polyline positions={points} interactive={false} pathOptions={{ color: '#facc15', weight: 3 }} />}
            {ghost && <Polyline positions={ghost} interactive={false} pathOptions={{ color: '#facc15', weight: 2, dashArray: '6,8' }} />}

            {points.map((p, i) => (
              <Marker
                key={i}
                position={p}
                icon={vertexIcon(i + 1, i === 0)}
                draggable={drawing}
                keyboard={false}
                eventHandlers={{ dragend: (e) => movePoint(i, [e.target.getLatLng().lat, e.target.getLatLng().lng]) }}
              />
            ))}
          </MapContainer>

          <button type="button" className="fm-base-toggle" onClick={toggleBase}>
            <Layers size={14} /> {baseMap === 'satellite' ? 'Show normal map' : 'Show satellite'}
          </button>
          {mapNotice && <div className="fm-map-notice" role="status">{mapNotice}</div>}
          {drawing && (
            <div className="fm-map-hint" role="status">
              {points.length === 0 ? 'Tap the first corner of your farm' : `${points.length} point${points.length > 1 ? 's' : ''} marked — tap the next corner`}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
