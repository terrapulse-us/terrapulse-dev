import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { ALL_TRAILS } from "./trails";
import { REGIONS } from "./achievements-catalog";

// Per-trail badges for the original 27 CA trails. IDs are unchanged so
// existing users keep their earned badges after the nationwide expansion.
const TRAIL_ACHIEVEMENT_MAP: Record<string, string> = {
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
};

const DESERT_TRAILS = ["ca-3","ca-5","ca-9","ca-10","ca-11","ca-14","ca-19","ca-20","ca-25","ca-26"];
const NOCAL_TRAILS  = ["ca-1","ca-6","ca-7","ca-12","ca-13","ca-21","ca-27"];
const SOCAL_TRAILS  = ["ca-2","ca-3","ca-4","ca-5","ca-8","ca-9","ca-10","ca-11","ca-14","ca-15","ca-16","ca-17","ca-18","ca-20","ca-22","ca-23","ca-24","ca-25"];
const DUNES_TRAILS  = ["ca-8","ca-9"];

// Derived once from the live trail catalog so state/region/national badges
// automatically stay in sync as trails.ts grows — no manual per-trail upkeep.
const TRAIL_STATE_MAP: Record<string, string> = Object.fromEntries(
  ALL_TRAILS.map((t) => [t.id, t.state])
);
const STATE_TRAIL_COUNTS: Record<string, number> = ALL_TRAILS.reduce((acc, t) => {
  acc[t.state] = (acc[t.state] ?? 0) + 1;
  return acc;
}, {} as Record<string, number>);
const TOTAL_TRAILS = ALL_TRAILS.length;
const TOTAL_STATES = new Set(ALL_TRAILS.map((t) => t.state)).size;

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

  if (newCompleted.length === 1) add("first_trail");

  const trailAch = TRAIL_ACHIEVEMENT_MAP[trailId];
  if (trailAch) add(trailAch);

  if (newCompleted.length >= 3)   add("trails_3");
  if (newCompleted.length >= 6)   add("trails_6");
  if (newCompleted.length >= 10)  add("trails_10");
  if (newCompleted.length >= 20)  add("trails_20");
  if (newCompleted.length >= 27)  add("trails_27");
  if (newCompleted.length >= 50)  add("trails_50");
  if (newCompleted.length >= 100) add("trails_100");
  if (newCompleted.length >= 200) add("trails_200");
  if (newCompleted.length >= TOTAL_TRAILS) add("trails_all");

  if (DESERT_TRAILS.every(id => newCompleted.includes(id))) add("regional_desert");
  if (NOCAL_TRAILS.every(id  => newCompleted.includes(id))) add("regional_nocal");
  if (SOCAL_TRAILS.every(id  => newCompleted.includes(id))) add("regional_socal");
  if (DUNES_TRAILS.every(id  => newCompleted.includes(id))) add("dunes_king");

  // Nationwide: per-state, per-region, and multi-state badges derived from
  // which states the rider's completed trails fall in.
  const completedByState = new Map<string, number>();
  for (const id of newCompleted) {
    const state = TRAIL_STATE_MAP[id];
    if (!state) continue;
    completedByState.set(state, (completedByState.get(state) ?? 0) + 1);
  }

  for (const [state, count] of completedByState) {
    add(`state_explorer_${state}`);
    if (count >= (STATE_TRAIL_COUNTS[state] ?? Infinity)) add(`state_master_${state}`);
  }

  const statesVisited = new Set(completedByState.keys());
  for (const [key, region] of Object.entries(REGIONS)) {
    const relevantStates = region.states.filter((s) => STATE_TRAIL_COUNTS[s] !== undefined);
    if (relevantStates.length > 0 && relevantStates.every((s) => statesVisited.has(s))) {
      add(`region_${key}`);
    }
  }

  if (statesVisited.size >= 5)             add("states_5");
  if (statesVisited.size >= 10)            add("states_10");
  if (statesVisited.size >= 25)            add("states_25");
  if (statesVisited.size >= TOTAL_STATES)  add("states_all");

  const newAchievements = [...new Set([...existing, ...toAdd])];

  await setDoc(
    userRef,
    { achievements: newAchievements, achievementDates: dates, completedTrails: newCompleted },
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
