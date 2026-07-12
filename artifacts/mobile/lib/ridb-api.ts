import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ─── Recreation.gov RIDB API ──────────────────────────────────────────────────
// Free public API — sign up at https://ridb.recreation.gov to get a free key.
// Provides official trailheads, campgrounds, and recreation facilities across
// all federal public lands (USFS, BLM, NPS, COE, etc.)
//
// To enable: add a RIDB_API_KEY secret (or EXPO_PUBLIC_RIDB_API_KEY for EAS builds).

const RIDB_BASE = "https://ridb.recreation.gov/api/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function getApiKey(): string {
  // Constants.expoConfig.extra is populated from app.config.js at Expo server-start
  // time and is always available in dev (Replit) without needing Metro to re-bundle.
  // process.env.EXPO_PUBLIC_* is a secondary path — Metro inlines it at bundle time,
  // which means it only picks up a newly-added secret after a full restart.
  return (
    (Constants.expoConfig?.extra?.ridbApiKey as string | undefined) ||
    process.env.EXPO_PUBLIC_RIDB_API_KEY ||
    ""
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RidbActivity {
  ActivityID: number;
  ActivityName: string;
}

export interface RidbFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription: string;
  FacilityTypeDescription: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityDirections?: string;
  FacilityPhone?: string;
  FacilityEmail?: string;
  GEOJSON?: { TYPE?: string; COORDINATES?: [number, number] };
  ACTIVITY?: RidbActivity[];
  [key: string]: unknown;
}

interface RidbResponse {
  RECDATA: RidbFacility[];
  METADATA: { RESULTS: { CURRENT_COUNT: number; TOTAL_COUNT: number } };
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: { data: T; ts: number } = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.data;
  } catch { return null; }
}

async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if an RIDB API key is configured.
 * If false, all fetch functions return empty results gracefully.
 */
export function ridbHasApiKey(): boolean {
  return Boolean(getApiKey());
}

/**
 * Fetch trailheads and OHV/recreation areas near a point.
 * Returns an empty array if no API key is configured.
 */
export async function fetchRidbTrailheadsNear(
  lat: number,
  lng: number,
  radiusMiles = 25,
): Promise<RidbFacility[]> {
  const key = getApiKey();
  if (!key) return [];

  const cacheKey = `ridb_trail_${lat.toFixed(2)}_${lng.toFixed(2)}_${radiusMiles}`;
  const cached = await getCached<RidbFacility[]>(cacheKey);
  if (cached) return cached;

  // RIDB search by lat/lng radius
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radiusMiles),
    activity: "OHVOFFHIGHWAY VEHICLE USE,FOUR WHEEL DRIVE,ATV/OFFHIGHWAYVEHICLE",
    limit: "50",
    offset: "0",
  });

  try {
    const resp = await fetch(`${RIDB_BASE}/facilities?${params}`, {
      headers: { apikey: key, Accept: "application/json" },
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as RidbResponse;
    const facilities = json.RECDATA ?? [];
    await setCached(cacheKey, facilities);
    return facilities;
  } catch {
    return [];
  }
}

/**
 * Fetch campgrounds and recreation areas near a point.
 * Useful for planning overnight off-road trips.
 */
export async function fetchRidbCampsNear(
  lat: number,
  lng: number,
  radiusMiles = 25,
): Promise<RidbFacility[]> {
  const key = getApiKey();
  if (!key) return [];

  const cacheKey = `ridb_camp_${lat.toFixed(2)}_${lng.toFixed(2)}_${radiusMiles}`;
  const cached = await getCached<RidbFacility[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radiusMiles),
    facilitytype: "Campground",
    limit: "50",
    offset: "0",
  });

  try {
    const resp = await fetch(`${RIDB_BASE}/facilities?${params}`, {
      headers: { apikey: key, Accept: "application/json" },
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as RidbResponse;
    const facilities = json.RECDATA ?? [];
    await setCached(cacheKey, facilities);
    return facilities;
  } catch {
    return [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function ridbFacilityCoord(f: RidbFacility): [number, number] | null {
  if (f.FacilityLatitude && f.FacilityLongitude) {
    return [f.FacilityLongitude, f.FacilityLatitude];
  }
  const geo = f.GEOJSON?.COORDINATES;
  return geo ?? null;
}

export function ridbFacilityActivities(f: RidbFacility): string {
  const acts = f.ACTIVITY ?? [];
  return acts
    .slice(0, 3)
    .map((a) => a.ActivityName)
    .join(" · ") || f.FacilityTypeDescription || "Recreation Area";
}

export function ridbCleanDescription(f: RidbFacility): string {
  const raw = f.FacilityDescription ?? "";
  // Strip HTML tags
  return raw.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 600);
}
