import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── BLM (Bureau of Land Management) ArcGIS REST Services ────────────────────
// Free, public federal data. Provides:
//   • Surface Management Agency (SMA) raster tiles — shows who manages the land
//   • OHV designated area polygons — where motorized use is designated

const BLM_BASE = "https://gis.blm.gov/arcgis/rest/services";

// Raster tile URLs for land Surface Management Agency (SMA) overlays.
// NOTE: the old lands/BLM_Natl_SMA_Limited_Areas service was retired (404) as of 2026-07.
// Replacements verified live 2026-07-16:
//   • BLM_Natl_SMA_Cached_with_PriUnk — all ownership categories, fused tile cache (fast)
//   • BLM_Natl_SMA_Cached_BLM_Only    — BLM lands only, fused tile cache (fast)
//   • export endpoint on with_PriUnk  — dynamic per-category rendering (slower; used when
//     the user selects a custom subset of ownership categories)
export const BLM_SMA_TILES = [
  `${BLM_BASE}/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/tile/{z}/{y}/{x}`,
];
export const BLM_SMA_BLM_ONLY_TILES = [
  `${BLM_BASE}/lands/BLM_Natl_SMA_Cached_BLM_Only/MapServer/tile/{z}/{y}/{x}`,
];

// Ownership categories with the service's real renderer colors (extracted from the
// MapServer legend endpoint) and the sub-layer ids used for per-category export.
export interface SmaCategory {
  key: string;
  label: string;
  color: string;
  layerIds: number[];
}

export const SMA_CATEGORIES: SmaCategory[] = [
  { key: "blm", label: "BLM", color: "#FEE679", layerIds: [22] },
  { key: "usfs", label: "Nat'l Forest", color: "#CCEBC5", layerIds: [24] },
  { key: "nps", label: "Nat'l Park", color: "#CABDDC", layerIds: [23] },
  { key: "usfw", label: "Fish & Wildlife", color: "#7FCCA7", layerIds: [25] },
  { key: "dod", label: "DOD", color: "#FBB4CE", layerIds: [21] },
  { key: "tribal", label: "Tribal", color: "#FDB46C", layerIds: [27, 19, 20] },
  { key: "state", label: "State / Local", color: "#B3E3EE", layerIds: [29, 30] },
  { key: "otherfed", label: "Other Federal", color: "#E4C49F", layerIds: [26, 28] },
  { key: "private", label: "Private", color: "#FFFFFF", layerIds: [31] },
];

// Dynamic export-based raster tile template showing only the given ownership categories.
// Each 512px tile is rendered server-side by ArcGIS with `layers=show:` filtering —
// slower than the fused cache but supports arbitrary category combinations.
export function smaExportTiles(keys: string[]): string[] {
  const ids = SMA_CATEGORIES.filter((c) => keys.includes(c.key)).flatMap(
    (c) => c.layerIds
  );
  return [
    `${BLM_BASE}/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&layers=show:${ids.join(",")}&transparent=true&format=png32&f=image`,
  ];
}

// OHV designated areas polygon layer.
// NOTE: the original BLM_Natl_OHV_Areas/MapServer service has been fully retired from BLM's
// ArcGIS catalog (404, and absent from the `recreation` folder's service listing) as of 2026-07.
// Its replacement is `recreation/BLM_Natl_Recs_poly` layer 0 ("Recreation Sites"), a general
// recreation-area polygon layer whose OHV areas are identified by FET_SUBTYPE = "OHV Designated
// Area" (field names FET_NAME/FET_SUBTYPE/ADMIN_ST, not the old AREANAME/AREATYPE/ADMINST — mapped
// back to the old names below so callers/UI don't need to change). Confirmed against a known area
// (Dumont Dunes, CA).
const BLM_OHV_AREAS_URL = `${BLM_BASE}/recreation/BLM_Natl_Recs_poly/MapServer/0/query`;

interface BlmRecsRawFeature {
  type: "Feature";
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } | null;
  properties: { FET_NAME?: string; FET_SUBTYPE?: string; ADMIN_ST?: string; GIS_ACRES?: number };
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlmOhvFeature {
  type: "Feature";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  properties: {
    AREANAME?: string;
    AREATYPE?: string;
    ADMINST?: string;
    GIS_ACRES?: number;
    [key: string]: unknown;
  };
}

