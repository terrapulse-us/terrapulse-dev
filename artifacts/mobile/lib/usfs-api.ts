import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── USFS ArcGIS REST API ──────────────────────────────────────────────────────
// Motor Vehicle Use Map (MVUM) — free, public US Forest Service data
// Contains thousands of miles of motorized OHV/4x4/ATV/moto trails & roads
//
// NOTE: USFS retired the old EDW_MotorVehicleUse_01 / EDW_TrailNFS_01 services.
// Current service names (verified against the live EDW catalog): EDW_MVUM_02
// (roads = layer 1, trails = layer 2) and EDW_TrailNFSPublish_01 (layer 0).
// The new services also renamed every field to lowercase and, for MVUM, replaced
// the old single ALLOWED_TERRA_USE code with per-vehicle-type status fields
// (e.g. `atv: "open"`, `motorcycle: "closed"`). `queryLayer`/`queryNfsLayer`
// below translate the new schema back into the old UPPER_CASE property names
// the rest of the app (trail-guide.ts) already expects.
const USFS_BASE = "https://apps.fs.usda.gov/arcx/rest/services/EDW";
const MVUM_TRAILS = `${USFS_BASE}/EDW_MVUM_02/MapServer/2/query`; // Non-road motorized trails
const MVUM_ROADS  = `${USFS_BASE}/EDW_MVUM_02/MapServer/1/query`; // 4x4-accessible forest roads

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

// ─── New-schema → old-schema property translation ──────────────────────────────
// The current MVUM services (EDW_MVUM_02) dropped ALLOWED_TERRA_USE in favor of
// per-vehicle status fields like `atv: "open"`/`atv: "closed"`. We derive a
// human-readable summary here, preferring the API's own `mvum_symbol_name`
// (e.g. "Wheeled OHV <50\", Yearlong") when present since it's authoritative.
function isOpen(v: unknown): boolean {
  return typeof v === "string" && v.trim().toLowerCase() === "open";
}

function deriveMvumUse(p: Record<string, unknown>): string {
  if (typeof p.mvum_symbol_name === "string" && p.mvum_symbol_name) {
    return p.mvum_symbol_name;
  }
  const uses: string[] = [];
  if (isOpen(p.atv)) uses.push("ATV");
  if (isOpen(p.motorcycle)) uses.push("Motorcycle");
  if (isOpen(p.fourwd_gt50inches)) uses.push("4WD");
  if (isOpen(p.twowd_gt50inches)) uses.push("2WD >50in");
  if (isOpen(p.tracked_ohv_gt50inches) || isOpen(p.tracked_ohv_lt50inches)) uses.push("Tracked OHV");
  if (isOpen(p.other_ohv_gt50inches) || isOpen(p.other_ohv_lt50inches) || isOpen(p.otherwheeled_ohv)) uses.push("Other OHV");
  if (isOpen(p.passengervehicle)) uses.push("Passenger Vehicle");
  if (isOpen(p.highclearancevehicle)) uses.push("High-Clearance Vehicle");
  if (isOpen(p.truck)) uses.push("Truck");
  return uses.length ? uses.join(", ") : "Motorized";
}

