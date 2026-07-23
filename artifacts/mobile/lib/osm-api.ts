import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ─── OpenStreetMap trail data ──────────────────────────────────────────────────
// Primary: API server proxy (single reliable GET from the app).
// Fallback: race ALL Overpass endpoints simultaneously with Promise.any() —
// takes the first successful response rather than trying endpoints in series.
// AbortController is NOT used because it is unreliable on Android New Arch.

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PROXY_TIMEOUT_MS = 10_000;
const OVERPASS_TIMEOUT_MS = 25_000;

export interface OsmFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: number[][] };
  properties: {
    id: number;
    name?: string;
    highway?: string;
    surface?: string;
    "4wd_only"?: string;
    tracktype?: string;
    access?: string;
    motor_vehicle?: string;
    sac_scale?: string;
    [key: string]: unknown;
  };
}

export interface OsmCollection {
  type: "FeatureCollection";
  features: OsmFeature[];
}

interface OsmOverpassNode {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

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

function getApiBase(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const url = extra?.apiServerUrl as string | undefined;
  return url?.replace(/\/$/, "") ?? "";
}

function buildOverpassQuery(bbox: string): string {
  return [
    "[out:json][timeout:25];",
    "(",
    `  way["highway"="track"]["access"!~"^(private|no)$"](${bbox});`,
    `  way["4wd_only"="yes"](${bbox});`,
    `  way["highway"="path"]["motor_vehicle"~"^(yes|permissive|designated)$"](${bbox});`,
    `  way["atv"~"^(yes|permissive|designated)$"](${bbox});`,
    `  way["highway"~"^(track|path|service)$"]["surface"~"^(unpaved|dirt|gravel|ground|sand|rock|earth)$"]["access"!~"^(private|no)$"](${bbox});`,
    ");",
    "out geom;",
  ].join("\n");
}

function elementsToCollection(elements: OsmOverpassNode[]): OsmCollection {
  const features: OsmFeature[] = elements
    .filter(
      (el): el is OsmOverpassNode & Required<Pick<OsmOverpassNode, "geometry">> =>
        el.type === "way" &&
        Array.isArray(el.geometry) &&
        el.geometry.length >= 2,
    )
    .map((el) => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: el.geometry!.map((n) => [n.lon, n.lat]),
      },
      properties: {
        id: el.id,
        ...(el.tags ?? {}),
      },
    }));
  return { type: "FeatureCollection", features };
}

function makeTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms),
  );
}

export async function fetchFromOverpassParallel(query: string): Promise<Response> {
  const body = `data=${encodeURIComponent(query)}`;
  return Promise.race([
    Promise.any(
      OVERPASS_URLS.map((url) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        }).then((r) => {
          if (r.ok) return r;
          throw new Error(`${url}: ${r.status}`);
        }),
      ),
    ),
    makeTimeout(OVERPASS_TIMEOUT_MS),
  ]);
}

export async function fetchOsmTrailsNear(
  lat: number,
  lng: number,
  radiusMiles = 5,
): Promise<OsmCollection> {
  const deg = radiusMiles / 69.0;
  const minLat = lat - deg, maxLat = lat + deg;
  const minLng = lng - deg, maxLng = lng + deg;

  const key = `osm_v4_${minLat.toFixed(2)}_${minLng.toFixed(2)}_${maxLat.toFixed(2)}_${maxLng.toFixed(2)}`;
  const cached = await getCached<OsmCollection>(key);
  if (cached) return cached;

  // ── 1. Try API server proxy ────────────────────────────────────────────────
  const base = getApiBase();
  if (base) {
    try {
      const proxyUrl = `${base}/api/osm-trails?lat=${lat}&lng=${lng}&radius=${radiusMiles}`;
      const resp = await Promise.race([
        fetch(proxyUrl),
        makeTimeout(PROXY_TIMEOUT_MS),
      ]);
      if (resp.ok) {
        const collection = (await resp.json()) as OsmCollection;
        await setCached(key, collection);
        return collection;
      }
    } catch {
      // proxy unreachable or timed out — fall through
    }
  }

  // ── 2. Race all Overpass endpoints simultaneously ──────────────────────────
  // Promise.any takes the first success. No AbortController — unreliable on
  // Android New Architecture. Promise.race with a timeout handles cancellation.
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
  const query = buildOverpassQuery(bbox);

  const resp = await fetchFromOverpassParallel(query);
  const json = (await Promise.race([
    resp.json() as Promise<{ elements: OsmOverpassNode[] }>,
    makeTimeout(10_000),
  ]));
  const collection = elementsToCollection(json.elements);
  await setCached(key, collection);
  return collection;
}

export function osmFeatureDisplayName(f: OsmFeature): string {
  const p = f.properties;
  if (p.name) return p.name;
  if (p["4wd_only"] === "yes") return `4WD Track`;
  if (p.highway === "track") {
    const grade = p.tracktype ? ` (${p.tracktype.replace("grade", "Grade ")})` : "";
    return `Off-Road Track${grade}`;
  }
  if (p.highway === "path") return "OHV Path";
  return "Unpaved Road";
}

export function osmFeatureSurface(f: OsmFeature): string {
  const s = f.properties.surface as string | undefined;
  if (!s) return "Unpaved";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

export function osmFeatureType(f: OsmFeature): string {
  const p = f.properties;
  if (p["4wd_only"] === "yes") return "4WD Only";
  if (p.motor_vehicle === "designated") return "Designated OHV";
  if (p.highway === "track") return "Off-Road Track";
  if (p.highway === "path") return "Trail Path";
  return "Unpaved Road";
}

export function osmFeatureStartCoord(f: OsmFeature): [number, number] | null {
  const c = f.geometry.coordinates[0];
  return c ? [c[0], c[1]] : null;
}

export function osmFeatureEndCoord(f: OsmFeature): [number, number] | null {
  const coords = f.geometry.coordinates;
  const c = coords[coords.length - 1];
  return c ? [c[0], c[1]] : null;
}

export function osmExtractRoute(f: OsmFeature): Array<{ lat: number; lng: number }> {
  return f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

export function osmFeatureLengthMiles(f: OsmFeature): number | null {
  const coords = f.geometry.coordinates;
  if (coords.length < 2) return null;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const R = 3958.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return parseFloat(total.toFixed(2));
}
