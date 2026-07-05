import { findTrailByNameOrId, searchTrails, type Trail } from "@workspace/trail-data";
import type { AssistantVehicleProfile } from "@workspace/api-zod";

export const fitCheckToolDef = {
  name: "check_vehicle_fit",
  description:
    "Deterministically compare the user's vehicle specs against a named trail's " +
    "recommended requirements (lift height, lockers). Always call this instead of " +
    "guessing when the user asks whether their vehicle can handle a trail. The " +
    "user's saved vehicle profile is applied automatically — you only supply the trail.",
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

interface FitResult {
  found: true;
  trail: string;
  requirements: { minLiftIn: number; lockersRecommended: boolean; longTravel: boolean };
  vehicle: AssistantVehicleProfile;
  fits: boolean;
  reasons: string[];
}

function evaluateFit(trail: Trail, vehicle: AssistantVehicleProfile): FitResult {
  const liftIn = vehicle.liftIn ?? 0;
  const hasLockers = vehicle.hasLockers ?? false;

  const reasons: string[] = [];
  let fits = true;

  if (trail.minLiftIn > 0 && liftIn < trail.minLiftIn) {
    fits = false;
    reasons.push(
      `This trail recommends at least ${trail.minLiftIn}" of lift; your vehicle has ${liftIn}".`,
    );
  }

  if (trail.lockersRecommended && !hasLockers) {
    fits = false;
    reasons.push("This trail recommends locking differentials; your vehicle doesn't have lockers on file.");
  }

  if (trail.longTravel && !(vehicle.hasLowRange ?? false)) {
    reasons.push(
      "This trail calls for long-travel suspension. Low-range gearing is also strongly recommended for the technical sections.",
    );
  }

  if (fits && reasons.length === 0) {
    reasons.push("Your vehicle meets or exceeds this trail's recommended lift and locker requirements.");
  }

  return {
    found: true,
    trail: trail.title,
    requirements: {
      minLiftIn: trail.minLiftIn,
      lockersRecommended: trail.lockersRecommended,
      longTravel: trail.longTravel,
    },
    vehicle,
    fits,
    reasons,
  };
}

export function runFitCheck(
  args: { trailNameOrId?: unknown },
  vehicleProfile: AssistantVehicleProfile | undefined,
) {
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

  if (!vehicleProfile || Object.keys(vehicleProfile).length === 0) {
    return {
      found: true,
      trail: trail.title,
      requirements: {
        minLiftIn: trail.minLiftIn,
        lockersRecommended: trail.lockersRecommended,
        longTravel: trail.longTravel,
      },
      message:
        "The user hasn't saved a vehicle profile (lift height, lockers) yet, so a fit check " +
        "can't be computed. Share this trail's requirements and suggest they fill out their " +
        "vehicle specs in the Profile tab for a personalized check.",
    };
  }

  return evaluateFit(trail, vehicleProfile);
}