export interface BlmOhvCollection {
  type: "FeatureCollection";
  features: BlmOhvFeature[];
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: { data: T; ts: number } = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch BLM OHV designated area polygons within a bounding box.
 * These are areas where motorized off-road recreation is officially designated.
 */
export async function fetchBlmOhvAreas(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<BlmOhvCollection> {
  // v2 prefix busts any stale empty-result entries written by the previous cache logic
  const key = `blm_ohv_v2_${minLng.toFixed(2)}_${minLat.toFixed(2)}_${maxLng.toFixed(2)}_${maxLat.toFixed(2)}`;
  const cached = await getCached<BlmOhvCollection>(key);
  if (cached) return cached;

  const envelope = JSON.stringify({
    xmin: minLng, ymin: minLat, xmax: maxLng, ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "FET_NAME,FET_SUBTYPE,ADMIN_ST,GIS_ACRES",
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    where: "FET_SUBTYPE = 'OHV Designated Area'",
    resultRecordCount: "200",
  });

  const resp = await fetch(`${BLM_OHV_AREAS_URL}?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`BLM API error ${resp.status}`);

  const raw = (await resp.json()) as { type: "FeatureCollection"; features: BlmRecsRawFeature[] };
  const json: BlmOhvCollection = {
    type: "FeatureCollection",
    features: (raw.features ?? [])
      .filter((f): f is BlmRecsRawFeature & { geometry: NonNullable<BlmRecsRawFeature["geometry"]> } => f.geometry != null)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          AREANAME: f.properties.FET_NAME,
          AREATYPE: f.properties.FET_SUBTYPE,
          ADMINST: f.properties.ADMIN_ST,
          GIS_ACRES: f.properties.GIS_ACRES,
        },
      })),
  };
  // Only cache non-empty results — an empty response usually means the bounding
  // box happened to land on private/NPS/state land (e.g. the CA-center fallback
  // covers the Central Valley which has no BLM OHV areas). Caching zeros would
  // poison the 24-hour cache and hide real results once the user moves or GPS arrives.
  if (json.features.length > 0) {
    await setCached(key, json);
  }
  return json;
}

/**
 * Fetch BLM OHV areas within `radiusMiles` of a lat/lng point.
 */
export async function fetchBlmOhvNear(
  lat: number, lng: number, radiusMiles = 25,
): Promise<BlmOhvCollection> {
  const deg = radiusMiles / 69.0;
  return fetchBlmOhvAreas(lng - deg, lat - deg, lng + deg, lat + deg);
}

// ─── BLM Campgrounds ──────────────────────────────────────────────────────────

const BLM_RECS_PTS_BASE = `${BLM_BASE}/recreation/BLM_Natl_Recs_pts/MapServer`;

export interface BlmCampground {
  id: number;
  name: string;
  subtype: string;
  state: string;
  description: string | null;
  webLink: string | null;
  lat: number;
  lng: number;
}

interface BlmCampRawFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown>;
}

async function fetchBlmCampLayer(
  layer: 2 | 3,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<BlmCampground[]> {
  const envelope = JSON.stringify({
    xmin: minLng, ymin: minLat, xmax: maxLng, ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OBJECTID,FET_NAME,FET_SUBTYPE,ADMIN_ST,DESCRIPTION,WEB_LINK",
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    where: "1=1",
    resultRecordCount: "200",
  });
  try {
    const resp = await fetch(`${BLM_RECS_PTS_BASE}/${layer}/query?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return [];
    const raw = (await resp.json()) as { features?: BlmCampRawFeature[] };
    return (raw.features ?? []).map((f) => ({
      id: (f.properties.OBJECTID as number) ?? 0,
      name: (f.properties.FET_NAME as string) ?? "BLM Campground",
      subtype: (f.properties.FET_SUBTYPE as string) ?? "Campground",
      state: (f.properties.ADMIN_ST as string) ?? "",
      description: (f.properties.DESCRIPTION as string | null) ?? null,
      webLink: (f.properties.WEB_LINK as string | null) ?? null,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch BLM campgrounds (developed + primitive) within `radiusMiles` of a point.
 * Queries layers 2 (Campground) and 3 (Campsite - Developed) from BLM_Natl_Recs_pts.
 */
export async function fetchBlmCampgrounds(
  lat: number, lng: number, radiusMiles = 40,
): Promise<BlmCampground[]> {
  const deg = radiusMiles / 69.0;
  const [minLng, minLat, maxLng, maxLat] = [lng - deg, lat - deg, lng + deg, lat + deg];
  const key = `blm_camps_v1_${minLng.toFixed(2)}_${minLat.toFixed(2)}_${maxLng.toFixed(2)}_${maxLat.toFixed(2)}`;
  const cached = await getCached<BlmCampground[]>(key);
  if (cached) return cached;
  const [layer2, layer3] = await Promise.all([
    fetchBlmCampLayer(2, minLng, minLat, maxLng, maxLat),
    fetchBlmCampLayer(3, minLng, minLat, maxLng, maxLat),
  ]);
  const combined = [...layer2, ...layer3];
  if (combined.length > 0) await setCached(key, combined);
  return combined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function blmAreaDisplayName(f: BlmOhvFeature): string {
  const p = f.properties;
  if (p.AREANAME) return p.AREANAME;
  if (p.AREATYPE) return p.AREATYPE;
  return "BLM OHV Area";
}

export function blmAreaAcres(f: BlmOhvFeature): string | null {
  const a = f.properties.GIS_ACRES;
  if (!a) return null;
  return a >= 1000
    ? `${(a / 1000).toFixed(1)}k acres`
    : `${Math.round(a).toLocaleString()} acres`;
}
