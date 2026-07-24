import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchBlmCampgrounds, type BlmCampground } from "./blm-api";
import { fetchRidbCampsNear, type RidbFacility } from "./ridb-api";
import { fetchFromOverpassParallel } from "./osm-api";

// ─── Unified campground data ──────────────────────────────────────────────────
// Merges four public sources into one deduplicated campground list:
//   • RIDB (Recreation.gov) — reservable federal campgrounds, richest metadata
//   • USFS EDW Recreation Opportunities — season dates, open status, fees
//   • BLM National Recreation points — developed + primitive BLM sites
//   • OSM (Overpass) — small/dispersed sites + amenity tags the feds miss
// RIDB is treated as the canonical record when sources overlap (it carries the
// reservation link); other sources enrich it with season/fee/amenity data.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const USFS_BASE = "https://apps.fs.usda.gov/arcx/rest/services/EDW";
const USFS_REC_QUERY = `${USFS_BASE}/EDW_RecreationOpportunities_01/MapServer/0/query`;

export type CampgroundSource = "ridb" | "usfs" | "blm" | "osm";
export type CampgroundKind = "developed" | "dispersed" | "reservable";

export interface CampgroundAmenities {
  toilets?: boolean;
  water?: boolean;
  showers?: boolean;
  fires?: boolean;
  tables?: boolean;
  rv?: boolean;
  tents?: boolean;
}

export interface Campground {
  id: string; // source-prefixed, e.g. "ridb:232447"
  name: string;
  lat: number;
  lng: number;
  kind: CampgroundKind;
  sources: CampgroundSource[];
  description: string | null;
  amenities: CampgroundAmenities;
  fee: string | null;
  season: string | null; // e.g. "05/15 – 09/30"
  openStatus: string | null; // e.g. "Open", "Closed"
  reservationUrl: string | null;
  reservationInfo: string | null;
  phone: string | null;
  website: string | null;
  operator: string | null; // e.g. "USFS — Manti-La Sal NF"
  capacity: string | null;
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

// Normalize a campground name for duplicate matching: lowercase, strip
// punctuation and generic camping words, collapse whitespace.
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(campgrounds?|campsites?|camping|camp|area|recreation|rec|site)\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── USFS EDW Recreation Opportunities ────────────────────────────────────────
// NOTE: f=json returns LOWERCASE attribute keys (recareaname, openstatus, …).

interface UsfsRecFeature {
  attributes: Record<string, unknown>;
  geometry?: { x: number; y: number };
}

async function fetchUsfsCampgrounds(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<Campground[]> {
  const envelope = JSON.stringify({
    xmin: minLng,
    ymin: minLat,
    xmax: maxLng,
    ymax: maxLat,
    spatialReference: { wkid: 4326 },
  });
  const params = new URLSearchParams({
    where: "UPPER(MARKERACTIVITY) LIKE '%CAMP%'",
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "RECAREAID,RECAREANAME,MARKERACTIVITY,RECAREADESCRIPTION,FORESTNAME,OPENSTATUS,OPEN_SEASON_START,OPEN_SEASON_END,RESERVATION_INFO,FEEDESCRIPTION,RECAREAURL",
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
        const activity = str("markeractivity") ?? "";
        const dispersed = /dispersed/i.test(activity);
        const seasonStart = str("open_season_start");
        const seasonEnd = str("open_season_end");
        const forest = str("forestname");
        return {
          id: `usfs:${str("recareaid") ?? `${f.geometry!.x},${f.geometry!.y}`}`,
          name: str("recareaname") ?? "Forest Service Campground",
          lat: f.geometry!.y,
          lng: f.geometry!.x,
          kind: (dispersed ? "dispersed" : "developed") as CampgroundKind,
          sources: ["usfs"] as CampgroundSource[],
          description: stripHtml(str("recareadescription")),
          amenities: {},
          fee: stripHtml(str("feedescription"), 200),
          season: seasonStart && seasonEnd ? `${seasonStart} – ${seasonEnd}` : seasonStart,
          openStatus: str("openstatus"),
          reservationUrl: null,
          reservationInfo: stripHtml(str("reservation_info"), 300),
          phone: null,
          website: str("recareaurl"),
          operator: forest ? `USFS — ${forest}` : "US Forest Service",
          capacity: null,
        };
      });
  } catch {
    return [];
  }
}

// ─── OSM Overpass camp sites ──────────────────────────────────────────────────

interface OsmCampElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function osmBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v !== "no" && v !== "none";
}

