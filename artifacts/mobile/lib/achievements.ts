import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { ALL_TRAILS } from "./trails";
import { REGIONS } from "./achievements-catalog";
import { TRAIL_ROUTES } from "./trail-routes";

// Build the authoritative set of route-classified trail IDs from the single
// source of truth. Only trails with actual GPS polylines can be "followed" on
// the map, so only they count toward badge milestones.
const ROUTE_TRAIL_IDS = new Set(
  Object.entries(TRAIL_ROUTES)
    .filter(([, pts]) => pts.length > 0)
    .map(([id]) => id)
);

// Per-trail badges. CA IDs are unchanged so existing users keep their badges.
// Non-CA entries cover every other state with a route-classified trail.
// Only entries whose trail ID is in ROUTE_TRAIL_IDS will ever fire.
const TRAIL_ACHIEVEMENT_MAP: Record<string, string> = {
  // ── California ─────────────────────────────────────────────────────────────
  "ca-1":  "trail_rubicon",
  "ca-2":  "trail_hungry_valley",
  "ca-3":  "trail_johnson_valley",
  "ca-4":  "trail_big_bear",
  "ca-5":  "trail_ocotillo",
  "ca-6":  "trail_fordyce",
  "ca-7":  "trail_hollister",
  "ca-8":  "trail_pismo",
  "ca-9":  "trail_dumont",
  "ca-10": "trail_stoddard",
  "ca-11": "trail_dove_springs",
  "ca-12": "trail_carnegie",
  "ca-13": "trail_prairie_city",
  "ca-14": "trail_el_mirage",
  "ca-15": "trail_ballinger",
  "ca-16": "trail_rowher",
  "ca-17": "trail_corral_canyon",
  "ca-18": "trail_cleghorn",
  "ca-19": "trail_saline_valley",
  "ca-20": "trail_mojave_road",
  "ca-21": "trail_mammoth_bar",
  "ca-22": "trail_alamo",
  "ca-23": "trail_surprise_canyon",
  "ca-24": "trail_picacho",
  "ca-25": "trail_randsburg",
  "ca-26": "trail_bodie",
  "ca-27": "trail_plumas",
  // ── Arizona ────────────────────────────────────────────────────────────────
  "az-3":  "trail_bulldog_canyon",
  "az-8":  "trail_kofa_palm_canyon",
  "az-10": "trail_crown_king",
  "az-14": "trail_harquahala",
  // ── Colorado ───────────────────────────────────────────────────────────────
  "co-1":  "trail_black_bear_road",
  "co-3":  "trail_imogene_pass",
  "co-4":  "trail_medano_pass",
  "co-8":  "trail_ophir_pass",
  "co-11": "trail_ophir_san_miguel",
  "co-12": "trail_black_bear_pass",
  "co-13": "trail_engineer_pass",
  "co-14": "trail_imogene_ouray",
  // ── Hawaii ─────────────────────────────────────────────────────────────────
  "hi-2":  "trail_mauna_kea",
  // ── Minnesota ──────────────────────────────────────────────────────────────
  "mn-4":  "trail_remer_ohv",
  // ── South Carolina ─────────────────────────────────────────────────────────
  "sc-4":  "trail_wambaw",
  // ── Utah ───────────────────────────────────────────────────────────────────
  "ut-3":  "trail_white_rim_road",
  "ut-11": "trail_white_rim_trail",
  "ut-14": "trail_elephant_hill",
  "ut-15": "trail_onion_creek",
};

// CA regional groups — filtered to only route trails so the badge requires
// completing every followable trail in each group.
const DESERT_TRAILS_ALL = ["ca-3","ca-5","ca-9","ca-10","ca-11","ca-14","ca-19","ca-20","ca-25","ca-26"];
const NOCAL_TRAILS_ALL  = ["ca-1","ca-6","ca-7","ca-12","ca-13","ca-21","ca-27"];
const SOCAL_TRAILS_ALL  = ["ca-2","ca-3","ca-4","ca-5","ca-8","ca-9","ca-10","ca-11","ca-14","ca-15","ca-16","ca-17","ca-18","ca-20","ca-22","ca-23","ca-24","ca-25"];

const DESERT_TRAILS = DESERT_TRAILS_ALL.filter((id) => ROUTE_TRAIL_IDS.has(id));
const NOCAL_TRAILS  = NOCAL_TRAILS_ALL.filter((id) => ROUTE_TRAIL_IDS.has(id));
const SOCAL_TRAILS  = SOCAL_TRAILS_ALL.filter((id) => ROUTE_TRAIL_IDS.has(id));

// Derived once from the live trail catalog so geographic badges stay in sync.
const TRAIL_STATE_MAP: Record<string, string> = Object.fromEntries(
  ALL_TRAILS.filter((t) => ROUTE_TRAIL_IDS.has(t.id)).map((t) => [t.id, t.state])
);
const TOTAL_ROUTE_TRAILS = ROUTE_TRAIL_IDS.size;
const TOTAL_STATES = new Set(
  ALL_TRAILS.filter((t) => ROUTE_TRAIL_IDS.has(t.id)).map((t) => t.state)
).size;

