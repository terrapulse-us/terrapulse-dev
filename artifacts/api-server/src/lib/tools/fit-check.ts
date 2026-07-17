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
  requirements: {
    minLiftIn: number;
    lockersRecommended: boolean;
    longTravel: boolean;
    fourWheelDriveRecommended: boolean;
  };
  vehicle: AssistantVehicleProfile;
  fits: boolean;
  reasons: string[];
}

// A trail effectively demands 4WD when it recommends lift/lockers/long-travel
// hardware, or when its difficulty is 5/10 or above — those grades involve
// terrain (loose climbs, rocks, deep sand) a two-wheel-drive rig can't
// reliably clear. Exception: "Stock OK"/"Stock Friendly" trails (SVRAs, dune
// parks, OHV recreation areas) explicitly welcome dirt bikes, quads, and 2WD
// rigs — the stock-friendly designation outranks the numeric rating there.
function trailNeeds4wd(trail: Trail): boolean {
  if (trail.minLiftIn > 0 || trail.lockersRecommended || trail.longTravel) return true;
  if (/^stock/i.test(trail.suspension)) return false;
  return trail.difficultyRating >= 5;
}

function evaluateFit(trail: Trail, vehicle: AssistantVehicleProfile): FitResult {
  const liftIn = vehicle.liftIn ?? 0;
  const hasLockers = vehicle.hasLockers ?? false;
  const needs4wd = trailNeeds4wd(trail);

  const reasons: string[] = [];
  let fits = true;

  if (vehicle.drivetrain === "2x4" && needs4wd) {
    fits = false;
    reasons.push(
      `This trail (${trail.difficulty}) calls for 4-wheel drive; your vehicle is 2WD (2x4). ` +
      "Two-wheel-drive rigs should not attempt it regardless of other mods.",
    );
  }

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
    if (needs4wd && !vehicle.drivetrain) {
      reasons.push(
        "Note: this assumes a 4WD vehicle — the user's drivetrain isn't on file. If they drive a 2WD rig, this trail is NOT suitable; suggest they set their drivetrain in My Garage.",
      );
    }
  }

  return {
    found: true,
    trail: trail.title,
    requirements: {
      minLiftIn: trail.minLiftIn,
      lockersRecommended: trail.lockersRecommended,
      longTravel: trail.longTravel,
      fourWheelDriveRecommended: needs4wd,
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
        fourWheelDriveRecommended: trailNeeds4wd(trail),
      },
      message:
        "The user hasn't saved a vehicle profile (lift height, lockers) yet, so a fit check " +
        "can't be computed. Share this trail's requirements and suggest they fill out their " +
        "vehicle specs in the Profile tab for a personalized check.",
    };
  }

  return evaluateFit(trail, vehicleProfile);
}
