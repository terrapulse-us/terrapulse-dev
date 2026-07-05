import { findTrailByNameOrId, searchTrails } from "@workspace/trail-data";

const OPENCELLID_BASE = "https://opencellid.org/cell/getInArea";
const FETCH_TIMEOUT_MS = 15_000;
// OpenCelliD's getInArea endpoint rejects boxes over ~4,000,000 sq meters, so
// keep the bounding box well under that (roughly 1.6km x 1.6km here).
const BBOX_PAD_DEG = 0.007;

export type CellCoverageLevel = "good" | "patchy" | "poor" | "unknown";

interface OpenCellIdResponse {
  count?: number;
  error?: string;
  code?: number;
}

export const cellCoverageToolDef = {
  name: "check_cell_coverage",
  description:
    "Estimate cell phone coverage near a named trail using a cell-tower-density heuristic " +
    "(OpenCelliD crowd-sourced tower data). This is a best-effort estimate, not a guarantee — " +
    "always caveat it as such to the user. Use this proactively whenever discussing a remote or " +
    "backcountry trail, so you can warn about spotty service and offer an offline map download.",
  input_schema: {
    type: "object" as const,
    properties: {
      trailNameOrId: {
        type: "string",
        description: "The trail's name as mentioned by the user, or its exact internal ID.",
      },
    },
    required: ["trailNameOrId"],
  },
};

function levelFromTowerCount(count: number): CellCoverageLevel {
  if (count <= 0) return "poor";
  if (count <= 3) return "patchy";
  return "good";
}

export async function runCellCoverage(args: { trailNameOrId?: unknown }) {
  const query = typeof args.trailNameOrId === "string" ? args.trailNameOrId : "";
  const trail = findTrailByNameOrId(query);

  if (!trail) {
    const suggestions = searchTrails(query).map((t) => t.title);
    return {
      found: false,
      message: `No trail matching "${query}" was found in the app's trail database.`,
      suggestions,
    };
  }

  const apiKey = process.env.OPENCELLID_API_KEY;
  if (!apiKey) {
    return {
      found: true,
      trail: trail.title,
      level: "unknown" as CellCoverageLevel,
      error: "Cell coverage estimation is not configured on the server (missing OpenCelliD API key).",
    };
  }

  const { latitude, longitude } = trail.coords;
  const bbox = [
    latitude - BBOX_PAD_DEG,
    longitude - BBOX_PAD_DEG,
    latitude + BBOX_PAD_DEG,
    longitude + BBOX_PAD_DEG,
  ].join(",");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(
      `${OPENCELLID_BASE}?key=${encodeURIComponent(apiKey)}&BBOX=${bbox}&format=json&limit=100`,
      { signal: controller.signal },
    );
    clearTimeout(timer);

    if (!resp.ok) {
      return {
        found: true,
        trail: trail.title,
        level: "unknown" as CellCoverageLevel,
        error: `Cell tower lookup API returned an error (${resp.status}).`,
      };
    }

    const json = (await resp.json()) as OpenCellIdResponse;

    // OpenCelliD returns {error, code: 1} for "No cells found" — a real (and
    // meaningful) zero-tower result, not a failure, so treat it as count 0.
    const towerCount = json.error && json.code === 1 ? 0 : (json.count ?? 0);
    const level = levelFromTowerCount(towerCount);

    return {
      found: true,
      trail: {
        id: trail.id,
        title: trail.title,
        lat: latitude,
        lng: longitude,
      },
      towerCount,
      level,
      caveat:
        "This is a rough estimate based on publicly reported cell tower density near the trail " +
        "coordinates, not a live signal measurement. Actual reception varies with carrier, terrain, " +
        "and elevation.",
    };
  } catch {
    return {
      found: true,
      trail: trail.title,
      level: "unknown" as CellCoverageLevel,
      error: "Cell tower lookup timed out or failed.",
    };
  }
}
