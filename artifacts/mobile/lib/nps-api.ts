import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ─── National Park Service (NPS) API ─────────────────────────────────────────
// Free public API — sign up at https://www.nps.gov/subjects/developer/get-started.htm
// Provides national park access points, OHV/4WD designated areas, and trailheads
// across all US national parks, monuments, recreation areas, and forests.
//
// To enable: add EXPO_PUBLIC_NPS_API_KEY to your environment secrets.

const NPS_BASE = "https://developer.nps.gov/api/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// NPS activity names that indicate off-road / OHV use
const OHV_ACTIVITY_KEYWORDS = [
  "off-road",
  "atv",
  "ohv",
  "four wheel",
  "4wd",
  "dirt bike",
  "motorbike",
  "snowmobile",
  "jeep",
  "off road",
  "motor vehicle",
];

function getApiKey(): string {
  // process.env.EXPO_PUBLIC_* is inlined by Metro at bundle time (works in OTA).
  // Constants.expoConfig.extra is a fallback for dev builds where Metro inlining
  // may not have run (e.g. running directly via Expo Go without a full bundle).
  return (
    process.env.EXPO_PUBLIC_NPS_API_KEY ||
    (Constants.expoConfig?.extra?.npsApiKey as string | undefined) ||
    ""
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NpsActivity {
  id: string;
  name: string;
}

export interface NpsPark {
  id: string;
  parkCode: string;
  fullName: string;
  description: string;
  latitude: string;
  longitude: string;
  states: string;
  url?: string;
  activities: NpsActivity[];
  directionsInfo?: string;
  weatherInfo?: string;
}

interface NpsResponse {
  data: NpsPark[];
  total: string;
  limit: string;
  start: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineDistMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isOhvPark(park: NpsPark): boolean {
  const actNames = park.activities.map((a) => a.name.toLowerCase());
  return actNames.some((name) =>
    OHV_ACTIVITY_KEYWORDS.some((kw) => name.includes(kw))
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function npsHasApiKey(): boolean {
  return Boolean(getApiKey());
}

/**
 * Fetch all NPS parks with OHV/4WD activities, cached globally for 24h.
 * Returns [] if no API key is configured.
 */
async function fetchAllNpsOhvParks(): Promise<NpsPark[]> {
  const key = getApiKey();
  if (!key) return [];

  const cacheKey = "nps_ohv_parks_all";
  const cached = await getCached<NpsPark[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      limit: "500",
      start: "0",
      api_key: key,
    });
    const resp = await fetch(`${NPS_BASE}/parks?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as NpsResponse;
    const ohvParks = (json.data ?? []).filter(isOhvPark);
    await setCached(cacheKey, ohvParks);
    return ohvParks;
  } catch {
    return [];
  }
}

/**
 * Fetch NPS parks with OHV/4WD activities within radiusMiles of a location.
 * Returns [] if no API key is configured.
 */
export async function fetchNpsOhvParksNear(
  lat: number,
  lng: number,
  radiusMiles = 150,
): Promise<NpsPark[]> {
  const all = await fetchAllNpsOhvParks();
  return all.filter((p) => {
    const pLat = parseFloat(p.latitude);
    const pLng = parseFloat(p.longitude);
    if (!pLat || !pLng) return false;
    return haversineDistMiles(lat, lng, pLat, pLng) <= radiusMiles;
  });
}

// ─── Display helpers ───────────────────────────────────────────────────────────

export function npsParkActivities(p: NpsPark): string {
  const ohv = p.activities.filter((a) =>
    OHV_ACTIVITY_KEYWORDS.some((kw) => a.name.toLowerCase().includes(kw))
  );
  return ohv
    .slice(0, 3)
    .map((a) => a.name)
    .join(" · ") || "National Park / Recreation Area";
}

export function npsParkCoord(p: NpsPark): [number, number] | null {
  const lat = parseFloat(p.latitude);
  const lng = parseFloat(p.longitude);
  if (!lat || !lng) return null;
  return [lng, lat];
}
