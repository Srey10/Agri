"""
farm_geometry.py — validation + area for farm boundaries (GeoJSON Polygon).

Pure functions, no Flask/DB imports, so they can be tested on their own.
GeoJSON order is [longitude, latitude].
"""
import math

MAX_VERTICES = 500
MIN_AREA_M2 = 10.0
MAX_AREA_HA = 50_000.0
EARTH_RADIUS_M = 6_371_008.8


def _project(ring):
    """Local equirectangular projection to metres (accurate enough at farm scale)."""
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    return [(math.radians(lon) * EARTH_RADIUS_M * math.cos(lat0),
             math.radians(lat) * EARTH_RADIUS_M) for lon, lat in ring]


def area_m2(ring):
    pts = _project(ring)
    s = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def _orient(a, b, c):
    v = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
    return 0 if abs(v) < 1e-9 else (1 if v > 0 else 2)


def _on_segment(a, b, c):
    return min(a[0], c[0]) <= b[0] <= max(a[0], c[0]) and min(a[1], c[1]) <= b[1] <= max(a[1], c[1])


def _segments_intersect(p1, q1, p2, q2):
    o1, o2, o3, o4 = _orient(p1, q1, p2), _orient(p1, q1, q2), _orient(p2, q2, p1), _orient(p2, q2, q1)
    if o1 != o2 and o3 != o4:
        return True
    return ((o1 == 0 and _on_segment(p1, p2, q1)) or (o2 == 0 and _on_segment(p1, q2, q1)) or
            (o3 == 0 and _on_segment(p2, p1, q2)) or (o4 == 0 and _on_segment(p2, q1, q2)))


def self_intersects(ring):
    """True if any two non-adjacent edges of the closed ring touch or cross."""
    pts = _project(ring)
    n = len(pts) - 1  # number of edges
    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue  # edges that share a vertex
            if _segments_intersect(pts[i], pts[i + 1], pts[j], pts[j + 1]):
                return True
    return False


def validate_polygon(geometry):
    """
    Validate a GeoJSON Polygon. Returns (normalized_geometry, area_hectares, error).
    The ring is closed automatically, consecutive duplicates are dropped and
    coordinates are rounded to 7 decimals (~1 cm).
    """
    if not isinstance(geometry, dict) or geometry.get('type') != 'Polygon':
        return None, None, "Farm boundary must be a GeoJSON Polygon"
    rings = geometry.get('coordinates')
    if not isinstance(rings, list) or len(rings) != 1 or not isinstance(rings[0], list):
        return None, None, "Farm boundary must have exactly one outer ring"
    raw = rings[0]
    if len(raw) > MAX_VERTICES + 1:
        return None, None, f"Too many boundary points (maximum {MAX_VERTICES})"

    ring = []
    for p in raw:
        if (not isinstance(p, (list, tuple)) or len(p) < 2 or
                any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in p[:2])):
            return None, None, "Every boundary point must be [longitude, latitude]"
        lon, lat = float(p[0]), float(p[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            return None, None, "Boundary coordinates are out of range"
        pt = [round(lon, 7), round(lat, 7)]
        if not ring or ring[-1] != pt:
            ring.append(pt)

    if len(ring) > 1 and ring[0] == ring[-1]:
        ring.pop()  # re-closed below
    if len({tuple(p) for p in ring}) < 3:
        return None, None, "Mark at least 3 different corners of your farm"
    ring.append(list(ring[0]))

    if self_intersects(ring):
        return None, None, "The boundary lines cross each other. Move or undo the last points"
    m2 = area_m2(ring)
    if m2 < MIN_AREA_M2:
        return None, None, "The boundary is too small or its points are in a straight line"
    ha = m2 / 10_000.0
    if ha > MAX_AREA_HA:
        return None, None, "The boundary is unrealistically large for a farm. Please check the points"
    return {"type": "Polygon", "coordinates": [ring]}, round(ha, 4), None
