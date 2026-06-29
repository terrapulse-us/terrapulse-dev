import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const firebaseConfig = {
  apiKey:
    extra.firebaseApiKey ||
    "AIzaSyAeDhG331jkGKH8haGKSX8ShmlWSGNf3Do",
  authDomain:
    extra.firebaseAuthDomain ||
    "california-offroad-explorer.firebaseapp.com",
  projectId:
    extra.firebaseProjectId ||
    "california-offroad-explorer",
  storageBucket:
    extra.firebaseStorageBucket ||
    "california-offroad-explorer.firebasestorage.app",
  messagingSenderId:
    extra.firebaseMessagingSenderId ||
    "516913346465",
  appId:
    extra.firebaseAppId ||
    "1:516913346465:web:2b01f1220d182a3911bde0",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
