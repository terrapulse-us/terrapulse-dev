import { Alert } from "react-native";

// The Firebase JS SDK on RN has no Firestore disk persistence, so an offline
// setDoc/updateDoc/deleteDoc never resolves — it just queues forever and any
// awaited save flow hangs with its button stuck. Every user-facing save must:
//   1. fail fast with a friendly alert when we already know we're offline
//   2. race the write against a timeout so a mid-flight connectivity drop
//      still clears the saving state and lets the user retry
// Mirrors the pattern used by the assistant's itinerary SAVE flow.

export const SAVE_TIMEOUT_MS = 15_000;

/**
 * Shows the standard "you're offline" alert. Call when a save is attempted
 * while `useOnline()` reports offline.
 */
export function alertOffline(what: string = "this"): void {
  Alert.alert(
    "You're offline",
    `Can't save ${what} right now. Reconnect and try again — your saved items are still available offline.`,
  );
}

/**
 * Races a Firestore write (or any promise) against a timeout so an offline
 * hang can't leave a saving state stuck forever. Rejects with a
 * "save-timeout" error after `ms` (default 15s).
 */
export function withSaveTimeout<T>(promise: Promise<T>, ms: number = SAVE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("save-timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
