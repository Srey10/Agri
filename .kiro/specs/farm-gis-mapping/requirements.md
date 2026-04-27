# Requirements Document

## Introduction

This feature replaces the existing pan-India multi-field GIS view with a farm-level GIS system focused on a single fixed sugarcane farm in Maharashtra, India (Latitude: 19.430895890702025, Longitude: 74.90087436910626). The system divides the farm into spatial zones using Turf.js, enriches each zone with live rainfall data from the Open-Meteo API plus static soil type and NDVI values, classifies each zone by health status, and renders the result as an interactive color-coded map with popups, a summary panel, and a legend — all within the existing dark-themed React + Leaflet application.

---

## Glossary

- **Farm_Boundary**: The GeoJSON Polygon that defines the outer perimeter of the fixed sugarcane farm in Maharashtra.
- **Zone**: A spatial sub-unit of the farm produced by clipping a grid cell to the Farm_Boundary using Turf.js.
- **Zone_Grid**: The set of all Zones that together cover the Farm_Boundary.
- **Zone_Centroid**: The geographic center point of a Zone, computed by Turf.js, used as the coordinate for API data requests.
- **Zone_Area**: The area of a Zone in square metres, computed by Turf.js.
- **Health_Status**: A classification assigned to each Zone — one of `Healthy`, `Moderate`, or `Problematic`.
- **NDVI**: Normalised Difference Vegetation Index; a static mock value in the range [0, 1] assigned per Zone.
- **Soil_Type**: A static categorical value assigned per Zone; one of `Clay`, `Loam`, or `Sandy`.
- **Rainfall**: Live precipitation data (mm) fetched from the Open-Meteo API for a Zone_Centroid.
- **Open-Meteo_API**: The free, no-authentication weather API at `https://api.open-meteo.com` used to retrieve current rainfall data.
- **Turf**: The `@turf/turf` JavaScript library used for all spatial computations.
- **GIS_Map**: The Leaflet map rendered inside `src/components/MapView.jsx` that displays the Farm_Boundary and Zone_Grid.
- **Summary_Panel**: The UI panel outside the GIS_Map that shows aggregate Zone health counts.
- **Legend**: The map overlay that explains the color coding for Health_Status values.
- **Zone_Popup**: The Leaflet popup that appears when a user clicks a Zone, showing that Zone's data.
- **Satellite_Tile_Layer**: The map tile layer that renders satellite/aerial imagery as the map background.
- **GISMapping_Page**: The React page component at `src/pages/GISMapping.jsx`.
- **MapView_Component**: The React component at `src/components/MapView.jsx` that encapsulates the Leaflet map.

---

## Requirements

### Requirement 1: Farm Boundary Display

**User Story:** As a farm manager, I want to see my sugarcane farm boundary drawn on a satellite map, so that I can visually confirm the correct farm is being monitored.

#### Acceptance Criteria

1. THE GIS_Map SHALL render a Satellite_Tile_Layer as the default base map using the Esri World Imagery tile service.
2. THE GIS_Map SHALL center on Latitude 19.430895890702025, Longitude 74.90087436910626 at an initial zoom level that makes the Farm_Boundary fully visible within the viewport.
3. THE GIS_Map SHALL render the Farm_Boundary as a GeoJSON Polygon with a visible stroke and a low-opacity fill distinct from Zone fill colors.
4. WHEN the GIS_Map is first loaded, THE GIS_Map SHALL fit the viewport to the Farm_Boundary bounding box automatically.

---

### Requirement 2: Zone Grid Generation

**User Story:** As a farm manager, I want my farm divided into smaller zones, so that I can analyze spatial variation across different parts of the field.

#### Acceptance Criteria

1. THE GIS_Map SHALL use `turf.squareGrid` to generate a 4×4 grid (16 cells) covering the Farm_Boundary bounding box.
2. THE GIS_Map SHALL use `turf.intersect` to clip each grid cell to the Farm_Boundary, retaining only the portions that fall within the Farm_Boundary.
3. THE Zone_Grid SHALL contain only Zones whose intersection with the Farm_Boundary produces a non-null geometry.
4. THE GIS_Map SHALL use `turf.centroid` to compute the Zone_Centroid for each Zone.
5. THE GIS_Map SHALL use `turf.area` to compute the Zone_Area for each Zone in square metres.
6. THE GIS_Map SHALL use `turf.booleanContains` to verify that each Zone_Centroid lies within or on the Farm_Boundary before assigning it as the representative point for API calls.

