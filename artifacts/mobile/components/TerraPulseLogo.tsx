import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";

interface Props {
  color?: string;
  size?: "sm" | "md" | "lg";
}

// Full stacked logo (mountain mark + wordmark), transparent background
const LOGO_FULL = require("@/assets/images/logo-full.png");
// Mountain mark only, transparent background
const LOGO_MARK = require("@/assets/images/logo-mark.png");

// Source aspect ratios (width / height)
const FULL_ASPECT = 1572 / 1009;
const MARK_ASPECT = 1166 / 666;

export default function TerraPulseLogo({
  color = "#1E3A1E",
  size = "md",
}: Props) {
  if (size === "lg") {
    // Large: the full stacked logo (login / loading screens)
    const width = 220;
    return (
      <Image
        source={LOGO_FULL}
        style={{ width, height: width / FULL_ASPECT }}
        resizeMode="contain"
      />
    );
  }

  // Compact: mountain mark + wordmark text (screen headers)
  const scale = size === "sm" ? 0.75 : 1;
  const markH = 26 * scale;
  const fontSize = 15 * scale;
  const letterSpacing = 2 * scale;

  return (
    <View style={styles.row}>
      <Image
        source={LOGO_MARK}
        style={{
          width: markH * MARK_ASPECT,
          height: markH,
          marginRight: 7 * scale,
        }}
        resizeMode="contain"
      />
      <Text style={[styles.wordmark, { color, fontSize, letterSpacing }]}>
        TERRAPULSE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    fontWeight: "900",
  },
});
