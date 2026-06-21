import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

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

export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: buildAsyncStoragePersistence() as any,
      });

export const db = getFirestore(app);
export const storage = getStorage(app);
