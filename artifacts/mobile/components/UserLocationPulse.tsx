import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

const DOT_COLOR = "#33B5E5";
const DOT_SIZE = 16;
const RING_SIZE = 56;

export default function UserLocationPulse() {
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

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <Animated.View
        style={[
          styles.ring,
          { transform: [{ scale }], opacity },
        ]}
      />
      <View style={styles.dot} />
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
    backgroundColor: DOT_COLOR,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: DOT_COLOR,
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
