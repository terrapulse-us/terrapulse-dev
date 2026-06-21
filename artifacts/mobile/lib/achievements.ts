import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const TRAIL_ACHIEVEMENT_MAP: Record<string, string> = {
  "1": "trail_rubicon",
  "2": "trail_hungry_valley",
  "3": "trail_johnson_valley",
  "4": "trail_big_bear",
  "5": "trail_ocotillo",
  "6": "trail_fordyce",
};

export async function markTrailComplete(userId: string, trailId: string) {
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? snap.data() : {};
  const existing: string[] = data.achievements ?? [];
  const dates: Record<string, number> = data.achievementDates ?? {};
  const completed: string[] = data.completedTrails ?? [];

  const toAdd: string[] = [];
  const now = Date.now();

  // Trail-specific achievement
  const trailAch = TRAIL_ACHIEVEMENT_MAP[trailId];
  if (trailAch && !existing.includes(trailAch)) {
    toAdd.push(trailAch);
    dates[trailAch] = now;
  }

  // First trail achievement
  if (!existing.includes("first_trail")) {
    toAdd.push("first_trail");
    dates["first_trail"] = now;
  }

  // Update completed trails list
  const newCompleted = completed.includes(trailId) ? completed : [...completed, trailId];

  // Milestone: 3 trails
  if (newCompleted.length >= 3 && !existing.includes("trails_3")) {
    toAdd.push("trails_3");
    dates["trails_3"] = now;
  }

  // Milestone: all 6 trails
  if (newCompleted.length >= 6 && !existing.includes("trails_6")) {
    toAdd.push("trails_6");
    dates["trails_6"] = now;
  }

  const newAchievements = [...new Set([...existing, ...toAdd])];

  await setDoc(
    userRef,
    {
      achievements: newAchievements,
      achievementDates: dates,
      completedTrails: newCompleted,
    },
    { merge: true }
  );

  return toAdd;
}
