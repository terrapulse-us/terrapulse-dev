import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Text } from "react-native";

const DOT_COLOR = "#E53935";
const RING_COLOR = "#E53935";
const DOT_SIZE = 18;
const RING_SIZE = 60;

interface Props {
  label?: string;
}

export default function SosPulse({ label }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 0.2, 0] });

  return (
    <View style={styles.container} pointerEvents="none">
      {label ? (
        <View style={styles.label}>
          <Text style={styles.labelText} numberOfLines={1}>{label}</Text>
        </View>
      ) : null}
      <View style={styles.wrapper}>
        <Animated.View style={[styles.ring, { transform: [{ scale }], opacity }]} />
        <View style={styles.dot}>
          <Text style={styles.sosText}>SOS</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  label: {
    backgroundColor: "rgba(229,57,53,0.92)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
    maxWidth: 120,
  },
  labelText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
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
    backgroundColor: RING_COLOR,
  },
  dot: {
    width: DOT_SIZE + 6,
    height: DOT_SIZE + 6,
    borderRadius: (DOT_SIZE + 6) / 2,
    backgroundColor: DOT_COLOR,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  sosText: {
    color: "#fff",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
