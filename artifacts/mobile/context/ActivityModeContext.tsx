import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ActivityMode = "offroad" | "camping" | "hiking";

export const ACTIVITY_MODE_KEY = "adventure.mode";

export function isActivityMode(v: unknown): v is ActivityMode {
  return v === "offroad" || v === "camping" || v === "hiking";
}

interface ActivityModeValue {
  mode: ActivityMode;
  setMode: (m: ActivityMode) => void;
  ready: boolean;
}

const ActivityModeContext = createContext<ActivityModeValue>({
  mode: "offroad",
  setMode: () => {},
  ready: false,
});

export function ActivityModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ActivityMode>("offroad");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ACTIVITY_MODE_KEY)
      .then((v) => {
        if (!cancelled && isActivityMode(v)) setModeState(v);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((m: ActivityMode) => {
    setModeState(m);
    AsyncStorage.setItem(ACTIVITY_MODE_KEY, m).catch(() => {});
  }, []);

  return (
    <ActivityModeContext.Provider value={{ mode, setMode, ready }}>
      {children}
    </ActivityModeContext.Provider>
  );
}

export function useActivityMode() {
  return useContext(ActivityModeContext);
}
