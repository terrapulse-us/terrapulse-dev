import React, { useState, useRef, useEffect } from "react";
import { View, Text, PanResponder, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

const EXG_MIN = 0.5;
const EXG_MAX = 4.0;
const THUMB = 24;

interface Colors {
  card: string;
  border: string;
  foreground: string;
  mutedForeground: string;
}

interface Props {
  value: number;
  onChange: (v: number) => void;
  colors: Colors;
}

export default function TerrainSlider({ value, onChange, colors }: Props) {
  const [displayValue, setDisplayValue] = useState(value);
  const [trackWidth, setTrackWidth] = useState(0);

  const trackWidthRef = useRef(0);
  const valueRef = useRef(value);
  const startPxRef = useRef(0);
  const onChangeRef = useRef(onChange);

  useEffect(() => { valueRef.current = value; setDisplayValue(value); }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const tw = trackWidthRef.current;
        startPxRef.current = ((valueRef.current - EXG_MIN) / (EXG_MAX - EXG_MIN)) * tw;
      },
      onPanResponderMove: (_, gs) => {
        const tw = trackWidthRef.current;
        if (!tw) return;
        const px = Math.max(0, Math.min(tw, startPxRef.current + gs.dx));
        setDisplayValue(EXG_MIN + (px / tw) * (EXG_MAX - EXG_MIN));
      },
      onPanResponderRelease: (_, gs) => {
        const tw = trackWidthRef.current;
        if (!tw) return;
        const px = Math.max(0, Math.min(tw, startPxRef.current + gs.dx));
        const raw = EXG_MIN + (px / tw) * (EXG_MAX - EXG_MIN);
        const snapped = Math.round(raw * 10) / 10;
        valueRef.current = snapped;
        setDisplayValue(snapped);
        onChangeRef.current(snapped);
      },
    })
  ).current;

  const percent = (displayValue - EXG_MIN) / (EXG_MAX - EXG_MIN);
  const thumbLeft = percent * trackWidth - THUMB / 2;
  const fillWidth = percent * trackWidth;

  const label =
    displayValue <= 0.9
      ? "FLAT"
      : displayValue <= 1.6
      ? "NATURAL"
      : displayValue <= 2.5
      ? "ENHANCED"
      : displayValue <= 3.4
      ? "DRAMATIC"
      : "EXTREME";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <MaterialIcons name="landscape" size={13} color="#FF5500" />
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>ELEVATION BOOST</Text>
        <Text style={[styles.valueLabel, { color: "#FF5500" }]}>
          {displayValue.toFixed(1)}× · {label}
        </Text>
      </View>

      <View style={styles.sliderRow}>
        <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>FLAT</Text>

        <View
          style={styles.trackWrap}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            trackWidthRef.current = w;
            setTrackWidth(w);
          }}
        >
          {/* Background track */}
          <View style={[styles.trackBg, { backgroundColor: colors.border }]} />
          {/* Filled portion */}
          {trackWidth > 0 && (
            <View style={[styles.trackFill, { width: fillWidth, backgroundColor: "#FF5500" }]} />
          )}
          {/* Draggable thumb */}
          {trackWidth > 0 && (
            <View
              {...panResponder.panHandlers}
              style={[
                styles.thumb,
                {
                  left: thumbLeft,
                  backgroundColor: colors.card,
                  borderColor: "#FF5500",
                },
              ]}
            />
          )}
        </View>

        <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>MAX</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  headerLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  valueLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rangeLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    width: 32,
    textAlign: "center",
  },
  trackWrap: {
    flex: 1,
    height: THUMB,
    justifyContent: "center",
  },
  trackBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
  },
  trackFill: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2.5,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
});
