export interface TrailRequirements {
  minLiftIn: number;
  lockersRecommended: boolean;
  longTravel: boolean;
}

/**
 * Deterministically derive structured vehicle-fit requirements from a trail's
 * free-text suspension description (e.g. `3-4" Lift + Lockers`, `Stock OK`,
 * `Long Travel Required`). Used to power the vehicle-fit-check tool without
 * any LLM guessing.
 */
export function parseSuspension(text: string): TrailRequirements {
  const lower = text.toLowerCase();
  const lockersRecommended = lower.includes("locker");
  const longTravel = lower.includes("long travel");

  if (lower.startsWith("stock")) {
    return { minLiftIn: 0, lockersRecommended, longTravel };
  }

  const match = text.match(/(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?"/);
  if (match) {
    return { minLiftIn: parseFloat(match[1]), lockersRecommended, longTravel };
  }

  if (longTravel) {
    return { minLiftIn: 4, lockersRecommended, longTravel };
  }

  return { minLiftIn: 0, lockersRecommended, longTravel };
}