// Translate a raw MVUM (EDW_MVUM_02) feature's lowercase properties into the
// old UPPER_CASE shape the rest of the app expects, without touching geometry.
function translateMvumFeature(raw: UsfsFeature): UsfsFeature {
  const p = raw.properties as Record<string, unknown>;
  return {
    ...raw,
    properties: {
      ...p,
      TRAIL_NO: (p.id as string) ?? undefined,
      TRAIL_NAME: (p.name as string) ?? undefined,
      ALLOWED_TERRA_USE: deriveMvumUse(p),
      SURFACE_TYPE: (p.surfacetype as string) ?? undefined,
      RTE_SY_GRP_NM: (p.forestname as string) ?? (p.districtname as string) ?? undefined,
      GIS_MILES: typeof p.gis_miles === "number" ? p.gis_miles : undefined,
    },
  };
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
    // Roads (layer 1) and trails (layer 2) have different field sets on the new
    // EDW_MVUM_02 service, so request everything and translate afterwards
    // rather than maintaining two per-layer outFields lists.
    outFields: "*",
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
  return { type: "FeatureCollection", features: json.features.map(translateMvumFeature) };
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

    if (geometry.type === "LineString") {
      const segment = geometry.coordinates as number[][];
      if (segment.length > best.length) best = segment;
    } else if (geometry.type === "MultiLineString") {
      // A MultiLineString is a set of *disconnected* parts (gaps, road crossings,
      // etc.) — never flatten them into one array, or a straight line gets drawn
      // between unrelated endpoints. Pick the single longest continuous part instead.
      for (const segment of geometry.coordinates as number[][][]) {
        if (segment.length > best.length) best = segment;
      }
    }
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

// ─── USFS National Forest System (NFS) Trail Database ─────────────────────────
// Covers ALL national forest trails (motorized + non-motorized), not just MVUM.
// Vastly larger dataset — 158,000+ miles of named, classified trails.
//
// EDW_TrailNFS_01 was retired; EDW_TrailNFSPublish_01 (layer 0) is the current
// replacement. Its `allowed_terra_use` is a numeric code (e.g. "321") with no
// published decode table, so we no longer trust it directly — we derive a
// best-effort human summary from the per-vehicle *_managed fields instead
// (see `deriveNfsUse` below).
const NFS_TRAIL_URL = `${USFS_BASE}/EDW_TrailNFSPublish_01/MapServer/0/query`;

export interface UsfsNfsFeature {
  type: "Feature";
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: number[][] | number[][][];
  };
  properties: {
    TRAIL_CN?: string;
    TRAIL_NAME?: string;
    TRAIL_NO?: string;
    TRAIL_TYPE?: string;        // "TERRA" | "SNOW" | "WATER"
    SURFACE_TYPE?: string;
    TRAIL_CLASS?: string;       // "TC1"–"TC5" (TC1 = primitive, TC5 = fully accessible)
    ALLOWED_TERRA_USE?: string; // same vehicle-use codes as MVUM
    MANAGING_ORG?: string;
    GIS_MILES?: number;
    ACCESSIBILITY_STATUS?: string;
    [key: string]: unknown;
  };
}

export interface UsfsNfsCollection {
  type: "FeatureCollection";
  features: UsfsNfsFeature[];
}

// Best-effort human summary of NFS allowed use, derived from the per-vehicle
// `*_managed` fields (presence = the use is actively managed/accepted on this
// segment). `allowed_terra_use` itself is now an undocumented numeric code
// (e.g. "321"), so we don't attempt to decode it.
function deriveNfsUse(p: Record<string, unknown>): string | undefined {
  const vehicles: Array<[string, string]> = [
    ["motorcycle_managed", "Motorcycle"],
    ["atv_managed", "ATV"],
    ["fourwd_managed", "4WD"],
    ["bicycle_managed", "Bicycle"],
    ["pack_saddle_managed", "Pack/Saddle"],
    ["hiker_pedestrian_managed", "Hiker"],
    ["snowmobile_managed", "Snowmobile"],
  ];
  const uses = vehicles.filter(([field]) => p[field]).map(([, label]) => label);
  if (uses.length) return uses.join(", ");
  if (p.terra_motorized === "Y") return "Motorized";
  if (p.terra_motorized === "N") return "Non-Motorized";
  return undefined;
}

// Translate a raw EDW_TrailNFSPublish_01 feature's lowercase properties into
// the old UPPER_CASE shape the rest of the app expects, without touching geometry.
function translateNfsFeature(raw: UsfsNfsFeature): UsfsNfsFeature {
  const p = raw.properties as Record<string, unknown>;
  return {
    ...raw,
    properties: {
      ...p,
      TRAIL_CN: (p.trail_cn as string) ?? undefined,
      TRAIL_NAME: (p.trail_name as string) ?? undefined,
      TRAIL_NO: (p.trail_no as string) ?? undefined,
      TRAIL_TYPE: (p.trail_type as string) ?? undefined,
      SURFACE_TYPE: (p.trail_surface as string) ?? undefined,
      TRAIL_CLASS: (p.trail_class as string) ?? undefined,
      ALLOWED_TERRA_USE: deriveNfsUse(p),
      MANAGING_ORG: (p.managing_org as string) ?? undefined,
      GIS_MILES: typeof p.gis_miles === "number" ? p.gis_miles : undefined,
      ACCESSIBILITY_STATUS: (p.accessibility_status as string) ?? undefined,
    },
  };
}

