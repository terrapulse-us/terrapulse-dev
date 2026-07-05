const USER_AGENT = "TerraPulse/1.0 (contact: support@terrapulse.app)";
const FETCH_TIMEOUT_MS = 10_000;

export interface TrailWeather {
  shortForecast: string;
  temperatureF: number | null;
  windSpeed: string | null;
  detailedForecast: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the current/upcoming forecast period for a lat/lng via the free
 * NWS (weather.gov) API. Requires a User-Agent header or it 403s. Two calls
 * are needed: the grid point lookup, then the forecast it points to.
 */
export async function fetchTrailWeather(
  lat: number,
  lng: number,
): Promise<TrailWeather | null> {
  const pointsData = (await fetchJson(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
  )) as { properties?: { forecast?: string } } | null;

  const forecastUrl = pointsData?.properties?.forecast;
  if (!forecastUrl) return null;

  const forecastData = (await fetchJson(forecastUrl)) as {
    properties?: {
      periods?: Array<{
        shortForecast?: string;
        temperature?: number;
        windSpeed?: string;
        detailedForecast?: string;
      }>;
    };
  } | null;

  const period = forecastData?.properties?.periods?.[0];
  if (!period) return null;

  return {
    shortForecast: period.shortForecast ?? "Unknown",
    temperatureF: typeof period.temperature === "number" ? period.temperature : null,
    windSpeed: period.windSpeed ?? null,
    detailedForecast: period.detailedForecast ?? period.shortForecast ?? "No forecast available",
  };
}