---

### Requirement 3: Rainfall Data Retrieval

**User Story:** As a farm manager, I want each zone to display live rainfall data, so that I can identify which parts of the farm are receiving adequate precipitation.

#### Acceptance Criteria

1. WHEN the GISMapping_Page is mounted, THE GISMapping_Page SHALL fetch current precipitation data from the Open-Meteo API for each Zone_Centroid using the endpoint `https://api.open-meteo.com/v1/forecast` with parameters `latitude`, `longitude`, `current=precipitation`, and `forecast_days=1`. The `current.precipitation` field from the response SHALL be used as the Zone's Rainfall value.
2. THE GISMapping_Page SHALL perform all Zone_Centroid API requests concurrently using `Promise.all` to minimise total load time.
3. WHEN an Open-Meteo_API request succeeds, THE GISMapping_Page SHALL store the returned precipitation value (mm) against the corresponding Zone.
4. IF an Open-Meteo_API request fails for a Zone, THEN THE GISMapping_Page SHALL assign a fallback precipitation value of `null` to that Zone and continue rendering without blocking other Zones.
5. WHILE rainfall data is being fetched, THE GISMapping_Page SHALL display a loading indicator visible to the user.

---

### Requirement 4: Static Zone Data Assignment

**User Story:** As a farm manager, I want each zone to have soil type and NDVI values, so that I can understand the agronomic characteristics of each part of the farm.

#### Acceptance Criteria

1. THE GISMapping_Page SHALL assign a Soil_Type value of `Clay`, `Loam`, or `Sandy` to each Zone using a deterministic static mapping based on Zone index.
2. THE GISMapping_Page SHALL assign an NDVI value in the range [0.30, 0.90] to each Zone using a deterministic static mapping based on Zone index.
3. THE GISMapping_Page SHALL ensure that the combination of Soil_Type and NDVI values across all Zones includes at least one instance of each Soil_Type.

---

### Requirement 5: Zone Health Classification

**User Story:** As a farm manager, I want each zone classified as Healthy, Moderate, or Problematic, so that I can quickly identify areas that need attention.

#### Acceptance Criteria

1. THE GISMapping_Page SHALL classify a Zone as `Healthy` WHEN its NDVI is greater than or equal to 0.65 AND its Rainfall is greater than or equal to 3 mm.
2. THE GISMapping_Page SHALL classify a Zone as `Moderate` WHEN its NDVI is in the range [0.40, 0.65) OR its Rainfall is in the range [1, 3) mm.
3. THE GISMapping_Page SHALL classify a Zone as `Problematic` WHEN its NDVI is less than 0.40 AND its Rainfall is less than 1 mm.
4. IF a Zone's Rainfall value is `null`, THEN THE GISMapping_Page SHALL classify that Zone using NDVI alone: `Healthy` if NDVI ≥ 0.65, `Moderate` if NDVI ∈ [0.40, 0.65), `Problematic` if NDVI < 0.40.
5. THE GISMapping_Page SHALL assign the color `#22c55e` (green) to Zones classified as `Healthy`.
6. THE GISMapping_Page SHALL assign the color `#eab308` (yellow) to Zones classified as `Moderate`.
7. THE GISMapping_Page SHALL assign the color `#ef4444` (red) to Zones classified as `Problematic`.

---

### Requirement 6: Color-Coded Zone Visualization

**User Story:** As a farm manager, I want to see color-coded zones on the map, so that I can instantly understand the spatial distribution of farm health.

#### Acceptance Criteria

1. THE MapView_Component SHALL render each Zone as a filled GeoJSON polygon on the GIS_Map using the Zone's assigned Health_Status color.
2. THE MapView_Component SHALL apply a fill opacity of 0.55 to each Zone polygon so that the Satellite_Tile_Layer remains partially visible beneath the Zone fill.
3. THE MapView_Component SHALL render the Farm_Boundary polygon above the Satellite_Tile_Layer and below the Zone polygons in the layer stacking order.
4. WHEN new Zone data is provided to the MapView_Component, THE MapView_Component SHALL re-render all Zone polygons to reflect updated Health_Status colors without requiring a full page reload.

