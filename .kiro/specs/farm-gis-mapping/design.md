# Design Document: Farm GIS Mapping

## Overview

This feature replaces the existing pan-India multi-field GIS view with a farm-level spatial analysis system focused on a single fixed sugarcane farm in Maharashtra, India. The system uses Turf.js to divide the farm into 16 spatial zones via a 4×4 square grid, enriches each zone with live rainfall data from the Open-Meteo API plus static NDVI and soil type values, classifies each zone by health status, and renders the result as an interactive color-coded Leaflet map with popups, a summary panel, and a legend — all within the existing dark-themed React + Leaflet application.

### Key Design Goals

- **Farm-level focus**: Replace the pan-India scatter-plot view with a single-farm zone grid that gives agronomic spatial insight.
- **Live data enrichment**: Fetch real precipitation data per zone centroid from Open-Meteo at page mount.
- **Deterministic static data**: NDVI and soil type are assigned by zone index so the UI is predictable and testable without a backend.
- **Spatial correctness**: All geometry operations (grid generation, clipping, centroid, area, containment) are delegated to `@turf/turf` — no hand-rolled geometry math.
- **Style consistency**: All new UI elements reuse existing CSS variables, card classes, and badge classes from `src/index.css`.

---

## Architecture

The feature is split across two React components and one CSS file, with no new backend or state management library required.

```
GISMapping.jsx  (page-level orchestrator)
│
├── State: zones[], loading, selectedZone
├── Effect (mount): buildZones() → fetchRainfall() → classifyZones()
│
└── renders:
    ├── Header (farm name + live badge)
    ├── Left Sidebar
    │   ├── Layer info card
    │   └── Summary Panel (healthy/moderate/problematic counts + total area)
    ├── MapView.jsx  (Leaflet map encapsulation)
    │   ├── Satellite TileLayer (Esri World Imagery)
    │   ├── Farm boundary GeoJSON layer
    │   ├── Zone GeoJSON layers (color-coded, clickable)
    │   ├── Legend (Leaflet custom control, bottom-right)
    │   └── FitBounds effect (useMap hook)
    └── Right Panel (selected zone details)
```

### Data Flow

```
mount
  │
  ▼
buildZones()
  turf.squareGrid → turf.intersect (clip to boundary) → filter nulls
  turf.centroid + turf.area + turf.booleanContains per zone
  assign static NDVI + soil by index
  │
  ▼
fetchRainfall()  [Promise.all over zone centroids]
  Open-Meteo API → current.precipitation per zone
  null on failure
  │
  ▼
classifyZones()
  health = f(ndvi, rainfall)
  color = healthColor[health]
  │
  ▼
setState({ zones })  →  re-render MapView + Summary Panel
```

---

## Components and Interfaces

### GISMapping.jsx

**Responsibilities**: Zone pipeline orchestration, rainfall fetching, state management, page layout.

**Props**: None (page-level route component).

**State**:

| Field | Type | Description |
|---|---|---|
| `zones` | `Zone[]` | Array of enriched zone objects (see Data Models) |
| `loading` | `boolean` | True while rainfall fetch is in progress |
| `selectedZone` | `Zone \| null` | Zone currently selected in the right panel |

**Key functions**:

- `buildZones(farmBoundary)` — Runs the Turf pipeline synchronously on mount. Returns an array of partial `Zone` objects (geometry, centroid, area, NDVI, soil) before rainfall is available.
- `fetchRainfall(zones)` — Calls `Promise.all` over all zone centroids, returns an array of precipitation values (number or null).
- `classifyHealth(ndvi, rainfall)` — Pure function implementing the health classification rules (see Data Models). Returns `'Healthy' | 'Moderate' | 'Problematic'`.
- `healthColor(status)` — Maps health status to hex color string.

**Lifecycle**:

```jsx
useEffect(() => {
  const partial = buildZones(FARM_BOUNDARY)
  setZones(partial)
  setLoading(true)
  fetchRainfall(partial).then(rainfallValues => {
    const enriched = partial.map((z, i) => ({
      ...z,
      rainfall: rainfallValues[i],
      health: classifyHealth(z.ndvi, rainfallValues[i]),
      color: healthColor(classifyHealth(z.ndvi, rainfallValues[i])),
    }))
    setZones(enriched)
    setLoading(false)
  })
}, [])
```

---

### MapView.jsx

**Responsibilities**: Leaflet map rendering — satellite tiles, farm boundary, zone polygons, legend, fitBounds.