async function queryNfsLayer(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
  where = "1=1",
): Promise<UsfsNfsCollection> {
  const envelope = JSON.stringify({
    xmin: minLng, ymin: minLat, xmax: maxLng, ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    // Field set is large and varies by attributesubset; request everything and
    // translate afterwards (see translateNfsFeature).
    outFields: "*",
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    where,
    resultRecordCount: "500",
  });
  const resp = await fetch(`${NFS_TRAIL_URL}?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`USFS NFS API error ${resp.status}`);
  const json = (await resp.json()) as UsfsNfsCollection;
  return { type: "FeatureCollection", features: json.features.map(translateNfsFeature) };
}

/**
 * Fetch NFS trail system records within a bounding box.
 * Optionally filter to motorized-capable trails only.
 */
export async function fetchUsfsNfsInBounds(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
  motorizedOnly = false,
): Promise<UsfsNfsCollection> {
  const key = `nfs_${motorizedOnly ? "moto" : "all"}_${minLng.toFixed(2)}_${minLat.toFixed(2)}_${maxLng.toFixed(2)}_${maxLat.toFixed(2)}`;
  const cached = await getCached<UsfsNfsCollection>(key);
  if (cached) return cached;

  const where = motorizedOnly
    ? "trail_type='TERRA' AND allowed_terra_use IS NOT NULL"
    : "trail_type='TERRA'";

  const data = await queryNfsLayer(minLng, minLat, maxLng, maxLat, where);
  await setCached(key, data);
  return data;
}

/**
 * Fetch NFS trails within `radiusMiles` of a lat/lng point.
 */
export async function fetchUsfsNfsNear(
  lat: number, lng: number, radiusMiles = 8, motorizedOnly = false,
): Promise<UsfsNfsCollection> {
  const deg = radiusMiles / 69.0;
  return fetchUsfsNfsInBounds(lng - deg, lat - deg, lng + deg, lat + deg, motorizedOnly);
}

export function nfsFeatureDisplayName(f: UsfsNfsFeature): string {
  const p = f.properties;
  if (p.TRAIL_NAME) return p.TRAIL_NAME;
  if (p.TRAIL_NO) return `NFS Trail #${p.TRAIL_NO}`;
  if (p.TRAIL_CN) return `Trail ${p.TRAIL_CN}`;
  return "NFS Trail";
}

export function nfsTrailClass(f: UsfsNfsFeature): string {
  const tc = f.properties.TRAIL_CLASS;
  const map: Record<string, string> = {
    TC1: "Primitive", TC2: "Simple", TC3: "Developed",
    TC4: "Accessible", TC5: "Fully Accessible",
  };
  return tc ? (map[tc] ?? tc) : "Unclassified";
}

export function nfsFeatureStartCoord(f: UsfsNfsFeature): [number, number] | null {
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

export function nfsExtractRoute(f: UsfsNfsFeature): Array<{ lat: number; lng: number }> {
  const { geometry } = f;
  if (!geometry) return [];
  if (geometry.type === "LineString") {
    return (geometry.coordinates as number[][]).map(([lng, lat]) => ({ lat, lng }));
  }
  if (geometry.type === "MultiLineString") {
    // Same rule as extractBestRoute: parts of a MultiLineString are disconnected —
    // flattening them would draw a straight line across the gap. Use the longest part.
    let best: number[][] = [];
    for (const segment of geometry.coordinates as number[][][]) {
      if (segment.length > best.length) best = segment;
    }
    return best.map(([lng, lat]) => ({ lat, lng }));
  }
  return [];
}
