import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const TRAIL_ACHIEVEMENT_MAP: Record<string, string> = {
  "1":  "trail_rubicon",
  "2":  "trail_hungry_valley",
  "3":  "trail_johnson_valley",
  "4":  "trail_big_bear",
  "5":  "trail_ocotillo",
  "6":  "trail_fordyce",
  "7":  "trail_hollister",
  "8":  "trail_pismo",
  "9":  "trail_dumont",
  "10": "trail_stoddard",
  "11": "trail_dove_springs",
  "12": "trail_carnegie",
  "13": "trail_prairie_city",
  "14": "trail_el_mirage",
  "15": "trail_ballinger",
  "16": "trail_rowher",
  "17": "trail_corral_canyon",
  "18": "trail_cleghorn",
  "19": "trail_saline_valley",
  "20": "trail_mojave_road",
  "21": "trail_mammoth_bar",
  "22": "trail_alamo",
  "23": "trail_surprise_canyon",
  "24": "trail_picacho",
  "25": "trail_randsburg",
  "26": "trail_bodie",
  "27": "trail_plumas",
};

const DESERT_TRAILS = ["3","5","9","10","11","14","19","20","25","26"];
const NOCAL_TRAILS  = ["1","6","7","12","13","21","27"];
const SOCAL_TRAILS  = ["2","3","4","5","8","9","10","11","14","15","16","17","18","20","22","23","24","25"];
const DUNES_TRAILS  = ["8","9"];

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

  // First trail ever
  if (newCompleted.length === 1) add("first_trail");

  // Per-trail badge
  const trailAch = TRAIL_ACHIEVEMENT_MAP[trailId];
  if (trailAch) add(trailAch);

  // Count milestones
  if (newCompleted.length >= 3)  add("trails_3");
  if (newCompleted.length >= 6)  add("trails_6");
  if (newCompleted.length >= 10) add("trails_10");
  if (newCompleted.length >= 20) add("trails_20");
  if (newCompleted.length >= 27) add("trails_27");

  // Regional badges
  if (DESERT_TRAILS.every(id => newCompleted.includes(id))) add("regional_desert");
  if (NOCAL_TRAILS.every(id  => newCompleted.includes(id))) add("regional_nocal");
  if (SOCAL_TRAILS.every(id  => newCompleted.includes(id))) add("regional_socal");
  if (DUNES_TRAILS.every(id  => newCompleted.includes(id))) add("dunes_king");

  const newAchievements = [...new Set([...existing, ...toAdd])];

  await setDoc(
    userRef,
    { achievements: newAchievements, achievementDates: dates, completedTrails: newCompleted },
    { merge: true }
  );

  return toAdd;
}