**Props**:

| Prop | Type | Required | Description |
|---|---|---|---|
| `zones` | `Zone[]` | Yes | Array of enriched zone objects to render as polygons |
| `farmBoundary` | `GeoJSON.Feature<Polygon>` | Yes | Farm boundary polygon for outline rendering and fitBounds |
| `onZoneClick` | `(zone: Zone) => void` | Yes | Callback when a zone polygon is clicked |
| `selectedZoneId` | `number \| null` | No | Index of currently selected zone (for highlight styling) |

**Internal components**:

- `<FarmBoundsEffect />` — A child component that calls `useMap().fitBounds(bbox)` on mount. Must be a child of `<MapContainer>` to access the Leaflet map instance.
- `<LegendControl />` — A component that uses `useMap()` to add a Leaflet custom control (`L.control`) to the bottom-right corner of the map. Renders the three health status swatches.

**Tile layer**: Esri World Imagery
```
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```
Attribution: `Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community`

---

## Data Models

### Farm Boundary

The farm boundary is a hardcoded GeoJSON `Feature<Polygon>` representing a realistic ~40–50 hectare sugarcane farm centered on (19.430895890702025, 74.90087436910626) in Maharashtra. The polygon is defined as a closed ring of coordinates in `[longitude, latitude]` order (GeoJSON standard).

```js
// Approximate bounding box: ~0.025° × 0.025° ≈ 2.8 km × 2.8 km
// Polygon area ≈ 45 hectares
const FARM_BOUNDARY = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [74.8875, 19.4195],
      [74.9145, 19.4195],
      [74.9145, 19.4425],
      [74.8875, 19.4425],
      [74.8875, 19.4195],   // closed ring
    ]]
  }
}
```

> **Design decision**: A simple rectangular polygon is used for the farm boundary. This ensures the 4×4 grid produces exactly 16 non-null intersections (no edge cells are clipped to zero area), making the zone count deterministic. A more irregular polygon could be used in a future iteration with real cadastral data.

### Zone Object

Each zone is built incrementally through the pipeline:

```ts
interface Zone {
  id: number                    // 0-based index from grid generation
  geometry: GeoJSON.Feature     // clipped polygon from turf.intersect
  centroid: [number, number]    // [lat, lng] from turf.centroid
  areaM2: number                // area in m² from turf.area
  areaHa: number                // areaM2 / 10000, rounded to 2dp
  ndvi: number                  // static value from NDVI_VALUES[id]
  soil: 'Clay' | 'Loam' | 'Sandy'  // static value from SOIL_VALUES[id]
  rainfall: number | null       // mm from Open-Meteo, null on failure
  health: 'Healthy' | 'Moderate' | 'Problematic'
  color: '#22c55e' | '#eab308' | '#ef4444'
}
```

### Static Data Arrays (16 entries, deterministic by index)

```js
const NDVI_VALUES = [
  0.72, 0.45, 0.31, 0.68,
  0.55, 0.82, 0.38, 0.61,
  0.77, 0.42, 0.30, 0.88,
  0.50, 0.65, 0.35, 0.90,
]

const SOIL_VALUES = [
  'Clay',  'Loam',  'Sandy', 'Clay',
  'Loam',  'Sandy', 'Clay',  'Loam',
  'Sandy', 'Clay',  'Loam',  'Sandy',
  'Clay',  'Loam',  'Sandy', 'Clay',
]
```

NDVI values cycle through the [0.30, 0.90] range with deliberate variation to produce a mix of all three health statuses. Soil values cycle through `['Clay', 'Loam', 'Sandy']` ensuring all three types appear.

### Health Classification Function

```js
function classifyHealth(ndvi, rainfall) {
  if (rainfall === null) {
    // Null rainfall fallback: classify by NDVI alone
    if (ndvi >= 0.65) return 'Healthy'
    if (ndvi >= 0.40) return 'Moderate'
    return 'Problematic'
  }
  if (ndvi >= 0.65 && rainfall >= 3) return 'Healthy'
  if (ndvi < 0.40 && rainfall < 1)   return 'Problematic'
  return 'Moderate'  // catches [0.40,0.65) NDVI OR [1,3) rainfall
}

function healthColor(status) {
  return { Healthy: '#22c55e', Moderate: '#eab308', Problematic: '#ef4444' }[status]
}
```

> **Design decision**: The `Moderate` case is the catch-all after `Healthy` and `Problematic` are checked. This correctly handles the OR condition in Requirement 5.2 without needing to enumerate all sub-cases explicitly.

