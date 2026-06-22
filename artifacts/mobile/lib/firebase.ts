import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Firebase config is embedded at build time via app.config.js → extra.
// This works in both Replit dev (GOOGLE_API_KEY secret) and EAS builds
// (GOOGLE_API_KEY or EXPO_PUBLIC_FIREBASE_API_KEY EAS secret).
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const firebaseConfig = {
  apiKey: extra.firebaseApiKey ?? "",
  authDomain: extra.firebaseAuthDomain ?? "",
  projectId: extra.firebaseProjectId ?? "",
  storageBucket: extra.firebaseStorageBucket ?? "",
  messagingSenderId: extra.firebaseMessagingSenderId ?? "",
  appId: extra.firebaseAppId ?? "",
};

function buildAsyncStoragePersistence() {
  const AsyncStorage =
    require("@react-native-async-storage/async-storage").default;
  return {
    type: "LOCAL" as const,
    _isAvailable: async () => true,
    _set: async (key: string, value: string) => {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    _get: async (key: string) => {
      const raw = await AsyncStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as string) : null;
    },
    _remove: async (key: string) => {
      await AsyncStorage.removeItem(key);
    },
    _addListener: (_key: string, _listener: () => void) => {},
    _removeListener: (_key: string, _listener: () => void) => {},
  };
}

function initAuth(): Auth {
  const app =
    getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

  if (Platform.OS === "web") {
    return getAuth(app);
  }
  try {
    return initializeAuth(app, {
      persistence: buildAsyncStoragePersistence() as never,
    });
  } catch {
    return getAuth(app);
  }
}

const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = initAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
