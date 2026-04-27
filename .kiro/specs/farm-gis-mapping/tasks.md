# Implementation Plan: Farm GIS Mapping

## Overview

Replace the existing pan-India GIS view with a farm-level spatial analysis system. The implementation proceeds in dependency order: install the Turf.js library first, then implement the pure logic functions (testable in isolation), then wire up the data pipeline in `GISMapping.jsx`, then update `MapView.jsx` to render the enriched zones, and finally add CSS polish. Property-based tests are placed immediately after the code they validate so failures surface early.

## Tasks

- [x] 1. Install `@turf/turf` dependency
  - Add `@turf/turf` as a pinned dependency in `package.json` (use the latest stable version, e.g. `"@turf/turf": "7.2.0"`)
  - Run `npm install` to update `package-lock.json`
  - Verify the import `import * as turf from '@turf/turf'` resolves without build errors by checking `vite build` or `vite` dev server startup
  - _Requirements: 11.1, 11.2_

- [ ] 2. Implement pure logic functions and static data in `GISMapping.jsx`
  - [x] 2.1 Define `FARM_BOUNDARY`, `NDVI_VALUES`, and `SOIL_VALUES` constants
    - Replace the existing `allFields` and `layers` constants with the new farm-level constants
    - `FARM_BOUNDARY` is the rectangular GeoJSON `Feature<Polygon>` centered on (19.430895890702025, 74.90087436910626) as specified in the design
    - `NDVI_VALUES` is the 16-entry array `[0.72, 0.45, 0.31, 0.68, 0.55, 0.82, 0.38, 0.61, 0.77, 0.42, 0.30, 0.88, 0.50, 0.65, 0.35, 0.90]`
    - `SOIL_VALUES` is the 16-entry array cycling through `['Clay', 'Loam', 'Sandy', ...]` as specified in the design
    - _Requirements: 1.1, 4.1, 4.2, 4.3_

  - [x] 2.2 Implement `classifyHealth(ndvi, rainfall)` and `healthColor(status)` pure functions
    - `classifyHealth`: when `rainfall` is not null, return `'Healthy'` if ndvi ≥ 0.65 AND rainfall ≥ 3; `'Problematic'` if ndvi < 0.40 AND rainfall < 1; `'Moderate'` otherwise
    - `classifyHealth`: when `rainfall` is null, return `'Healthy'` if ndvi ≥ 0.65; `'Moderate'` if ndvi ∈ [0.40, 0.65); `'Problematic'` if ndvi < 0.40
    - `healthColor`: return `'#22c55e'` for `'Healthy'`, `'#eab308'` for `'Moderate'`, `'#ef4444'` for `'Problematic'`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 2.3 Write property tests for `classifyHealth` and `healthColor`
    - Install `fast-check` as a dev dependency (`"fast-check": "3.23.2"`) and set up Vitest config if not already present
    - Create `src/pages/__tests__/GISMapping.test.js`
    - **Property 1: Health classification is total and correct**
      - Generate `ndvi` in [0, 1] and `rainfall` as a non-negative float or null
      - Assert `classifyHealth(ndvi, rainfall)` returns exactly one of the three valid statuses per the classification rules
      - Verify boundary values: ndvi = 0.40, 0.65; rainfall = 1, 3
      - Tag: `// Feature: farm-gis-mapping, Property 1: classifyHealth is total and correct`
      - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - **Property 2: Health color mapping is exhaustive and correct**
      - Assert `healthColor('Healthy') === '#22c55e'`, `healthColor('Moderate') === '#eab308'`, `healthColor('Problematic') === '#ef4444'`
      - Assert all three returned colors are distinct strings
      - Tag: `// Feature: farm-gis-mapping, Property 2: healthColor is exhaustive and correct`
      - **Validates: Requirements 5.5, 5.6, 5.7**