export async function markTrailComplete(userId: string, trailId: string) {
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};
  const existing: string[] = data.achievements ?? [];
  const dates: Record<string, number> = data.achievementDates ?? {};
  const completed: string[] = data.completedTrails ?? [];

  const toAdd: string[] = [];
  const now = Date.now();

  const add = (id: string) => {
    if (!existing.includes(id) && !toAdd.includes(id)) {
      toAdd.push(id);
      dates[id] = now;
    }
  };

  const newCompleted = completed.includes(trailId) ? completed : [...completed, trailId];

  // Only route-classified trails (those with a real GPS polyline that can be
  // followed on the map) count toward milestone and geographic badges.
  const routeCompleted = newCompleted.filter((id) => ROUTE_TRAIL_IDS.has(id));
  const rc = routeCompleted.length;

  // ── Milestone badges (route trails only) ──────────────────────────────────
  if (rc >= 1)   add("first_trail");
  if (rc >= 3)   add("trails_3");
  if (rc >= 6)   add("trails_6");
  if (rc >= 10)  add("trails_10");
  if (rc >= 20)  add("trails_20");
  if (rc >= 27)  add("trails_27");
  if (rc >= 50)  add("trails_50");
  if (rc >= 100) add("trails_100");
  if (rc >= 200) add("trails_200");
  if (rc >= TOTAL_ROUTE_TRAILS) add("trails_all");

  // ── Per-trail badge (only if this trail has a followable route) ───────────
  if (ROUTE_TRAIL_IDS.has(trailId)) {
    const trailAch = TRAIL_ACHIEVEMENT_MAP[trailId];
    if (trailAch) add(trailAch);
  }

  // ── CA regional badges (filtered to route trails in each group) ───────────
  if (DESERT_TRAILS.length > 0 && DESERT_TRAILS.every((id) => routeCompleted.includes(id))) add("regional_desert");
  if (NOCAL_TRAILS.length > 0  && NOCAL_TRAILS.every((id)  => routeCompleted.includes(id))) add("regional_nocal");
  if (SOCAL_TRAILS.length > 0  && SOCAL_TRAILS.every((id)  => routeCompleted.includes(id))) add("regional_socal");

  // ── Multi-state and region badges (route trails only) ─────────────────────
  const completedByState = new Map<string, number>();
  for (const id of routeCompleted) {
    const state = TRAIL_STATE_MAP[id];
    if (!state) continue;
    completedByState.set(state, (completedByState.get(state) ?? 0) + 1);
  }

  const statesVisited = new Set(completedByState.keys());
  for (const [key, region] of Object.entries(REGIONS)) {
    const relevantStates = region.states.filter((s) => {
      // Only count states that have at least one route trail
      return Array.from(ROUTE_TRAIL_IDS).some((id) => TRAIL_STATE_MAP[id] === s);
    });
    if (relevantStates.length > 0 && relevantStates.every((s) => statesVisited.has(s))) {
      add(`region_${key}`);
    }
  }

  if (statesVisited.size >= 5)            add("states_5");
  if (statesVisited.size >= 10)           add("states_10");
  if (statesVisited.size >= 25)           add("states_25");
  if (statesVisited.size >= TOTAL_STATES) add("states_all");

  const newAchievements = [...new Set([...existing, ...toAdd])];

  await setDoc(
    userRef,
    { achievements: newAchievements, achievementDates: dates, completedTrails: newCompleted },
    { merge: true }
  );

  return toAdd;
}

// ── Contributor badges ────────────────────────────────────────────────────────
// Called after a user successfully submits a trail. Pass the user's total
// submitted trail count (including the one just submitted).
const CONTRIBUTOR_THRESHOLDS: [number, string][] = [
  [1,  "contributor_1"],
  [5,  "contributor_5"],
  [10, "contributor_10"],
  [25, "contributor_25"],
  [50, "contributor_50"],
];

export async function markTrailContributed(userId: string, count: number): Promise<string[]> {
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};
  const existing: string[] = data.achievements ?? [];
  const dates: Record<string, number> = data.achievementDates ?? {};
  const now = Date.now();
  const toAdd: string[] = [];

  for (const [threshold, id] of CONTRIBUTOR_THRESHOLDS) {
    if (count >= threshold && !existing.includes(id) && !toAdd.includes(id)) {
      toAdd.push(id);
      dates[id] = now;
    }
  }

  if (toAdd.length === 0) return toAdd;

  await setDoc(
    userRef,
    { achievements: [...new Set([...existing, ...toAdd])], achievementDates: dates },
    { merge: true }
  );

  return toAdd;
}

export async function grantBadge(userId: string, badgeId: string): Promise<boolean> {
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};
  const existing: string[] = data.achievements ?? [];
  if (existing.includes(badgeId)) return false;
  const dates: Record<string, number> = data.achievementDates ?? {};
  dates[badgeId] = Date.now();
  await setDoc(
    userRef,
    { achievements: [...existing, badgeId], achievementDates: dates },
    { merge: true },
  );
  return true;
}
