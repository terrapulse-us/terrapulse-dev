import { Tabs } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useActivityMode, type ActivityMode } from "@/context/ActivityModeContext";
import TutorialModal from "@/components/TutorialModal";

const helmetIcon    = require("@/assets/icons/helmet.png");
const profileIcon   = require("@/assets/icons/profile.png");

const GARAGE_TAB: Record<ActivityMode, { title: string }> = {
  offroad: { title: "GARAGE" },
  camping: { title: "TENT" },
  hiking: { title: "RUCKSACK" },
};

const COMMUNITY_TAB: Record<ActivityMode, { title: string }> = {
  offroad: { title: "RIDERS" },
  camping: { title: "EXPLORERS" },
  hiking: { title: "TRAVELERS" },
};

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { mode } = useActivityMode();

  return (
    <>
    <TutorialModal />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
        tabBarLabelStyle: {
          fontWeight: "700" as const,
          fontSize: 10,
          letterSpacing: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "TRAILS",
          tabBarIcon: ({ color }) => <Feather name="map" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: GARAGE_TAB[mode].title,
          tabBarIcon: ({ color }) =>
            mode === "camping" ? (
              <MaterialCommunityIcons name="tent" size={23} color={color} />
            ) : mode === "hiking" ? (
              <MaterialCommunityIcons name="bag-personal-outline" size={23} color={color} />
            ) : (
              <Feather name="tool" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: "ASK",
          tabBarIcon: ({ color }) => <Feather name="message-square" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: COMMUNITY_TAB[mode].title,
          tabBarIcon: ({ color }) =>
            mode === "camping" ? (
              <Feather name="compass" size={22} color={color} />
            ) : mode === "hiking" ? (
              <MaterialCommunityIcons name="hiking" size={23} color={color} />
            ) : (
              <Image
                source={helmetIcon}
                style={{ width: 24, height: 24, tintColor: color }}
                resizeMode="contain"
              />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "PROFILE",
          tabBarIcon: ({ color }) => (
            <Image
              source={profileIcon}
              style={{ width: 40, height: 40, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
    </Tabs>
    </>
  );
}