async function fetchOsmCampsites(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<Campground[]> {
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
  const query = [
    "[out:json][timeout:25];",
    "(",
    `  node["tourism"="camp_site"](${bbox});`,
    `  way["tourism"="camp_site"](${bbox});`,
    ");",
    "out center tags 200;",
  ].join("\n");
  try {
    const resp = await fetchFromOverpassParallel(query);
    const raw = (await resp.json()) as { elements?: OsmCampElement[] };
    return (raw.elements ?? [])
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat === undefined || lon === undefined) return null;
        const t = el.tags ?? {};
        const amenities: CampgroundAmenities = {
          toilets: osmBool(t.toilets),
          water: osmBool(t.drinking_water),
          showers: osmBool(t.shower),
          fires: osmBool(t.openfire),
          tables: osmBool(t.picnic_table),
          rv: osmBool(t.caravans),
          tents: osmBool(t.tents),
        };
        const hasAmenity = Object.values(amenities).some((v) => v === true);
        const dispersed = t.backcountry === "yes" || (!hasAmenity && t.fee !== "yes");
        const fee =
          t.charge ?? (t.fee === "yes" ? "Fee area" : t.fee === "no" ? "Free" : null);
        return {
          id: `osm:${el.type}/${el.id}`,
          name: t.name ?? "Campsite",
          lat,
          lng: lon,
          kind: (dispersed ? "dispersed" : "developed") as CampgroundKind,
          sources: ["osm"] as CampgroundSource[],
          description: stripHtml(t.description ?? t.note ?? null),
          amenities,
          fee,
          season: null,
          openStatus: null,
          reservationUrl: null,
          reservationInfo:
            t.reservation === "required"
              ? "Reservation required"
              : t.reservation === "yes"
                ? "Reservations accepted"
                : null,
          phone: t.phone ?? t["contact:phone"] ?? null,
          website: t.website ?? t["contact:website"] ?? null,
          operator: t.operator ?? null,
          capacity: t.capacity ?? t.maxtents ?? null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  } catch {
    return [];
  }
}

// ─── RIDB → Campground ────────────────────────────────────────────────────────

function ridbToCampground(f: RidbFacility): Campground | null {
  // RIDB's /facilities endpoint IGNORES the facilitytype query param (verified
  // live) — it returns permit offices, visitor centers, etc. Filter here.
  if (f.FacilityTypeDescription !== "Campground") return null;
  const lat = f.FacilityLatitude || f.GEOJSON?.COORDINATES?.[1];
  const lng = f.FacilityLongitude || f.GEOJSON?.COORDINATES?.[0];
  if (!lat || !lng) return null;
  const reservable = f.Reservable === true;
  return {
    id: `ridb:${f.FacilityID}`,
    name: f.FacilityName,
    lat,
    lng,
    kind: reservable ? "reservable" : "developed",
    sources: ["ridb"],
    description: stripHtml(f.FacilityDescription),
    amenities: {},
    fee: null,
    season: null,
    openStatus: null,
    reservationUrl: reservable
      ? `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}`
      : null,
    reservationInfo: reservable ? "Reservable on Recreation.gov" : null,
    phone: typeof f.FacilityPhone === "string" && f.FacilityPhone.trim() ? f.FacilityPhone.trim() : null,
    website: null,
    operator: "Recreation.gov",
    capacity: null,
  };
}

// ─── BLM → Campground ─────────────────────────────────────────────────────────

function blmToCampground(c: BlmCampground): Campground {
  const dispersed = /primitive|dispersed/i.test(`${c.subtype} ${c.name}`);
  return {
    id: `blm:${c.id}`,
    name: c.name,
    lat: c.lat,
    lng: c.lng,
    kind: dispersed ? "dispersed" : "developed",
    sources: ["blm"],
    description: stripHtml(c.description),
    amenities: {},
    fee: /\bfee\b/i.test(c.subtype) ? "Fee area" : null,
    season: null,
    openStatus: null,
    reservationUrl: null,
    reservationInfo: null,
    phone: null,
    website: c.webLink,
    operator: c.state ? `BLM — ${c.state}` : "BLM",
    capacity: null,
  };
}

// ─── Merge & dedupe ───────────────────────────────────────────────────────────

function mergeInto(base: Campground, extra: Campground): void {
  if (!base.description && extra.description) base.description = extra.description;
  if (!base.fee && extra.fee) base.fee = extra.fee;
  if (!base.season && extra.season) base.season = extra.season;
  if (!base.openStatus && extra.openStatus) base.openStatus = extra.openStatus;
  if (!base.reservationUrl && extra.reservationUrl) base.reservationUrl = extra.reservationUrl;
  if (!base.reservationInfo && extra.reservationInfo) base.reservationInfo = extra.reservationInfo;
  if (!base.phone && extra.phone) base.phone = extra.phone;
  if (!base.website && extra.website) base.website = extra.website;
  if (!base.operator && extra.operator) base.operator = extra.operator;
  if (!base.capacity && extra.capacity) base.capacity = extra.capacity;
  for (const k of Object.keys(extra.amenities) as (keyof CampgroundAmenities)[]) {
    if (base.amenities[k] === undefined && extra.amenities[k] !== undefined) {
      base.amenities[k] = extra.amenities[k];
    }
  }
  if (extra.kind === "reservable") base.kind = "reservable";
  for (const s of extra.sources) {
    if (!base.sources.includes(s)) base.sources.push(s);
  }
}

// Duplicate when within ~0.6 mi (≈1 km) AND normalized names match (equal or
// one contains the other). RIDB/USFS share upstream data, so cross-source
// duplicates are common and usually carry identical names.
function isDuplicate(a: Campground, b: Campground): boolean {
  if (distanceMiles(a.lat, a.lng, b.lat, b.lng) > 0.62) return false;
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function dedupeAndMerge(lists: Campground[][]): Campground[] {
  // Priority order: RIDB (canonical — reservation link) > USFS > BLM > OSM.
  const merged: Campground[] = [];
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
 * Fetch campgrounds from all four sources within `radiusMiles` of a point,
 * deduplicated and merged, sorted nearest-first. Partial results on source
 * failure (Promise.allSettled); returns [] only if every source fails.
 */
export async function fetchCampgroundsNear(
  lat: number,
  lng: number,
  radiusMiles = 40,
): Promise<Campground[]> {
  // v2: v1 caches could contain non-campground RIDB facilities (filter added).
  // v3: OSM description/note tags now captured — invalidate v2 payloads.
  const cacheKey = `camps_merged_v3_${lat.toFixed(2)}_${lng.toFixed(2)}_${radiusMiles}`;
  const cached = await getCached<Campground[]>(cacheKey);
  if (cached) return cached;

  const deg = radiusMiles / 69.0;
  const [minLng, minLat, maxLng, maxLat] = [lng - deg, lat - deg, lng + deg, lat + deg];

  const [ridb, usfs, blm, osm] = await Promise.allSettled([
    fetchRidbCampsNear(lat, lng, radiusMiles),
    fetchUsfsCampgrounds(minLng, minLat, maxLng, maxLat),
    fetchBlmCampgrounds(lat, lng, radiusMiles),
    fetchOsmCampsites(minLng, minLat, maxLng, maxLat),
  ]);

  const ridbCamps =
    ridb.status === "fulfilled"
      ? ridb.value.map(ridbToCampground).filter((c): c is Campground => c !== null)
      : [];
  const usfsCamps = usfs.status === "fulfilled" ? usfs.value : [];
  const blmCamps = blm.status === "fulfilled" ? blm.value.map(blmToCampground) : [];
  const osmCamps = osm.status === "fulfilled" ? osm.value : [];

  const merged = dedupeAndMerge([ridbCamps, usfsCamps, blmCamps, osmCamps]);
  merged.sort(
    (a, b) => distanceMiles(lat, lng, a.lat, a.lng) - distanceMiles(lat, lng, b.lat, b.lng),
  );

  if (merged.length > 0) await setCached(cacheKey, merged);
  return merged;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const CAMPGROUND_KIND_COLORS: Record<CampgroundKind, string> = {
  developed: "#795548", // brown
  reservable: "#2E7D32", // green
  dispersed: "#EF6C00", // orange
};

export const CAMPGROUND_KIND_LABELS: Record<CampgroundKind, string> = {
  developed: "DEVELOPED",
  reservable: "RESERVABLE",
  dispersed: "DISPERSED",
};

const AMENITY_LABELS: Record<keyof CampgroundAmenities, string> = {
  toilets: "🚻 Toilets",
  water: "🚰 Water",
  showers: "🚿 Showers",
  fires: "🔥 Fires OK",
  tables: "🪑 Tables",
  rv: "🚐 RV",
  tents: "⛺ Tents",
};

/** Amenity chips for the detail sheet — only amenities explicitly known true. */
export function campgroundAmenityChips(c: Campground): string[] {
  return (Object.keys(AMENITY_LABELS) as (keyof CampgroundAmenities)[])
    .filter((k) => c.amenities[k] === true)
    .map((k) => AMENITY_LABELS[k]);
}

export function campgroundSourceLabel(c: Campground): string {
  const names: Record<CampgroundSource, string> = {
    ridb: "Recreation.gov",
    usfs: "USFS",
    blm: "BLM",
    osm: "OpenStreetMap",
  };
  return c.sources.map((s) => names[s]).join(" + ");
}