- [ ] 3. Implement `buildZones(farmBoundary)` in `GISMapping.jsx`
  - [x] 3.1 Implement the Turf zone pipeline
    - Import `squareGrid`, `intersect`, `featureCollection`, `centroid`, `area`, `booleanContains` from `@turf/turf`
    - Use `turf.squareGrid` with `cellSide` sized to produce a 4×4 grid over the `FARM_BOUNDARY` bounding box (cellSide ≈ 0.007 degrees)
    - Map each cell through `turf.intersect(turf.featureCollection([cell, farmBoundary]))` and filter out null results
    - For each non-null intersection: compute centroid with `turf.centroid`, compute area with `turf.area`, run `turf.booleanContains` guard (emit `console.warn` if centroid is outside boundary)
    - Assign `ndvi = NDVI_VALUES[id]`, `soil = SOIL_VALUES[id]`, `areaHa = Math.round(areaM2 / 10000 * 100) / 100`
    - Return array of partial Zone objects (without `rainfall`, `health`, `color` yet)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.1, 4.2_

  - [ ]* 3.2 Write property tests for `buildZones` and area conversion
    - **Property 3: Zone pipeline produces no null geometry**
      - Call `buildZones(FARM_BOUNDARY)` and assert every zone has non-null GeoJSON geometry
      - Assert the result array has exactly 16 entries (rectangular boundary guarantees full grid coverage)
      - Tag: `// Feature: farm-gis-mapping, Property 3: buildZones produces no null geometry`
      - **Validates: Requirements 2.3**
    - **Property 4: Area conversion m² → ha is consistent**
      - Generate a positive float for `m2`; assert `Math.round(m2 / 10000 * 100) / 100` equals the expected hectare value
      - Assert applying the conversion formula twice gives the same result as applying it once
      - Tag: `// Feature: farm-gis-mapping, Property 4: area conversion m² → ha is consistent`
      - **Validates: Requirements 2.5, 7.2**
    - **Property 5: Static data arrays are valid for all 16 indices**
      - Iterate indices 0–15; assert `NDVI_VALUES[i]` ∈ [0.30, 0.90] and `SOIL_VALUES[i]` ∈ `{'Clay','Loam','Sandy'}`
      - Assert the union of all `SOIL_VALUES` contains at least one of each soil type
      - Tag: `// Feature: farm-gis-mapping, Property 5: static data arrays are valid for all 16 indices`
      - **Validates: Requirements 4.1, 4.2, 4.3**

- [ ] 4. Implement `fetchRainfall(zones)` and the mount effect in `GISMapping.jsx`
  - [x] 4.1 Implement `fetchRainfall(zones)`
    - Use `Promise.all` over all zone centroids
    - Each request: `fetch('https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&current=precipitation&forecast_days=1')`
    - Extract `data.current.precipitation` from the JSON response
    - Wrap each individual fetch in `.catch(() => null)` so a single failure does not reject the batch
    - Return the array of precipitation values (number or null per zone)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.2 Wire the mount `useEffect` in `GISMapping.jsx`
    - Replace the existing component state (`selectedField`, `activeLayer`, `searchTerm`) with `zones`, `loading`, `selectedZone`
    - In `useEffect([], [])`: call `buildZones(FARM_BOUNDARY)`, set partial zones, set `loading = true`
    - After `fetchRainfall` resolves: map over partial zones to attach `rainfall`, `health = classifyHealth(...)`, `color = healthColor(...)`; call `setZones(enriched)`; set `loading = false`
    - _Requirements: 3.1, 3.2, 3.5, 5.1, 5.2, 5.3, 5.4, 8.4, 8.5_

  - [ ]* 4.3 Write property tests for `fetchRainfall`
    - **Property 6: Successful rainfall fetch stores the correct value**
      - Generate a non-negative float as the mock precipitation value
      - Mock `globalThis.fetch` to return a response with `{ current: { precipitation: value } }`
      - Assert the zone's `rainfall` field equals the generated value after the fetch resolves
      - Tag: `// Feature: farm-gis-mapping, Property 6: successful rainfall fetch stores correct value`
      - **Validates: Requirements 3.3**
    - **Property 7: Failed rainfall fetch assigns null without blocking other zones**
      - Mock one zone's fetch to throw; mock all other zones' fetches to return valid values
      - Assert the failing zone's `rainfall` is `null`
      - Assert all other zones still receive their correct rainfall values
      - Tag: `// Feature: farm-gis-mapping, Property 7: failed rainfall fetch assigns null without blocking`
      - **Validates: Requirements 3.4**

- [ ] 5. Checkpoint — Ensure all tests pass
  - Run `npx vitest --run` and confirm all property tests from tasks 2.3, 3.2, and 4.3 pass
  - Ensure all tests pass; ask the user if questions arise

