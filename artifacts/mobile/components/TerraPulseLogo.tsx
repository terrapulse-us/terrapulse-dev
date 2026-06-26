import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline } from "react-native-svg";

interface Props {
  color?: string;
  size?: "sm" | "md" | "lg";
}

export default function TerraPulseLogo({
  color = "#1E3A1E",
  size = "md",
}: Props) {
  const scale = size === "sm" ? 0.75 : size === "lg" ? 1.35 : 1;
  const iconW = 32 * scale;
  const iconH = 22 * scale;
  const fontSize = 15 * scale;
  const letterSpacing = 2 * scale;

  return (
    <View style={styles.row}>
      <Svg
        width={iconW}
        height={iconH}
        viewBox="0 0 32 22"
        style={{ marginRight: 6 * scale }}
      >
        {/* Mountain silhouette — two peaks, stroke only */}
        <Polyline
          points="0,22 9,5 15,13 21,2 32,22"
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      <Text
        style={[
          styles.wordmark,
          { color, fontSize, letterSpacing },
        ]}
      >
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
