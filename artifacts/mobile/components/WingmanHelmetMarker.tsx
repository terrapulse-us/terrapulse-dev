import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const GREEN = "#00E676";
const RING = 54;
const DOT = 30;

interface Props {
  displayName: string;
}

export default function WingmanHelmetMarker({ displayName }: Props) {
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.timing(p1, { toValue: 1, duration: 1800, useNativeDriver: true })
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(p2, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop1.start();
    loop2.start();
    return () => { loop1.stop(); loop2.stop(); };
  }, [p1, p2]);

  const scale1 = p1.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.9] });
  const opacity1 = p1.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.65, 0.2, 0] });
  const scale2 = p2.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.9] });
  const opacity2 = p2.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.65, 0.2, 0] });

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <Animated.View style={[styles.ring, { transform: [{ scale: scale1 }], opacity: opacity1 }]} />
      <Animated.View style={[styles.ring, { transform: [{ scale: scale2 }], opacity: opacity2 }]} />
      <View style={styles.dot}>
        <MaterialCommunityIcons name="racing-helmet" size={15} color="#fff" />
      </View>
      <View style={styles.label}>
        <Text style={styles.labelText} numberOfLines={1}>{displayName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: RING,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    backgroundColor: GREEN,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: "#00C853",
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  label: {
    marginTop: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    maxWidth: 80,
  },
  labelText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