### Open-Meteo API

**Endpoint**: `GET https://api.open-meteo.com/v1/forecast`

**Query parameters**:
- `latitude` — Zone centroid latitude
- `longitude` — Zone centroid longitude
- `current=precipitation`
- `forecast_days=1`

**Response shape** (relevant fields):
```json
{
  "current": {
    "precipitation": 2.4
  }
}
```

**Extraction**: `data.current.precipitation` (number, mm).

**Error handling**: Each individual fetch is wrapped in `.catch(() => null)` so a single failed request does not reject the `Promise.all`. The zone receives `rainfall: null` and is classified by NDVI alone.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Health classification is total and correct for all inputs

*For any* NDVI value in [0, 1] and any rainfall value in [0, ∞) or null, `classifyHealth` SHALL return exactly one of `'Healthy'`, `'Moderate'`, or `'Problematic'` according to the rules: `'Healthy'` when ndvi ≥ 0.65 AND rainfall ≥ 3; `'Problematic'` when ndvi < 0.40 AND rainfall < 1; `'Moderate'` for all other cases. When rainfall is null, the NDVI-only thresholds apply: `'Healthy'` if ndvi ≥ 0.65, `'Moderate'` if ndvi ∈ [0.40, 0.65), `'Problematic'` if ndvi < 0.40.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 2: Health color mapping is exhaustive and correct

*For any* health status string in `{'Healthy', 'Moderate', 'Problematic'}`, `healthColor(status)` SHALL return the corresponding hex color: `'#22c55e'` for `'Healthy'`, `'#eab308'` for `'Moderate'`, `'#ef4444'` for `'Problematic'`. The three colors SHALL be distinct.

**Validates: Requirements 5.5, 5.6, 5.7**

### Property 3: Zone pipeline produces no null geometry

*For any* valid farm boundary polygon, all zones in the output of `buildZones` SHALL have non-null GeoJSON geometry. No zone with a null intersection result SHALL appear in the output array.

**Validates: Requirements 2.3**

### Property 4: Zone area conversion is consistent

*For any* positive area value in square metres, the hectare conversion SHALL equal `Math.round(m2 / 10000 * 100) / 100` — the hectare value is always exactly derivable from the m² value with no information loss beyond 2 decimal places.

**Validates: Requirements 2.5, 7.2**

### Property 5: Static data arrays are valid for all zone indices

*For any* index in [0, 15], `NDVI_VALUES[index]` SHALL be a number in the range [0.30, 0.90] and `SOIL_VALUES[index]` SHALL be one of `'Clay'`, `'Loam'`, or `'Sandy'`. Additionally, the full set of `SOIL_VALUES` SHALL contain at least one instance of each of the three soil types.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 6: Successful rainfall fetch stores the correct value

*For any* zone centroid and any precipitation value returned by a mocked Open-Meteo API response, the corresponding zone's `rainfall` field SHALL equal the value extracted from `data.current.precipitation`.

**Validates: Requirements 3.3**

### Property 7: Failed rainfall fetch assigns null without blocking other zones

*For any* zone where the Open-Meteo API request throws or returns a malformed response, that zone's `rainfall` field SHALL be `null`, and all other zones in the same `Promise.all` batch SHALL still receive their rainfall values.

**Validates: Requirements 3.4**

### Property 8: Zone polygon rendering props are correct for all zones

*For any* array of zones passed to `MapView`, each rendered zone polygon SHALL have `fillColor` equal to `zone.color` and `fillOpacity` equal to `0.55`. The popup for each zone SHALL contain the zone identifier, health status label (in the health color), NDVI value, soil type, area in hectares, and `"N/A"` (not `"null"` or `"undefined"`) when `rainfall` is null.

**Validates: Requirements 6.1, 6.2, 7.2, 7.4**

---

## Error Handling

### Rainfall Fetch Failures

Each Open-Meteo request is individually wrapped:

```js
const rainfallValues = await Promise.all(
  zones.map(z =>
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${z.centroid[0]}&longitude=${z.centroid[1]}&current=precipitation&forecast_days=1`)
      .then(r => r.json())
      .then(d => d.current.precipitation)
      .catch(() => null)
  )
)
```

This ensures:
- A single network failure does not block the entire page render.
- Zones with failed fetches are classified by NDVI alone (Requirement 5.4).
- The loading state is cleared after `Promise.all` resolves regardless of individual failures.

### Turf Intersection Nulls

`turf.intersect` returns `null` when two polygons do not overlap. The pipeline filters these out:

```js
const zones = cells.features
  .map(cell => turf.intersect(turf.featureCollection([cell, farmBoundary])))
  .filter(Boolean)