- [ ] 6. Update `MapView.jsx` with farm-level Leaflet rendering
  - [x] 6.1 Implement `<FarmBoundsEffect />` and `<LegendControl />` internal components
    - `<FarmBoundsEffect farmBoundary={farmBoundary} />`: use `useMap()` to call `map.fitBounds(bbox)` on mount, where `bbox` is derived from the farm boundary coordinates
    - `<LegendControl />`: use `useMap()` to add an `L.control({ position: 'bottomright' })` on mount; the control's `onAdd` returns a `div` with three color swatches (green/yellow/red) and labels (Healthy/Moderate/Problematic), styled with dark-theme CSS variables
    - Both components must be rendered as children of `<MapContainer>` to access the Leaflet map instance
    - _Requirements: 1.4, 9.1, 9.2, 9.3, 9.4_

  - [x] 6.2 Replace `MapView.jsx` with the farm-level map component
    - Update props signature: `{ zones, farmBoundary, onZoneClick, selectedZoneId }`
    - Replace `TileLayer` URL with Esri World Imagery: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` with correct attribution
    - Render `farmBoundary` as a `<Polygon>` with a visible stroke and low-opacity fill (e.g. `fillOpacity: 0.05`, `color: '#ffffff'`, `dashArray: '6,4'`)
    - Render each zone as a `<Polygon>` with `fillColor={zone.color}`, `fillOpacity={0.55}`, and an `eventHandlers={{ click: () => onZoneClick(zone) }}`
    - Each zone `<Polygon>` includes a `<Popup>` showing: zone id, health status (colored), NDVI, soil type, area in hectares, rainfall (mm or `"N/A"` if null)
    - Apply a highlight stroke (e.g. `weight: 3, color: '#fff'`) when `zone.id === selectedZoneId`
    - Render `<FarmBoundsEffect />` and `<LegendControl />` as children of `<MapContainer>`
    - Remove all old `CircleMarker`, `Marker`, and `Polyline` imports and usage
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 6.3 Write property tests for zone polygon rendering props
    - **Property 8: Zone polygon rendering props are correct for all zones**
      - Generate an array of zone objects with varied health statuses, colors, and null/non-null rainfall values
      - Render `<MapView zones={zones} farmBoundary={FARM_BOUNDARY} onZoneClick={() => {}} selectedZoneId={null} />` using `@testing-library/react`
      - Assert each rendered polygon has `fillColor === zone.color` and `fillOpacity === 0.55`
      - Assert each popup contains the zone id, health status label, NDVI value, soil type, area in hectares, and `"N/A"` (not `"null"` or `"undefined"`) when `rainfall` is null
      - Tag: `// Feature: farm-gis-mapping, Property 8: zone polygon rendering props are correct`
      - **Validates: Requirements 6.1, 6.2, 7.2, 7.4**

- [ ] 7. Update `GISMapping.jsx` page layout
  - [x] 7.1 Implement the page layout: header, sidebar, map column, right panel
    - Header: farm name ("Sugarcane Farm — Maharashtra"), live badge (`.badge.badge-green.pulse`), zone count badge
    - Left sidebar: layer info card (satellite layer name, zone count, total area) + Summary Panel showing healthy/moderate/problematic counts with their respective colors; show a loading skeleton or `"—"` while `loading === true`
    - Map column: render `<MapView zones={zones} farmBoundary={FARM_BOUNDARY} onZoneClick={z => setSelectedZone(z)} selectedZoneId={selectedZone?.id ?? null} />` inside a `.card` with `padding: 0, overflow: hidden`
    - Right panel: when `selectedZone` is set, show zone id, health badge, NDVI progress bar, soil type, area in hectares, rainfall (mm or "N/A"); when no zone is selected, show a placeholder prompt
    - Use `.card`, `.badge`, `.badge-green/yellow/red`, `.progress-bar`, `.progress-fill`, and CSS variables from `src/index.css` throughout
    - _Requirements: 1.2, 3.5, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 7.2 Remove all old pan-India GIS code
    - Delete `allFields`, `layers`, `selectedField`, `activeLayer`, `searchTerm` state and all JSX that references them
    - Remove unused imports (`CircleMarker`, `Polyline`, `Marker`, `MapContainer`, `TileLayer` — these now live in `MapView.jsx`)
    - _Requirements: 10.4_

- [x] 8. Update `GISMapping.css` with farm GIS layout styles
  - Add `.gis-summary-row` for the health count rows in the summary panel (flex, space-between, colored dot + label + count)
  - Add `.zone-detail-*` classes for the right panel zone detail view (id, health badge row, metrics grid for NDVI/area/rainfall, soil type row)
  - Add `.gis-loading` for the loading state overlay or skeleton rows in the summary panel
  - Ensure `.gis-main` grid columns remain `220px 1fr 240px` (already defined) or adjust if the right panel needs more width for zone details
  - All new rules MUST use CSS variables from `src/index.css` (no hardcoded colors except the three health hex values already used as inline styles)
  - _Requirements: 10.1, 10.4_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Run `npx vitest --run` and confirm all tests pass (properties 1–8)
  - Verify `npm run build` completes without errors
  - Ensure all tests pass; ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 5 and 9) ensure incremental validation before and after the Leaflet rendering work
- Property tests validate universal correctness properties; unit tests within the same file validate specific boundary examples
- The rectangular `FARM_BOUNDARY` guarantees exactly 16 non-null intersections, making the zone count deterministic and testable
- `fast-check` property tests run a minimum of 100 iterations per property by default
