import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── BLM (Bureau of Land Management) ArcGIS REST Services ────────────────────
// Free, public federal data. Provides:
//   • Surface Management Agency (SMA) raster tiles — shows who manages the land
//   • OHV designated area polygons — where motorized use is designated

const BLM_BASE = "https://gis.blm.gov/arcgis/rest/services";

// Raster tile URL for land surface management status overlay
// Colors indicate: BLM (tan), USFS (green), NPS (purple), State (blue), Private (grey)
export const BLM_SMA_TILES = [
  `${BLM_BASE}/lands/BLM_Natl_SMA_Limited_Areas/MapServer/tile/{z}/{y}/{x}`,
];

// OHV designated areas polygon layer
const BLM_OHV_AREAS_URL = `${BLM_BASE}/recreation/BLM_Natl_OHV_Areas/MapServer/0/query`;

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
  const key = `blm_ohv_${minLng.toFixed(2)}_${minLat.toFixed(2)}_${maxLng.toFixed(2)}_${maxLat.toFixed(2)}`;
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
    outFields: "AREANAME,AREATYPE,ADMINST,GIS_ACRES",
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    where: "1=1",
    resultRecordCount: "200",
  });

  const resp = await fetch(`${BLM_OHV_AREAS_URL}?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`BLM API error ${resp.status}`);

  const json = (await resp.json()) as BlmOhvCollection;
  await setCached(key, json);
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
