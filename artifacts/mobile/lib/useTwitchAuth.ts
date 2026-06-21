"use no memo";
import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "twitch_auth";

interface TwitchAuth {
  token: string;
  channel: string;
  displayName: string;
}

function getApiBase(): string {
  // EXPO_PUBLIC_API_URL is set in eas.json for standalone builds (points to deployed API)
  // EXPO_PUBLIC_DOMAIN is set by the Replit dev script for local development
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) return apiUrl.replace(/\/$/, "");
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "";
}

export function useTwitchAuth(uid: string | undefined) {
  const [auth, setAuth] = useState<TwitchAuth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cached auth on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setAuth(JSON.parse(raw) as TwitchAuth);
      })
      .catch(() => {});
  }, []);

  const saveAuth = useCallback(async (newAuth: TwitchAuth) => {
    setAuth(newAuth);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newAuth));
  }, []);

  // ── WEB: window.open + localStorage polling ─────────────────────────────
  const connectWeb = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);

    // Clear any stale result from a previous attempt
    try { localStorage.removeItem("tp_twitch_auth"); } catch (_) {}

    return new Promise<void>((resolve) => {
      const apiBase = getApiBase();
      const url = `${apiBase}/api/auth/twitch?uid=${encodeURIComponent(uid)}&platform=web`;
      const popup = (window as Window).open(url, "twitch-auth", "width=520,height=680,noopener=no");

      let done = false;

      async function finish(raw: string | null) {
        if (done) return;
        done = true;
        clearInterval(lsTimer);
        clearInterval(popupTimer);
        // postMessage listener cleanup handled below

        if (raw) {
          try {
            const payload = JSON.parse(raw) as {
              token?: string;
              channel?: string;
              display_name?: string;
              error?: string;
            };
            if (payload.error) {
              setError(payload.error);
            } else if (payload.token && payload.channel) {
              await saveAuth({
                token: payload.token,
                channel: payload.channel,
                displayName: payload.display_name ?? payload.channel,
              });
            }
          } catch {
            setError("Invalid response from Twitch");
          }
        }
        setLoading(false);
        resolve();
      }

      // Primary: poll localStorage every 300ms (works even if opener is null)
      const lsTimer = setInterval(() => {
        try {
          const raw = localStorage.getItem("tp_twitch_auth");
          if (raw) {
            localStorage.removeItem("tp_twitch_auth");
            void finish(raw);
          }
        } catch (_) {}
      }, 300);

      // Secondary: postMessage fallback (works if opener isn't blocked)
      const onMessage = (event: MessageEvent) => {
        if (!event.data || event.data.type !== "twitch-auth") return;
        window.removeEventListener("message", onMessage);
        const payload = event.data.payload as Record<string, string>;
        void finish(JSON.stringify(payload));
      };
      window.addEventListener("message", onMessage);

      // Detect popup closed without completing
      const popupTimer = setInterval(() => {
        if (popup?.closed && !done) {
          window.removeEventListener("message", onMessage);
          // Give localStorage one last check before giving up
          try {
            const raw = localStorage.getItem("tp_twitch_auth");
            if (raw) { localStorage.removeItem("tp_twitch_auth"); void finish(raw); return; }
          } catch (_) {}
          void finish(null);
        }
      }, 400);
    });
  }, [uid, saveAuth]);

  // ── NATIVE: WebBrowser.openAuthSessionAsync + deep link ─────────────────
  const connectNative = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);

    try {
      const apiBase = getApiBase();
      // Linking.createURL works correctly in both Expo Go (exp://...) and
      // standalone builds (mobile://...), unlike a hardcoded mobile:// scheme.
      const redirectUrl = Linking.createURL("twitch-callback");
      const url =
        `${apiBase}/api/auth/twitch` +
        `?uid=${encodeURIComponent(uid)}` +
        `&platform=native` +
        `&mobileRedirect=${encodeURIComponent(redirectUrl)}`;

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);

      if (result.type === "success") {
        const parsed = Linking.parse(result.url);
        const params = parsed.queryParams ?? {};

        if (params.error) {
          setError(String(params.error));
        } else if (params.token && params.channel) {
          await saveAuth({
            token: String(params.token),
            channel: String(params.channel),
            displayName: String(params.display_name ?? params.channel),
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Auth error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [uid, saveAuth]);

  const connect = Platform.OS === "web" ? connectWeb : connectNative;

  const disconnect = useCallback(async () => {
    setAuth(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateTitle = useCallback(
    async (title: string): Promise<boolean> => {
      if (!auth) return false;
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/auth/twitch/update-title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: auth.token, title, channel: auth.channel }),
        });
        const data = (await res.json()) as { ok: boolean };
        return data.ok;
      } catch {
        return false;
      }
    },
    [auth]
  );

  return { auth, loading, error, connect, disconnect, updateTitle };
}
