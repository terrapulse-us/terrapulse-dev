import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchBlmRecPoints, type BlmRecPoint } from "./blm-api";
import { fetchRidbHikingNear, type RidbFacility } from "./ridb-api";
import { fetchFromOverpassParallel } from "./osm-api";

// ─── Unified hiking POI data ──────────────────────────────────────────────────
// Merges four public sources into one deduplicated hiking-POI list (the same
// pattern as lib/campgrounds.ts):
//   • USFS EDW Recreation Opportunities — official trailheads (open status,
//     season, description). MARKERACTIVITY 'Trailhead' / 'Day Hiking'.
//   • RIDB (Recreation.gov) — federal trailhead facilities (rare but rich).
//   • BLM National Recreation points — Trail Head (14), Scenic Overlook (13),
//     Potable Water (11), Picnic Area (9) layers.
//   • OSM (Overpass) — trailheads, viewpoints, peaks, waterfalls, springs,
//     drinking water, shelters/huts, picnic sites. Densest coverage by far.
// USFS is treated as canonical for trailheads (season/status); OSM fills in
// everything the agencies don't map.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const USFS_BASE = "https://apps.fs.usda.gov/arcx/rest/services/EDW";
const USFS_REC_QUERY = `${USFS_BASE}/EDW_RecreationOpportunities_01/MapServer/0/query`;

export type HikingPoiSource = "usfs" | "ridb" | "blm" | "osm";
export type HikingPoiKind =
  | "trailhead"
  | "viewpoint"
  | "peak"
  | "waterfall"
  | "water"
  | "shelter"
  | "picnic";

export interface HikingPoi {
  id: string; // source-prefixed, e.g. "osm:node/123"
  name: string;
  lat: number;
  lng: number;
  kind: HikingPoiKind;
  sources: HikingPoiSource[];
  description: string | null;
  elevationFt: number | null; // peaks (from OSM `ele`, meters → ft)
  fee: string | null;
  season: string | null;
  openStatus: string | null;
  website: string | null;
  operator: string | null;
}

// ─── Cache helpers (same pattern as the other lib/*-api.ts files) ────────────

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
  } catch {
    /* ignore */
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function stripHtml(raw: string | null | undefined, cap = 600): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text ? text.slice(0, cap) : null;
}

function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Generic default names given to unnamed features — treated as wildcard
// matches during dedupe (an unnamed OSM trailhead 200 ft from a named USFS
// one is the same trailhead).
const DEFAULT_NAMES = new Set([
  "trailhead",
  "viewpoint",
  "peak",
  "waterfall",
  "spring",
  "drinking water",
  "shelter",
  "picnic area",
  "blm recreation site",
]);

// Normalize a POI name for duplicate matching: lowercase, strip punctuation
// and generic hiking words, collapse whitespace. (Dedupe additionally
// requires matching `kind`, so stripping kind words can't cross-merge a
// peak with a waterfall.)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(trailheads?|trail|head|overlooks?|viewpoints?|scenic|vista|point|peaks?|mount|mountain|mtn|falls?|waterfalls?|springs?|area|site|picnic|shelter|access)\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── USFS EDW Recreation Opportunities (trailheads) ──────────────────────────
// NOTE: f=json returns LOWERCASE attribute keys (recareaname, openstatus, …).

interface UsfsRecFeature {
  attributes: Record<string, unknown>;
  geometry?: { x: number; y: number };
}

