import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const firebaseConfig = {
  apiKey: extra.firebaseApiKey ?? "",
  authDomain: extra.firebaseAuthDomain ?? "",
  projectId: extra.firebaseProjectId ?? "",
  storageBucket: extra.firebaseStorageBucket ?? "",
  messagingSenderId: extra.firebaseMessagingSenderId ?? "",
  appId: extra.firebaseAppId ?? "",
};

const isNew = getApps().length === 0;
const app = isNew ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = isNew
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : getAuth(app);

export const db = getFirestore(app);
export const storage = getStorage(app);
