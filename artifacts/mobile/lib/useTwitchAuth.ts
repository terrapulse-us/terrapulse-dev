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

  // ── WEB: window.open + postMessage ──────────────────────────────────────
  const connectWeb = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);

    return new Promise<void>((resolve) => {
      const apiBase = getApiBase();
      const url = `${apiBase}/api/auth/twitch?uid=${encodeURIComponent(uid)}&platform=web`;

      const popup = (window as Window).open(url, "twitch-auth", "width=520,height=640");

      const onMessage = async (event: MessageEvent) => {
        if (!event.data || event.data.type !== "twitch-auth") return;
        window.removeEventListener("message", onMessage);
        if (timer) clearInterval(timer);

        const payload = event.data.payload as {
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
        setLoading(false);
        resolve();
      };

      window.addEventListener("message", onMessage);

      // Detect if popup was closed without completing
      const timer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(timer);
          window.removeEventListener("message", onMessage);
          setLoading(false);
          resolve();
        }
      }, 500);
    });
  }, [uid, saveAuth]);

  // ── NATIVE: WebBrowser.openAuthSessionAsync + deep link ─────────────────
  const connectNative = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);

    try {
      const apiBase = getApiBase();
      const url = `${apiBase}/api/auth/twitch?uid=${encodeURIComponent(uid)}&platform=native`;
      const result = await WebBrowser.openAuthSessionAsync(url, "mobile://twitch-callback");

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
