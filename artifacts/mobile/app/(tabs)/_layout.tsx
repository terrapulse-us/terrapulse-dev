import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Image, Platform, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import TutorialModal from "@/components/TutorialModal";

const broadcastIcon = require("@/assets/icons/broadcast.png");
const helmetIcon    = require("@/assets/icons/helmet.png");
const profileIcon   = require("@/assets/icons/profile.png");

export default function TabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === "web";

  return (
    <>
    <TutorialModal />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isWeb ? (
            <View style={[{ flex: 1, backgroundColor: colors.card }]} />
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
        name="stream"
        options={{
          title: "BROADCAST",
          tabBarIcon: ({ color }) => (
            <Image
              source={broadcastIcon}
              style={{ width: 24, height: 24, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "RANKS",
          tabBarIcon: ({ color }) => <Feather name="award" size={34} color={color} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "RIDERS",
          tabBarIcon: ({ color }) => (
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
