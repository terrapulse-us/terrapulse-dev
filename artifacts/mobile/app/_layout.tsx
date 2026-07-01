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
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text, View } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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

  // Passive: reload when native layer signals a downloaded update is ready
  useEffect(() => {
    if (isUpdatePending) {
      Updates.reloadAsync().catch(() => {});
    }
  }, [isUpdatePending]);

  // Active fallback: explicit check→download→reload
  const [otaError, setOtaError] = React.useState<string | null>(null);
  useEffect(() => {
    if (!Updates.isEnabled) return;
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

  // OTA_MARKER_v2
  const label = otaError
    ? `ERR: ${otaError}`
    : isChecking
    ? "\u27f3 OTA check\u2026"
    : isDownloading
    ? "\u2b07 Downloading\u2026"
    : isUpdatePending
    ? "\u2713 Reloading\u2026"
    : isOta
    ? `OTA-v2: ${shortId}`
    : `APK | en:${Updates.isEnabled}`;

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

            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 52,
                right: 10,
                backgroundColor: "rgba(0,0,0,0.55)",
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 3,
                zIndex: 9999,
              }}
            >
              <Text
                style={{ color: badgeColor, fontSize: 10, fontFamily: "monospace" }}
              >
                {label}
              </Text>
            </View>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
