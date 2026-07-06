// Node-side port of artifacts/mobile/lib/usfs-api.ts query logic (no AsyncStorage/caching;
// this runs once per trail during the offline pipeline, not from the app).
import type { LatLng } from "./geo";

const USFS_BASE = "https://apps.fs.usda.gov/arcx/rest/services/EDW";
const MVUM_TRAILS = `${USFS_BASE}/EDW_MVUM_02/MapServer/2/query`;
const MVUM_ROADS = `${USFS_BASE}/EDW_MVUM_02/MapServer/1/query`;
const NFS_TRAIL_URL = `${USFS_BASE}/EDW_TrailNFSPublish_01/MapServer/0/query`;

export interface UsfsRawFeature {
  type: "Feature";
  geometry: { type: "LineString" | "MultiLineString"; coordinates: number[][] | number[][][] } | null;
  properties: Record<string, unknown>;
}

interface UsfsRawCollection {
  features: UsfsRawFeature[];
}

async function queryEnvelope(
  url: string,
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<UsfsRawFeature[]> {
  const envelope = JSON.stringify({
    xmin: minLng,
    ymin: minLat,
    xmax: maxLng,
    ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    where: "1=1",
    resultRecordCount: "500",
  });
  const resp = await fetch(`${url}?${params}`, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`USFS API error ${resp.status} for ${url}`);
  const json = (await resp.json()) as UsfsRawCollection;
  return json.features ?? [];
}

export interface UsfsQueryResult {
  source: "usfs-mvum-trail" | "usfs-mvum-road" | "usfs-nfs";
  features: UsfsRawFeature[];
}

/** Query all three USFS layers within a bbox. Failures in one layer don't block the others. */
export async function queryUsfsAll(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<UsfsQueryResult[]> {
  const [trails, roads, nfs] = await Promise.allSettled([
    queryEnvelope(MVUM_TRAILS, minLng, minLat, maxLng, maxLat),
    queryEnvelope(MVUM_ROADS, minLng, minLat, maxLng, maxLat),
    queryEnvelope(NFS_TRAIL_URL, minLng, minLat, maxLng, maxLat),
  ]);
  const out: UsfsQueryResult[] = [];
  if (trails.status === "fulfilled") out.push({ source: "usfs-mvum-trail", features: trails.value });
  if (roads.status === "fulfilled") out.push({ source: "usfs-mvum-road", features: roads.value });
  if (nfs.status === "fulfilled") out.push({ source: "usfs-nfs", features: nfs.value });
  return out;
}

export function usfsFeatureName(f: UsfsRawFeature): string {
  const p = f.properties;
  return (
    (p.name as string) ||
    (p.trail_name as string) ||
    (p.TRAIL_NAME as string) ||
    (p.forestname as string) ||
    ""
  );
}

/** Extract every linear part of a feature as LatLng[] (MultiLineString parts kept separate). */
export function usfsFeatureParts(f: UsfsRawFeature): LatLng[][] {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === "LineString") {
    return [(g.coordinates as number[][]).map(([lng, lat]) => ({ lat, lng }))];
  }
  if (g.type === "MultiLineString") {
    return (g.coordinates as number[][][]).map((seg) => seg.map(([lng, lat]) => ({ lat, lng })));
  }
  return [];
}

/** Mile-point fields used to order/chain segments belonging to the same named trail, when present. */
export function usfsBeginMilePoint(f: UsfsRawFeature): number | null {
  const p = f.properties;
  const v = p.bmp ?? p.BMP ?? p.begin_point;
  return typeof v === "number" ? v : null;
}
