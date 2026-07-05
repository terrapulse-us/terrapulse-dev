import "@/lib/native-guard";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, View } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Hidden for now — flip back to true if we need to debug OTA update status again.
const SHOW_OTA_PILL = false;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const {
    currentlyRunning,
    isUpdatePending,
    isChecking,
    isDownloading,
  } = Updates.useUpdates();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Passive hook: reloads when native layer signals a downloaded update is ready
  useEffect(() => {
    if (isUpdatePending) {
      Updates.reloadAsync().catch(() => {});
    }
  }, [isUpdatePending]);

  // Active fallback: explicitly check → download → reload so we don't rely solely
  // on the native ON_LOAD pre-JS check (which silently no-ops if Updates.isEnabled
  // is false at the native layer due to missing channel config in eas.json).
  const [otaError, setOtaError] = React.useState<string | null>(null);
  useEffect(() => {
    if (!Updates.isEnabled) return;
    // channel is only embedded when built via EAS with a profile that has a channel
    // configured (e.g. preview for Android, production for iOS). Without it the
    // server returns 400 "channel-name: Required" — skip the check silently.
    if (!Updates.channel) return;
    Updates.checkForUpdateAsync()
      .then(async ({ isAvailable }) => {
        if (isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setOtaError(msg.slice(0, 60));
      });
  }, []);

  if (!fontsLoaded && !fontError) return null;

  const isOta = !!currentlyRunning?.updateId && !currentlyRunning?.isEmbeddedLaunch;
  const shortId = currentlyRunning?.updateId?.slice(0, 8) ?? "?";

  const label = otaError
    ? `ERR: ${otaError}`
    : isChecking
    ? "⟳ OTA check…"
    : isDownloading
    ? "⬇ Downloading…"
    : isUpdatePending
    ? "✓ Reloading…"
    : isOta
    ? `OTA: ${shortId}`
    : `APK | enabled:${Updates.isEnabled}`;

  const badgeColor = otaError ? "#ef4444" : isOta ? "#22c55e" : "#9ca3af";

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="user/[uid]" />
              </Stack>
            </AuthProvider>

            {SHOW_OTA_PILL && <OtaPill label={label} badgeColor={badgeColor} />}
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function OtaPill({ label, badgeColor }: { label: string; badgeColor: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: insets.top + 8,
        right: 10,
        backgroundColor: "rgba(0,0,0,0.55)",
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 3,
        zIndex: 9999,
      }}
    >
      <Text style={{ color: badgeColor, fontSize: 10, fontFamily: "monospace" }}>
        {label}
      </Text>
    </View>
  );
}
