import AsyncStorage from "@react-native-async-storage/async-storage";

// Read-through cache for Firestore-backed data. The firebase JS SDK has no
// disk persistence on React Native (persistentLocalCache is IndexedDB-only),
// so a cold app start with no connectivity would otherwise show empty
// vehicles/crew/notes forever. Listeners seed their state from this cache
// immediately, then overwrite it (and re-cache) when the live snapshot lands.

const PREFIX = "offline-cache:";
// AsyncStorage on Android has a ~6MB total budget by default — refuse to
// cache any single value large enough to threaten it.
const MAX_VALUE_BYTES = 400_000;

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_VALUE_BYTES) return;
    await AsyncStorage.setItem(PREFIX + key, json);
  } catch {
    // best-effort
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