async function fetchUsfsTrailheads(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<HikingPoi[]> {
  const envelope = JSON.stringify({
    xmin: minLng,
    ymin: minLat,
    xmax: maxLng,
    ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    where: "UPPER(MARKERACTIVITY) IN ('TRAILHEAD','DAY HIKING')",
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "RECAREAID,RECAREANAME,MARKERACTIVITY,RECAREADESCRIPTION,FORESTNAME,OPENSTATUS,OPEN_SEASON_START,OPEN_SEASON_END,FEEDESCRIPTION,RECAREAURL",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "200",
    f: "json",
  });
  try {
    const resp = await fetch(`${USFS_REC_QUERY}?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return [];
    const raw = (await resp.json()) as { features?: UsfsRecFeature[]; error?: unknown };
    if (raw.error || !Array.isArray(raw.features)) return [];
    return raw.features
      .filter((f) => f.geometry && Number.isFinite(f.geometry.x) && Number.isFinite(f.geometry.y))
      .map((f) => {
        const a = f.attributes;
        // USFS EDW returns the literal string "none" (or "N/A") for empty fields.
        const str = (k: string) => {
          const v = a[k];
          if (typeof v !== "string") return null;
          const t = v.trim();
          if (!t || /^(none|n\/a|null)$/i.test(t)) return null;
          return t;
        };
        const seasonStart = str("open_season_start");
        const seasonEnd = str("open_season_end");
        const forest = str("forestname");
        return {
          id: `usfs:${str("recareaid") ?? `${f.geometry!.x},${f.geometry!.y}`}`,
          name: str("recareaname") ?? "Trailhead",
          lat: f.geometry!.y,
          lng: f.geometry!.x,
          kind: "trailhead" as HikingPoiKind,
          sources: ["usfs"] as HikingPoiSource[],
          description: stripHtml(str("recareadescription")),
          elevationFt: null,
          fee: stripHtml(str("feedescription"), 200),
          season: seasonStart && seasonEnd ? `${seasonStart} – ${seasonEnd}` : seasonStart,
          openStatus: str("openstatus"),
          website: str("recareaurl"),
          operator: forest ? `USFS — ${forest}` : "US Forest Service",
        };
      });
  } catch {
    return [];
  }
}

// ─── OSM Overpass hiking POIs ─────────────────────────────────────────────────

interface OsmPoiElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function osmKind(t: Record<string, string>): HikingPoiKind | null {
  if (t.highway === "trailhead") return "trailhead";
  if (t.tourism === "viewpoint") return "viewpoint";
  if (t.natural === "peak") return "peak";
  if (t.waterway === "waterfall") return "waterfall";
  if (t.natural === "spring" || t.amenity === "drinking_water") return "water";
  if (t.amenity === "shelter" || t.tourism === "wilderness_hut") return "shelter";
  if (t.tourism === "picnic_site") return "picnic";
  return null;
}

const OSM_DEFAULT_NAMES: Record<HikingPoiKind, string> = {
  trailhead: "Trailhead",
  viewpoint: "Viewpoint",
  peak: "Peak",
  waterfall: "Waterfall",
  water: "Spring",
  shelter: "Shelter",
  picnic: "Picnic Area",
};

async function fetchOsmHikingPois(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<HikingPoi[]> {
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
  const query = [
    "[out:json][timeout:25];",
    "(",
    `  node["highway"="trailhead"](${bbox});`,
    `  node["tourism"="viewpoint"](${bbox});`,
    `  node["natural"="peak"](${bbox});`,
    `  node["waterway"="waterfall"](${bbox});`,
    `  node["natural"="spring"](${bbox});`,
    `  node["amenity"="drinking_water"](${bbox});`,
    `  node["amenity"="shelter"](${bbox});`,
    `  node["tourism"="wilderness_hut"](${bbox});`,
    `  node["tourism"="picnic_site"](${bbox});`,
    `  way["tourism"="picnic_site"](${bbox});`,
    ");",
    "out center tags 400;",
  ].join("\n");
  try {
    const resp = await fetchFromOverpassParallel(query);
    const raw = (await resp.json()) as { elements?: OsmPoiElement[] };
    return (raw.elements ?? [])
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat === undefined || lon === undefined) return null;
        const t = el.tags ?? {};
        const kind = osmKind(t);
        if (!kind) return null;
        // Bare mountain-pass/ridge shelters without any name or type detail
        // are usually just roofs — still useful, keep them.
        const eleMeters = t.ele ? parseFloat(t.ele) : NaN;
        const water = kind === "water" && t.amenity === "drinking_water";
        const descParts: string[] = [];
        if (t.description) descParts.push(t.description);
        if (kind === "water") {
          descParts.push(
            water
              ? "Drinking water source."
              : t.drinking_water === "yes"
                ? "Natural spring — marked as drinkable on OSM (treat before drinking)."
                : "Natural spring — treat or filter before drinking.",
          );
        }
        if (kind === "shelter" && t.shelter_type) descParts.push(`Shelter type: ${t.shelter_type.replace(/_/g, " ")}`);
        return {
          id: `osm:${el.type}/${el.id}`,
          name: t.name ?? (water ? "Drinking Water" : OSM_DEFAULT_NAMES[kind]),
          lat,
          lng: lon,
          kind,
          sources: ["osm"] as HikingPoiSource[],
          description: descParts.length > 0 ? descParts.join(" ").slice(0, 600) : null,
          elevationFt: Number.isFinite(eleMeters) ? Math.round(eleMeters * 3.28084) : null,
          fee: t.fee === "yes" ? "Fee area" : t.fee === "no" ? "Free" : null,
          season: t.seasonal && t.seasonal !== "no" ? `Seasonal (${t.seasonal})` : null,
          openStatus: null,
          website: t.website ?? t["contact:website"] ?? null,
          operator: t.operator ?? null,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  } catch {
    return [];
  }
}

// ─── RIDB → HikingPoi ─────────────────────────────────────────────────────────

function ridbToPoi(f: RidbFacility): HikingPoi | null {
  // RIDB's /facilities endpoint IGNORES the facilitytype query param (verified
  // live) — the HIKING activity filter returns campgrounds, permit offices,
  // etc. Keep only true trailhead facilities.
  if (f.FacilityTypeDescription !== "Trailhead") return null;
  const lat = f.FacilityLatitude || f.GEOJSON?.COORDINATES?.[1];
  const lng = f.FacilityLongitude || f.GEOJSON?.COORDINATES?.[0];
  if (!lat || !lng) return null;
  return {
    id: `ridb:${f.FacilityID}`,
    name: f.FacilityName,
    lat,
    lng,
    kind: "trailhead",
    sources: ["ridb"],
    description: stripHtml(f.FacilityDescription),
    elevationFt: null,
    fee: null,
    season: null,
    openStatus: null,
    website: null,
    operator: "Recreation.gov",
  };
}

// ─── BLM → HikingPoi ──────────────────────────────────────────────────────────

const BLM_LAYER_KINDS: Record<number, HikingPoiKind> = {
  14: "trailhead", // Trail Head
  13: "viewpoint", // Scenic Overlook
  11: "water", // Potable Water
  9: "picnic", // Picnic Area
};
export const BLM_HIKING_LAYERS = Object.keys(BLM_LAYER_KINDS).map(Number);

function blmToPoi(p: BlmRecPoint): HikingPoi | null {
  const kind = BLM_LAYER_KINDS[p.layer];
  if (!kind) return null;
  return {
    id: `blm:${p.layer}/${p.id}`,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    kind,
    sources: ["blm"],
    description: stripHtml(p.description),
    elevationFt: null,
    fee: null,
    season: null,
    openStatus: null,
    website: p.webLink,
    operator: p.state ? `BLM — ${p.state}` : "BLM",
  };
}

// ─── Merge & dedupe ───────────────────────────────────────────────────────────

function mergeInto(base: HikingPoi, extra: HikingPoi): void {
  if (!base.description && extra.description) base.description = extra.description;
  if (!base.elevationFt && extra.elevationFt) base.elevationFt = extra.elevationFt;
  if (!base.fee && extra.fee) base.fee = extra.fee;
  if (!base.season && extra.season) base.season = extra.season;
  if (!base.openStatus && extra.openStatus) base.openStatus = extra.openStatus;
  if (!base.website && extra.website) base.website = extra.website;
  if (!base.operator && extra.operator) base.operator = extra.operator;
  // Prefer a real name over a generic default.
  if (DEFAULT_NAMES.has(base.name.toLowerCase()) && !DEFAULT_NAMES.has(extra.name.toLowerCase())) {
    base.name = extra.name;
  }
  for (const s of extra.sources) {
    if (!base.sources.includes(s)) base.sources.push(s);
  }
}

// Duplicate when SAME KIND, within ~0.31 mi (≈500 m), AND names match
// (normalized equal / containment, or either side is an unnamed default).
// POIs sit much closer together than campgrounds, so the radius is tighter.
function isDuplicate(a: HikingPoi, b: HikingPoi): boolean {
  if (a.kind !== b.kind) return false;
  if (distanceMiles(a.lat, a.lng, b.lat, b.lng) > 0.31) return false;
  const aDefault = DEFAULT_NAMES.has(a.name.toLowerCase()) || a.name === "Drinking Water";
  const bDefault = DEFAULT_NAMES.has(b.name.toLowerCase()) || b.name === "Drinking Water";
  if (aDefault || bDefault) {
    // Unnamed features only merge when they're practically on top of each
    // other — unnamed springs/shelters legitimately cluster along a trail.
    return distanceMiles(a.lat, a.lng, b.lat, b.lng) < 0.09;
  }
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);
  if (!na || !nb) return distanceMiles(a.lat, a.lng, b.lat, b.lng) < 0.09;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function dedupeAndMerge(lists: HikingPoi[][]): HikingPoi[] {
  // Priority order: USFS (canonical trailheads — season/status) > RIDB > BLM > OSM.
  const merged: HikingPoi[] = [];
  for (const list of lists) {
    for (const cand of list) {
      const existing = merged.find((m) => isDuplicate(m, cand));
      if (existing) mergeInto(existing, cand);
      else merged.push(cand);
    }
  }
  return merged;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch hiking POIs from all four sources within `radiusMiles` of a point,
 * deduplicated and merged, sorted nearest-first. Partial results on source
 * failure (Promise.allSettled); returns [] only if every source fails.
 */
export async function fetchHikingPoisNear(
  lat: number,
  lng: number,
  radiusMiles = 25,
): Promise<HikingPoi[]> {
  const cacheKey = `hike_pois_v1_${lat.toFixed(2)}_${lng.toFixed(2)}_${radiusMiles}`;
  const cached = await getCached<HikingPoi[]>(cacheKey);
  if (cached) return cached;

  const deg = radiusMiles / 69.0;
  const [minLng, minLat, maxLng, maxLat] = [lng - deg, lat - deg, lng + deg, lat + deg];

  const [usfs, ridb, blm, osm] = await Promise.allSettled([
    fetchUsfsTrailheads(minLng, minLat, maxLng, maxLat),
    fetchRidbHikingNear(lat, lng, radiusMiles),
    fetchBlmRecPoints(BLM_HIKING_LAYERS, lat, lng, radiusMiles),
    fetchOsmHikingPois(minLng, minLat, maxLng, maxLat),
  ]);

  const usfsPois = usfs.status === "fulfilled" ? usfs.value : [];
  const ridbPois =
    ridb.status === "fulfilled"
      ? ridb.value.map(ridbToPoi).filter((p): p is HikingPoi => p !== null)
      : [];
  const blmPois =
    blm.status === "fulfilled"
      ? blm.value.map(blmToPoi).filter((p): p is HikingPoi => p !== null)
      : [];
  const osmPois = osm.status === "fulfilled" ? osm.value : [];

  const merged = dedupeAndMerge([usfsPois, ridbPois, blmPois, osmPois]);
  merged.sort(
    (a, b) => distanceMiles(lat, lng, a.lat, a.lng) - distanceMiles(lat, lng, b.lat, b.lng),
  );

  if (merged.length > 0) await setCached(cacheKey, merged);
  return merged;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const HIKING_POI_COLORS: Record<HikingPoiKind, string> = {
  trailhead: "#2E7D32", // green
  viewpoint: "#7B1FA2", // purple
  peak: "#455A64", // blue-grey
  waterfall: "#0277BD", // blue
  water: "#00838F", // teal
  shelter: "#6D4C41", // brown
  picnic: "#EF6C00", // orange
};

export const HIKING_POI_LABELS: Record<HikingPoiKind, string> = {
  trailhead: "TRAILHEAD",
  viewpoint: "VIEWPOINT",
  peak: "PEAK",
  waterfall: "WATERFALL",
  water: "WATER",
  shelter: "SHELTER",
  picnic: "PICNIC",
};

// MaterialCommunityIcons glyph per kind (all verified against the bundled glyphmap).
export const HIKING_POI_ICONS: Record<HikingPoiKind, string> = {
  trailhead: "hiking",
  viewpoint: "binoculars",
  peak: "image-filter-hdr",
  waterfall: "waterfall",
  water: "water-pump",
  shelter: "home-roof",
  picnic: "table-picnic",
};

export const HIKING_POI_KINDS: HikingPoiKind[] = [
  "trailhead",
  "viewpoint",
  "peak",
  "waterfall",
  "water",
  "shelter",
  "picnic",
];

export function hikingPoiSourceLabel(p: HikingPoi): string {
  const names: Record<HikingPoiSource, string> = {
    usfs: "USFS",
    ridb: "Recreation.gov",
    blm: "BLM",
    osm: "OpenStreetMap",
  };
  return p.sources.map((s) => names[s]).join(" + ");
}

/** Info chips for the detail sheet (elevation, fee, season). */
export function hikingPoiChips(p: HikingPoi): string[] {
  const chips: string[] = [];
  if (p.elevationFt) chips.push(`⛰ ${p.elevationFt.toLocaleString()} ft`);
  if (p.fee) chips.push(`💵 ${p.fee}`);
  if (p.season) chips.push(`📅 ${p.season}`);
  return chips;
}
