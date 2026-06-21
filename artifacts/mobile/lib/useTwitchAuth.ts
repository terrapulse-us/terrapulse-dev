"use no memo";
import { useState, useEffect, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "twitch_auth";

interface TwitchAuth {
  token: string;
  channel: string;
  displayName: string;
}

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

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

  const connect = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE}/api/auth/twitch?uid=${encodeURIComponent(uid)}`;
      const result = await WebBrowser.openAuthSessionAsync(url, "mobile://");

      if (result.type === "success") {
        const parsed = Linking.parse(result.url);
        const params = parsed.queryParams ?? {};

        if (params.error) {
          setError(String(params.error));
        } else {
          const newAuth: TwitchAuth = {
            token: String(params.token ?? ""),
            channel: String(params.channel ?? ""),
            displayName: String(params.display_name ?? params.channel ?? ""),
          };
          setAuth(newAuth);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newAuth));
        }
      }
    } catch (e) {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }, [uid]);

  const disconnect = useCallback(async () => {
    setAuth(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateTitle = useCallback(
    async (title: string): Promise<boolean> => {
      if (!auth) return false;
      try {
        const res = await fetch(`${API_BASE}/api/auth/twitch/update-title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: auth.token,
            title,
            channel: auth.channel,
          }),
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
