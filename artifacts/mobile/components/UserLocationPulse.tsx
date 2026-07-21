import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ActivityMode } from "@/context/ActivityModeContext";

const RING_SIZE = 56;
const BADGE_SIZE = 34;

type McIconName = keyof typeof MaterialCommunityIcons.glyphMap;

// Per-activity-mode puck: icon + accent color for badge and pulsing ring.
const MODE_PUCK: Record<ActivityMode, { icon: McIconName; color: string }> = {
  offroad: { icon: "car-lifted-pickup", color: "#FF5500" },
  camping: { icon: "tent", color: "#2E7D32" },
  hiking: { icon: "hiking", color: "#1976D2" },
};

interface Props {
  mode: ActivityMode;
}

export default function UserLocationPulse({ mode }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.55, 0.15, 0] });

  const { icon, color } = MODE_PUCK[mode];

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <Animated.View
        style={[
          styles.ring,
          { backgroundColor: color, transform: [{ scale }], opacity },
        ]}
      />
      <View style={[styles.badge, { backgroundColor: color }]}>
        <MaterialCommunityIcons name={icon} size={20} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
