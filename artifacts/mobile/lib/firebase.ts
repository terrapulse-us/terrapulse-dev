import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const firebaseConfig = {
  apiKey: extra.firebaseApiKey || "AIzaSyAeDhG331jkGKH8haGKSX8ShmlWSGNf3Do",
  authDomain: extra.firebaseAuthDomain || "california-offroad-explorer.firebaseapp.com",
  projectId: extra.firebaseProjectId || "california-offroad-explorer",
  storageBucket: extra.firebaseStorageBucket || "california-offroad-explorer.firebasestorage.app",
  messagingSenderId: extra.firebaseMessagingSenderId || "516913346465",
  appId: extra.firebaseAppId || "1:516913346465:web:2b01f1220d182a3911bde0",
};

const asyncStoragePersistence = {
  type: "LOCAL" as const,
  async _isAvailable(): Promise<boolean> {
    try {
      await AsyncStorage.setItem("__firebase_test__", "1");
      await AsyncStorage.removeItem("__firebase_test__");
      return true;
    } catch {
      return false;
    }
  },
  async _set(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async _get(key: string): Promise<unknown> {
    const val = await AsyncStorage.getItem(key);
    return val ? (JSON.parse(val) as unknown) : null;
  },
  async _remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
  _addListener(_key: string, _listener: () => void): void {},
  _removeListener(_key: string, _listener: () => void): void {},
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function buildAuth() {
  try {
    return initializeAuth(app, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      persistence: asyncStoragePersistence as any,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = buildAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
