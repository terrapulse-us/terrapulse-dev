import { fetchTrailWeather } from "../weather";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "TerraPulse/1.0 (contact: support@terrapulse.app)";

export const weatherToolDef = {
  name: "get_weather",
  description:
    "Get the current weather forecast for any location — a city, town, address, or region. " +
    "Use this when the user asks about weather at a place that is NOT one of the named trails " +
    "in the app (e.g. 'What's the weather in Wildomar, CA?' or 'Is it going to rain near Moab?'). " +
    "For a specific named trail, use get_trail_briefing instead (it includes weather automatically).",
  input_schema: {
    type: "object" as const,
    properties: {
      location: {
        type: "string",
        description:
          "The location to fetch weather for, e.g. 'Wildomar, CA' or 'Moab, Utah' or " +
          "'San Bernardino National Forest'.",
      },
    },
    required: ["location"],
  },
};

async function geocode(
  location: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const params = new URLSearchParams({
    q: location,
    format: "json",
    limit: "1",
    countrycodes: "us",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      displayName: hit.display_name ?? location,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runWeather(args: { location?: unknown }) {
  const location = typeof args.location === "string" ? args.location.trim() : "";
  if (!location) {
    return { error: "No location provided." };
  }

  const geo = await geocode(location);
  if (!geo) {
    return {
      error: `Could not find coordinates for "${location}". Try a more specific location, e.g. "Wildomar, CA, USA".`,
    };
  }

  const weather = await fetchTrailWeather(geo.lat, geo.lng);
  if (!weather) {
    return {
      location: geo.displayName,
      error:
        "Weather forecast is unavailable for this location right now. " +
        "The NWS API only covers the contiguous United States — try web_search for international locations.",
    };
  }

  return {
    location: geo.displayName,
    coords: { lat: geo.lat, lng: geo.lng },
    shortForecast: weather.shortForecast,
    temperatureF: weather.temperatureF,
    windSpeed: weather.windSpeed,
    detailedForecast: weather.detailedForecast,
  };
}
