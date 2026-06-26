import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── USFS ArcGIS REST API ──────────────────────────────────────────────────────
// Motor Vehicle Use Map (MVUM) — free, public US Forest Service data
// Contains thousands of miles of motorized OHV/4x4/ATV/moto trails & roads
const USFS_BASE = "https://apps.fs.usda.gov/arcx/rest/services/EDW";
const MVUM_TRAILS = `${USFS_BASE}/EDW_MotorVehicleUse_01/MapServer/1/query`; // Non-road motorized trails
const MVUM_ROADS  = `${USFS_BASE}/EDW_MotorVehicleUse_01/MapServer/0/query`; // 4x4-accessible forest roads

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsfsFeature {
  type: "Feature";
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: number[][] | number[][][];
  };
  properties: {
    TRAIL_NO?: string;
    TRAIL_NAME?: string;
    ALLOWED_TERRA_USE?: string;
    SURFACE_TYPE?: string;
    RTE_SY_GRP_NM?: string;
    GIS_MILES?: number;
    [key: string]: unknown;
  };
}

export interface UsfsCollection {
  type: "FeatureCollection";
  features: UsfsFeature[];
}

// USFS ALLOWED_TERRA_USE codes → human-readable labels
const TERRA_USE_LABELS: Record<string, string> = {
  C: "All-terrain vehicles",
  D: "Motorcycles",
  H: "Hiker / Horse",
  J: "Jeep-type vehicles",
  M: "Motorized vehicles",
  N: "Non-motorized",
  S: "Snowmobile",
  W: "All vehicles",
};

export function formatTerraUse(code: string | undefined): string {
  if (!code) return "Motorized";
  return code
    .split(",")
    .map((c) => TERRA_USE_LABELS[c.trim()] ?? c.trim())
    .join(" · ");
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

function boundsKey(tag: string, minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  return `usfs_${tag}_${minLng.toFixed(2)}_${minLat.toFixed(2)}_${maxLng.toFixed(2)}_${maxLat.toFixed(2)}`;
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function queryLayer(
  url: string,
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<UsfsCollection> {
  const envelope = JSON.stringify({
    xmin: minLng, ymin: minLat, xmax: maxLng, ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "TRAIL_NO,TRAIL_NAME,ALLOWED_TERRA_USE,SURFACE_TYPE,RTE_SY_GRP_NM,GIS_MILES",
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    where: "1=1",
    resultRecordCount: "500",
  });
  const resp = await fetch(`${url}?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`USFS API error ${resp.status}`);
  const json = await resp.json() as UsfsCollection;
  return json;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all USFS motorized trails + 4x4-accessible roads within a bounding box.
 * Results are cached for 24 hours so repeated calls are instant.
 */
export async function fetchUsfsTrailsInBounds(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
): Promise<UsfsCollection> {
  const key = boundsKey("bounds", minLng, minLat, maxLng, maxLat);
  const cached = await getCached<UsfsCollection>(key);
  if (cached) return cached;

  const [trails, roads] = await Promise.allSettled([
    queryLayer(MVUM_TRAILS, minLng, minLat, maxLng, maxLat),
    queryLayer(MVUM_ROADS,  minLng, minLat, maxLng, maxLat),
  ]);

  const features: UsfsFeature[] = [
    ...(trails.status === "fulfilled" ? trails.value.features : []),
    ...(roads.status  === "fulfilled" ? roads.value.features  : []),
  ];

  const combined: UsfsCollection = { type: "FeatureCollection", features };
  await setCached(key, combined);
  return combined;
}

/**
 * Fetch USFS trails within `radiusMiles` of a lat/lng point.
 */
export async function fetchUsfsRouteNear(
  lat: number, lng: number, radiusMiles = 8,
): Promise<UsfsCollection> {
  const deg = radiusMiles / 69.0;
  return fetchUsfsTrailsInBounds(lng - deg, lat - deg, lng + deg, lat + deg);
}

/**
 * Extract the longest continuous LineString from a collection as
 * `{ lat, lng }[]` suitable for the app's navigation system.
 * Returns null if no usable geometry is found.
 */
export function extractBestRoute(
  collection: UsfsCollection,
): Array<{ lat: number; lng: number }> | null {
  if (!collection.features.length) return null;

  let best: number[][] = [];

  for (const f of collection.features) {
    const { geometry } = f;
    if (!geometry) continue;

    let segments: number[][] = [];
    if (geometry.type === "LineString") {
      segments = geometry.coordinates as number[][];
    } else if (geometry.type === "MultiLineString") {
      segments = (geometry.coordinates as number[][][]).flat();
    }
    if (segments.length > best.length) best = segments;
  }

  if (best.length < 2) return null;
  return best.map(([lng, lat]) => ({ lat, lng }));
}

/**
 * Get the first coordinate of a USFS feature (for placing map markers).
 */
export function featureStartCoord(
  f: UsfsFeature,
): [number, number] | null {
  const { geometry } = f;
  if (!geometry) return null;
  if (geometry.type === "LineString") {
    const c = (geometry.coordinates as number[][])[0];
    return c ? [c[0], c[1]] : null;
  }
  if (geometry.type === "MultiLineString") {
    const c = (geometry.coordinates as number[][][])[0]?.[0];
    return c ? [c[0], c[1]] : null;
  }
  return null;
}

/**
 * Give a USFS feature a display name, falling back gracefully.
 */
export function featureDisplayName(f: UsfsFeature): string {
  const p = f.properties;
  if (p.TRAIL_NAME) return p.TRAIL_NAME;
  if (p.TRAIL_NO)   return `Trail #${p.TRAIL_NO}`;
  if (p.RTE_SY_GRP_NM) return p.RTE_SY_GRP_NM;
  return "USFS Route";
}