```

This prevents null geometry from reaching the Leaflet rendering layer.

### Centroid Containment Validation

`turf.booleanContains(farmBoundary, centroid)` is used as a guard. If a centroid falls outside the boundary (possible for edge zones with irregular shapes), the zone is still rendered but a console warning is emitted. The centroid is still used for the API call since it is the best available representative point.

### Missing `current.precipitation` Field

If the Open-Meteo response is malformed or the `current` key is absent, the `.then(d => d.current.precipitation)` chain throws, which is caught by `.catch(() => null)`. This is the same path as a network failure.

---

## Testing Strategy

### Unit Tests

Unit tests focus on the pure logic functions that have no external dependencies:

- **`classifyHealth`**: Test all boundary conditions — NDVI at exactly 0.40, 0.65; rainfall at exactly 1, 3; null rainfall with each NDVI range. These are the most critical correctness tests.
- **`healthColor`**: Test all three valid inputs return the correct hex strings.
- **Zone area conversion**: Test that `areaHa = areaM2 / 10000` rounded to 2dp is correct for representative values.
- **Static data arrays**: Test that all 16 NDVI values are in [0.30, 0.90] and all 16 soil values are valid, and that all three soil types appear.
- **Popup null handling**: Test that the popup render function outputs `"N/A"` when `rainfall` is null.

### Property-Based Tests

Property-based testing is appropriate for this feature because the core logic (`classifyHealth`, `healthColor`, static data validation, area conversion, popup rendering) consists of pure functions with well-defined input domains and universal invariants.

**Library**: [fast-check](https://github.com/dubzzz/fast-check) (TypeScript/JavaScript PBT library, well-maintained, works with Vitest).

**Configuration**: Each property test runs a minimum of 100 iterations.

**Tag format**: `// Feature: farm-gis-mapping, Property {N}: {property_text}`

**Property test implementations**:

1. **Property 1** — Generate `ndvi` in [0,1] and `rainfall` as either a non-negative float or null. Assert `classifyHealth(ndvi, rainfall)` returns the correct status per the classification rules. Verify boundary values (0.40, 0.65, 1.0, 3.0) are handled correctly.

2. **Property 2** — Generate each of the three status strings. Assert `healthColor(status)` returns the exact expected hex string. Assert all three returned colors are distinct.

3. **Property 3** — Generate a valid farm boundary polygon (or use the fixed `FARM_BOUNDARY`). Run `buildZones`. Assert every zone in the result has non-null geometry.

4. **Property 4** — Generate a positive float for `m2`. Assert `Math.round(m2 / 10000 * 100) / 100` equals the expected hectare value. Assert the conversion is idempotent (applying it twice gives the same result).

5. **Property 5** — Iterate all 16 indices. Assert `NDVI_VALUES[i]` ∈ [0.30, 0.90] and `SOIL_VALUES[i]` ∈ `{'Clay','Loam','Sandy'}`. Assert the union of all soil values contains all three types.

6. **Property 6** — Generate a precipitation value (non-negative float). Mock the fetch to return it. Assert the zone's `rainfall` field equals that value after the fetch resolves.

7. **Property 7** — Mock the fetch to throw. Assert the zone's `rainfall` field is `null`. Assert other zones in the same batch still receive their values.

8. **Property 8** — Generate an array of zone objects with varied health statuses, colors, and null/non-null rainfall. Assert each rendered polygon has `fillColor === zone.color` and `fillOpacity === 0.55`. Assert each popup contains all required fields and uses `"N/A"` (not `"null"`) for null rainfall.

### Integration Tests

- **Open-Meteo API shape**: One integration test (not run in CI) that hits the real API for a single coordinate and asserts the response contains `current.precipitation` as a number.
- **Turf pipeline smoke test**: A test that runs `buildZones(FARM_BOUNDARY)` and asserts the result is an array of 16 zones, each with valid geometry, centroid, and area.

### Manual / Visual Tests

- Verify satellite tile layer renders correctly in browser.
- Verify zone colors match health status after rainfall fetch.
- Verify legend is visible and correctly positioned after pan/zoom.
- Verify popup opens on zone click and closes on outside click.
- Verify fitBounds centers the map on the farm boundary on load.
