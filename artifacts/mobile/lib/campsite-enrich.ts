import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── On-tap campsite enrichment ───────────────────────────────────────────────
// BLM / dispersed / OSM campsites often carry almost no metadata. When a user
// taps one, we fetch live context from Open-Meteo (free, no API key):
//   • site elevation (from the forecast grid cell)
//   • current temperature + conditions
//   • 3-day outlook (hi/lo, precip probability, conditions)
//   • today's sunrise / sunset
// One request supplies all of it. Cached 1h per ~100m-rounded coordinate so
// re-taps and nearby sites don't refetch.

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — weather goes stale fast

export interface CampsiteDayForecast {
  /** e.g. "FRI" */
  day: string;
  hiF: number;
  loF: number;
  /** 0-100, max probability for the day */
  precipPct: number;
  /** short conditions label, e.g. "Partly cloudy" */
  label: string;
}

export interface CampsiteExtras {
  elevationFt: number | null;
  currentTempF: number | null;
  currentLabel: string | null;
  days: CampsiteDayForecast[];
  /** formatted local time, e.g. "6:12 AM" */
  sunrise: string | null;
  sunset: string | null;
}

// WMO weather interpretation codes → short labels.
function weatherLabel(code: number | null | undefined): string | null {
  if (code === null || code === undefined || !Number.isFinite(code)) return null;
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code === 95) return "Thunderstorms";
  if (code === 96 || code === 99) return "Storms w/ hail";
  return null;
}

// "2026-07-24T06:12" (already in the site's local tz) → "6:12 AM"
function formatLocalTime(iso: string | null | undefined): string | null {
  if (typeof iso !== "string") return null;
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

// "2026-07-24" → "FRI" (UTC-noon parse avoids off-by-one-day)
function dayName(dateStr: string | null | undefined): string {
  if (typeof dateStr !== "string") return "—";
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getUTCDay()];
}

interface OpenMeteoResponse {
  elevation?: number;
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
    weather_code?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
}

export async function fetchCampsiteExtras(
  lat: number,
  lng: number,
): Promise<CampsiteExtras | null> {
  const cacheKey = `camp_extras_v1_${lat.toFixed(3)}_${lng.toFixed(3)}`;
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const entry: { data: CampsiteExtras; ts: number } = JSON.parse(raw);
      if (Date.now() - entry.ts <= CACHE_TTL_MS) return entry.data;
    }
  } catch {
    /* ignore cache errors */
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,weather_code",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset",
    temperature_unit: "fahrenheit",
    timezone: "auto",
    forecast_days: "3",
  });
  // 10s timeout so the sheet's "Checking conditions…" line can't linger on a
  // semi-connected device (trailhead cell edge is the common case here).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as OpenMeteoResponse;

    const days: CampsiteDayForecast[] = [];
    const d = data.daily;
    if (d?.time) {
      for (let i = 0; i < d.time.length && i < 3; i++) {
        const hi = d.temperature_2m_max?.[i];
        const lo = d.temperature_2m_min?.[i];
        if (!Number.isFinite(hi) || !Number.isFinite(lo)) continue;
        days.push({
          day: dayName(d.time[i]),
          hiF: Math.round(hi!),
          loF: Math.round(lo!),
          precipPct: Math.round(d.precipitation_probability_max?.[i] ?? 0),
          label: weatherLabel(d.weather_code?.[i]) ?? "—",
        });
      }
    }

    const extras: CampsiteExtras = {
      elevationFt: Number.isFinite(data.elevation)
        ? Math.round((data.elevation as number) * 3.28084)
        : null,
      currentTempF: Number.isFinite(data.current?.temperature_2m)
        ? Math.round(data.current!.temperature_2m!)
        : null,
      currentLabel: weatherLabel(data.current?.weather_code),
      days,
      sunrise: formatLocalTime(d?.sunrise?.[0]),
      sunset: formatLocalTime(d?.sunset?.[0]),
    };

    // Only cache useful payloads.
    if (extras.elevationFt !== null || extras.days.length > 0) {
      AsyncStorage.setItem(cacheKey, JSON.stringify({ data: extras, ts: Date.now() })).catch(
        () => {},
      );
    }
    return extras;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
