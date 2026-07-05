import { findTrailByNameOrId, searchTrails } from "@workspace/trail-data";
import { fetchTrailWeather } from "../weather";

export const trailBriefingToolDef = {
  name: "get_trail_briefing",
  description:
    "Look up a trail by name (or exact ID) and return its structured data " +
    "(difficulty, region, suspension/vehicle requirements) plus the current " +
    "weather forecast for its coordinates. Use this whenever the user asks " +
    "about a specific named trail.",
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

export async function runTrailBriefing(args: { trailNameOrId?: unknown }) {
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

  const weather = await fetchTrailWeather(trail.coords.latitude, trail.coords.longitude);

  return {
    found: true,
    trail: {
      id: trail.id,
      title: trail.title,
      state: trail.state,
      region: trail.region,
      difficulty: trail.difficulty,
      difficultyRating: trail.difficultyRating,
      suspension: trail.suspension,
      minLiftIn: trail.minLiftIn,
      lockersRecommended: trail.lockersRecommended,
      longTravel: trail.longTravel,
      vehicleTypes: trail.vehicleTypes,
      coords: trail.coords,
    },
    weather: weather ?? { error: "Weather forecast unavailable for this location right now." },
  };
}
