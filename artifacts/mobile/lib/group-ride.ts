import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const RIDER_COLORS = [
  "#E53935",
  "#1E88E5",
  "#43A047",
  "#FB8C00",
  "#8E24AA",
  "#00ACC1",
];

export interface GroupRide {
  id: string;
  trailId: string;
  trailName: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  active: boolean;
}

export interface RideMember {
  uid: string;
  displayName: string;
  lat: number;
  lng: number;
  color: string;
  updatedAt: Timestamp;
}

export interface RideMessage {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: Timestamp;
}

export async function createGroupRide(
  trailId: string,
  trailName: string,
  uid: string,
  displayName: string,
  lat: number,
  lng: number
): Promise<string> {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const rideRef = await addDoc(collection(db, "group_rides"), {
    trailId,
    trailName,
    createdBy: uid,
    createdByName: displayName,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    active: true,
  });
  await setDoc(doc(db, "group_rides", rideRef.id, "members", uid), {
    uid,
    displayName,
    lat,
    lng,
    color: RIDER_COLORS[0],
    updatedAt: serverTimestamp(),
  });
  return rideRef.id;
}

export async function getActiveRideForTrail(trailId: string): Promise<{ ride: GroupRide; memberCount: number } | null> {
  const now = Timestamp.now();
  const q = query(
    collection(db, "group_rides"),
    where("trailId", "==", trailId),
    where("active", "==", true),
    where("expiresAt", ">", now)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const ride = { id: d.id, ...d.data() } as GroupRide;
  const membersSnap = await getDocs(collection(db, "group_rides", ride.id, "members"));
  return { ride, memberCount: membersSnap.size };
}

export async function joinGroupRide(
  rideId: string,
  uid: string,
  displayName: string,
  lat: number,
  lng: number
): Promise<void> {
  const membersSnap = await getDocs(collection(db, "group_rides", rideId, "members"));
  const usedColors = membersSnap.docs.map((d) => d.data().color as string);
  const color =
    RIDER_COLORS.find((c) => !usedColors.includes(c)) ??
    RIDER_COLORS[membersSnap.size % RIDER_COLORS.length];
  await setDoc(doc(db, "group_rides", rideId, "members", uid), {
    uid,
    displayName,
    lat,
    lng,
    color,
    updatedAt: serverTimestamp(),
  });
}

export async function leaveGroupRide(
  rideId: string,
  uid: string,
  isCreator: boolean
): Promise<void> {
  await deleteDoc(doc(db, "group_rides", rideId, "members", uid));
  if (isCreator) {
    await updateDoc(doc(db, "group_rides", rideId), { active: false });
  }
}

export async function broadcastLocation(
  rideId: string,
  uid: string,
  lat: number,
  lng: number
): Promise<void> {
  await setDoc(
    doc(db, "group_rides", rideId, "members", uid),
    { lat, lng, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export function subscribeToMembers(
  rideId: string,
  callback: (members: RideMember[]) => void
): () => void {
  return onSnapshot(
    collection(db, "group_rides", rideId, "members"),
    (snap) => {
      callback(snap.docs.map((d) => d.data() as RideMember));
    }
  );
}

export function subscribeToMessages(
  rideId: string,
  callback: (messages: RideMessage[]) => void
): () => void {
  const q = query(
    collection(db, "group_rides", rideId, "messages"),
    orderBy("createdAt", "asc"),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RideMessage)
    );
  });
}

export async function sendMessage(
  rideId: string,
  uid: string,
  displayName: string,
  text: string
): Promise<void> {
  await addDoc(collection(db, "group_rides", rideId, "messages"), {
    uid,
    displayName,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}
