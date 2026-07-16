import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

// JS-only connectivity detection. The installed native build has no netinfo /
// expo-network module and this app ships fixes over OTA updates, so adding a
// native dependency is not an option — instead we probe a tiny always-on
// endpoint (Google's generate_204, the same target Android itself uses for
// captive-portal checks) on an interval and whenever the app foregrounds.

const PROBE_URL = "https://clients3.google.com/generate_204";
const PROBE_INTERVAL_MS = 25_000;
const PROBE_TIMEOUT_MS = 4_000;

async function probe(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(PROBE_URL, { signal: ctrl.signal });
    return resp.status >= 200 && resp.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the current connectivity state. Starts optimistic (true) and
 * settles after the first probe (~0-4s). Re-checks every 25s and on app
 * foreground.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let inFlight = false;

    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      const ok = await probe();
      if (mountedRef.current) setOnline(ok);
      inFlight = false;
    };

    check();
    const interval = setInterval(check, PROBE_INTERVAL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return online;
}
