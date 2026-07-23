import { findTrailByNameOrId, searchTrails } from "@workspace/trail-data";

const RIDB_BASE = "https://ridb.recreation.gov/api/v1";
const FETCH_TIMEOUT_MS = 15_000;

interface RidbFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription?: string;
  FacilityLatitude?: number;
  FacilityLongitude?: number;
  FacilityDirections?: string;
  Reservable?: boolean;
  [key: string]: unknown;
}

interface RidbResponse {
  RECDATA?: RidbFacility[];
}

function cleanText(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 400) || undefined;
}

export const campingToolDef = {
  name: "find_campgrounds_near_trail",
  description:
    "Find real campgrounds near a named trail using Recreation.gov (RIDB) data. " +
    "Use this when the user asks about camping, overnight stays, or where to stay near a trail.",
  input_schema: {
    type: "object" as const,
    properties: {
      trailNameOrId: {
        type: "string",
        description: "The trail's name as mentioned by the user, or its exact internal ID.",
      },
      radiusMiles: {
        type: "number",
        description: "Search radius in miles. Defaults to 25.",
      },
    },
    required: ["trailNameOrId"],
  },
};

export async function runCamping(args: { trailNameOrId?: unknown; radiusMiles?: unknown }) {
  const query = typeof args.trailNameOrId === "string" ? args.trailNameOrId : "";
  const radiusMiles = typeof args.radiusMiles === "number" ? args.radiusMiles : 25;

  const trail = findTrailByNameOrId(query);
  if (!trail) {
    const suggestions = searchTrails(query).map((t) => t.title);
    return {
      found: false,
      message: `No trail matching "${query}" was found in the app's trail database.`,
      suggestions,
    };
  }

  const apiKey = process.env.RIDB_API_KEY;
  if (!apiKey) {
    return {
      found: true,
      trail: trail.title,
      error: "Campground lookup is not configured on the server (missing RIDB API key).",
      campgrounds: [],
    };
  }

  const params = new URLSearchParams({
    latitude: String(trail.coords.latitude),
    longitude: String(trail.coords.longitude),
    radius: String(radiusMiles),
    facilitytype: "Campground",
    limit: "10",
    offset: "0",
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(`${RIDB_BASE}/facilities?${params}`, {
      headers: { apikey: apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return {
        found: true,
        trail: trail.title,
        error: `Recreation.gov API returned an error (${resp.status}).`,
        campgrounds: [],
      };
    }

    const json = (await resp.json()) as RidbResponse;
    const campgrounds = (json.RECDATA ?? []).slice(0, 8).map((f) => ({
      name: f.FacilityName,
      description: cleanText(f.FacilityDescription),
      directions: cleanText(f.FacilityDirections),
      lat: f.FacilityLatitude ?? null,
      lng: f.FacilityLongitude ?? null,
      // Real reservation link — only reservable facilities have a bookable
      // recreation.gov page; others get null so the model never invents one.
      reserveUrl:
        f.Reservable === true
          ? `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}`
          : null,
    }));

    return {
      found: true,
      trail: trail.title,
      radiusMiles,
      campgrounds,
    };
  } catch {
    return {
      found: true,
      trail: trail.title,
      error: "Campground lookup timed out or failed.",
      campgrounds: [],
    };
  }
}