---

### Requirement 7: Clickable Zone Popups

**User Story:** As a farm manager, I want to click on a zone and see its detailed data, so that I can investigate specific areas of concern.

#### Acceptance Criteria

1. WHEN a user clicks a Zone polygon on the GIS_Map, THE GIS_Map SHALL display a Zone_Popup anchored to the click location.
2. THE Zone_Popup SHALL display the Zone identifier, Health_Status, NDVI value, Soil_Type, Rainfall value (mm or "N/A" if null), and Zone_Area (formatted in hectares to two decimal places).
3. THE Zone_Popup SHALL apply the existing dark-theme popup styles defined in `src/index.css` (`.leaflet-popup-content-wrapper` overrides).
4. THE Zone_Popup SHALL display the Health_Status label in the color corresponding to the Zone's Health_Status classification.
5. WHEN a user clicks outside a Zone_Popup or on a different Zone, THE GIS_Map SHALL close the previously open Zone_Popup.

---

### Requirement 8: Summary Panel

**User Story:** As a farm manager, I want a summary panel showing zone health counts, so that I can get a quick overview of the farm's overall condition.

#### Acceptance Criteria

1. THE GISMapping_Page SHALL render a Summary_Panel outside the GIS_Map that displays the total count of Zones classified as `Healthy`, `Moderate`, and `Problematic`.
2. THE Summary_Panel SHALL display each count with its corresponding Health_Status color (`#22c55e`, `#eab308`, `#ef4444`).
3. THE Summary_Panel SHALL display the total number of Zones and the total farm area in hectares (derived from the sum of all Zone_Area values).
4. WHEN Zone data is updated (e.g., after rainfall fetch completes), THE Summary_Panel SHALL update its counts to reflect the latest Health_Status classifications.
5. WHILE rainfall data is being fetched, THE Summary_Panel SHALL display a loading state for the health counts.

---

### Requirement 9: Map Legend

**User Story:** As a farm manager, I want a legend on the map, so that I can understand what the zone colors represent without prior knowledge.

#### Acceptance Criteria

1. THE GIS_Map SHALL render a Legend as a Leaflet custom control positioned in the bottom-right corner of the map.
2. THE Legend SHALL contain three entries: one for `Healthy` (green swatch), one for `Moderate` (yellow swatch), and one for `Problematic` (red swatch).
3. THE Legend SHALL be styled consistently with the application's dark theme using CSS variables from `src/index.css`.
4. THE Legend SHALL remain visible and correctly positioned when the user pans or zooms the GIS_Map.

---

### Requirement 10: Visual Style Consistency

**User Story:** As a developer, I want the new GIS page to match the existing app's visual style, so that the feature feels native to the application.

#### Acceptance Criteria

1. THE GISMapping_Page SHALL use the CSS variables defined in `src/index.css` (e.g., `--bg-card`, `--border`, `--text-primary`, `--green-accent`) for all new UI elements.
2. THE GISMapping_Page SHALL use the `.card` class from `src/index.css` for all panel containers.
3. THE GISMapping_Page SHALL use the `.badge` and `.badge-*` classes from `src/index.css` for status indicators.
4. THE GISMapping_Page SHALL preserve the existing page layout structure (header, main content area with sidebar and map column) defined in `src/pages/GISMapping.css`.
5. THE GISMapping_Page SHALL use `lucide-react` icons consistent with the existing icon usage in the application.

---

### Requirement 11: Turf.js Dependency

**User Story:** As a developer, I want Turf.js available as a project dependency, so that all spatial computations are handled by a well-tested geospatial library.

#### Acceptance Criteria

1. THE project SHALL declare `@turf/turf` as a dependency in `package.json` with a pinned version.
2. WHEN `@turf/turf` is imported in a component, THE build system SHALL resolve the import without errors.
3. THE GISMapping_Page SHALL import and use only the following Turf functions: `squareGrid`, `intersect`, `centroid`, `area`, and `booleanContains`.
