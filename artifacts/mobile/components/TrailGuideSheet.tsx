import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialIcons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useActivityMode } from "@/context/ActivityModeContext";
import type { TrailGuide } from "@/lib/trail-guide";
import { SOURCE_CONFIG } from "@/lib/trail-guide";
import { fetchCampsiteExtras, type CampsiteExtras } from "@/lib/campsite-enrich";

interface TrailGuideSheetProps {
  guide: TrailGuide | null;
  onClose: () => void;
  onNavigate: (
    coords: Array<{ lat: number; lng: number }>,
    name: string,
    difficultyRating?: number,
  ) => void;
  onGroupRide?: (action: "start" | "join") => void;
  activeRideInfo?: { memberCount: number } | null;
}

function StatChip({ icon, label, value, color }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  const colors = useColors();
  return (
    <View style={[chipStyles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <MaterialIcons name={icon} size={13} color={color} />
      <View style={chipStyles.chipTextWrap}>
        <Text style={[chipStyles.chipLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[chipStyles.chipValue, { color: colors.foreground }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minWidth: 90,
  },
  chipTextWrap: { flex: 1, minWidth: 0 },
  chipLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  chipValue: { fontSize: 12, fontWeight: "700", marginTop: 1 },
});

export default function TrailGuideSheet({ guide, onClose, onNavigate, onGroupRide, activeRideInfo }: TrailGuideSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useActivityMode();
  const isHike = mode === "hiking";
  const activityWord = isHike ? "HIKE" : "RIDE";
  const memberWord = isHike ? "HIKER" : "RIDER";

  // On-open enrichment (elevation + weather via Open-Meteo) — same treatment
  // the campground sheet gets; USFS/OSM/BLM points carry no conditions data.
  const [extras, setExtras] = useState<CampsiteExtras | null>(null);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const guideLng = guide?.startCoord?.[0] ?? 0;
  const guideLat = guide?.startCoord?.[1] ?? 0;
  useEffect(() => {
    // startCoord falls back to [0,0] for a few sources — skip the fetch then.
    if (!guide || (guideLat === 0 && guideLng === 0)) {
      setExtras(null);
      setExtrasLoading(false);
      return;
    }
    let cancelled = false;
    setExtras(null);
    setExtrasLoading(true);
    fetchCampsiteExtras(guideLat, guideLng)
      .then((e) => {
        if (!cancelled) setExtras(e);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setExtrasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guide?.id, guideLat, guideLng]);

  const handleNavigate = useCallback(() => {
    if (!guide?.routeCoordinates?.length) return;
    onNavigate(guide.routeCoordinates, guide.name);
    onClose();
  }, [guide, onNavigate, onClose]);

  const handleAskAi = useCallback(() => {
    if (!guide) return;
    const coordPart =
      guideLat !== 0 || guideLng !== 0
        ? ` (coordinates ${guideLat.toFixed(4)}, ${guideLng.toFixed(4)}${guide.managingOrg ? `, managed by ${guide.managingOrg}` : ""})`
        : guide.managingOrg
          ? ` (managed by ${guide.managingOrg})`
          : "";
    const prompt = isHike
      ? `Tell me about hiking at ${guide.name}${coordPart}. What is the trail like, is there cell coverage, what are current conditions, and what should I bring?`
      : mode === "camping"
        ? `Tell me about visiting and camping near ${guide.name}${coordPart}. What is road access like, is there cell coverage, what are current conditions, and what should I pack?`
        : `Tell me about riding at ${guide.name}${coordPart}. What is the terrain and road access like, is there cell coverage, what are current conditions, and what should I pack?`;
    onClose();
    router.push({ pathname: "/(tabs)/assistant", params: { mode, prompt } });
  }, [guide, guideLat, guideLng, isHike, mode, onClose, router]);

  if (!guide) return null;

  const src = SOURCE_CONFIG[guide.source];
  const hasRoute = (guide.routeCoordinates?.length ?? 0) >= 2;

  // Build mileage waypoints for the guide (every ~1 mile, max 8)
  const waypoints: Array<{ mile: number; coord: { lat: number; lng: number } }> = [];
  if (guide.routeCoordinates && guide.lengthMiles) {
    const coords = guide.routeCoordinates;
    const interval = Math.max(1, Math.floor(coords.length / Math.min(8, Math.ceil(guide.lengthMiles))));
    let accumulated = 0;
    for (let i = interval; i < coords.length; i += interval) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const R = 3958.8;
      const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
      const dLng = ((curr.lng - prev.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((prev.lat * Math.PI) / 180) *
          Math.cos((curr.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      accumulated += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      waypoints.push({ mile: parseFloat(accumulated.toFixed(1)), coord: curr });
      if (waypoints.length >= 6) break;
    }
  }

  return (
    <Modal
      transparent
      visible={!!guide}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: insets.bottom + 16,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Handle bar */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Source badge */}
        <View style={styles.badgeRow}>
          <View style={[styles.sourceBadge, { backgroundColor: src.color }]}>
            <Text style={[styles.sourceBadgeText, { color: src.textColor }]}>
              {src.label.toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
          {/* Trail name */}
          <Text style={[styles.trailName, { color: colors.foreground }]}>{guide.name}</Text>
          {guide.subtitle ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{guide.subtitle}</Text>
          ) : null}

          {/* Stats chips */}
          <View style={styles.statsRow}>
            {guide.lengthMiles ? (
              <StatChip icon="straighten" label="Length" value={`${guide.lengthMiles.toFixed(1)} mi`} color={src.color} />
            ) : null}
            {guide.surface ? (
              <StatChip icon="terrain" label="Surface" value={guide.surface.replace(/_/g, " ")} color={src.color} />
            ) : null}
            {guide.trailClass ? (
              <StatChip icon="speed" label="Class" value={guide.trailClass} color={src.color} />
            ) : null}
          </View>

          {/* On-tap enrichment: elevation + live conditions (Open-Meteo) —
              same treatment the campground sheet gets. */}
          {extrasLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
              <ActivityIndicator size="small" color={src.color} />
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                Checking elevation & conditions…
              </Text>
            </View>
          ) : extras ? (
            <>
              {(extras.elevationFt !== null || extras.currentTempF !== null || extras.sunrise || extras.sunset) ? (
                <View style={[styles.statsRow, { marginTop: 10 }]}>
                  {extras.elevationFt !== null ? (
                    <StatChip
                      icon="landscape"
                      label="Elevation"
                      value={`${extras.elevationFt.toLocaleString()} ft`}
                      color={src.color}
                    />
                  ) : null}
                  {extras.currentTempF !== null ? (
                    <StatChip
                      icon="wb-sunny"
                      label="Right now"
                      value={`${extras.currentTempF}°F${extras.currentLabel ? ` · ${extras.currentLabel}` : ""}`}
                      color={src.color}
                    />
                  ) : null}
                  {(extras.sunrise || extras.sunset) ? (
                    <StatChip
                      icon="schedule"
                      label="Sunrise / set"
                      value={[extras.sunrise, extras.sunset].filter(Boolean).join(" · ")}
                      color={src.color}
                    />
                  ) : null}
                </View>
              ) : null}
              {extras.days.length > 0 ? (
                <View style={[styles.statsRow, { marginTop: 8 }]}>
                  {extras.days.map((d, i) => (
                    <View
                      key={`${d.day}-${i}`}
                      style={[chipStyles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}
                    >
                      <View style={chipStyles.chipTextWrap}>
                        <Text style={[chipStyles.chipLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {i === 0 ? "Today" : d.day}
                        </Text>
                        <Text style={[chipStyles.chipValue, { color: colors.foreground }]} numberOfLines={1}>
                          {d.hiF}° / {d.loF}°{d.precipPct >= 15 ? ` · ${d.precipPct}%💧` : ""}
                        </Text>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.mutedForeground, marginTop: 1 }} numberOfLines={1}>
                          {d.label}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          {/* Allowed use */}
          {guide.allowedUse ? (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ALLOWED VEHICLES</Text>
              <Text style={[styles.sectionBody, { color: colors.foreground }]}>{guide.allowedUse}</Text>
            </View>
          ) : null}

          {/* Waypoints / route milestones */}
          {waypoints.length > 0 ? (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TRAIL WAYPOINTS</Text>
              <View style={styles.waypointList}>
                <View style={[styles.waypointItem, { borderColor: colors.border }]}>
                  <View style={[styles.waypointDot, { backgroundColor: src.color }]} />
                  <Text style={[styles.waypointText, { color: colors.foreground }]}>Start</Text>
                  <Text style={[styles.waypointMile, { color: colors.mutedForeground }]}>Mile 0</Text>
                </View>
                {waypoints.map((wp, i) => (
                  <View key={i} style={[styles.waypointItem, { borderColor: colors.border }]}>
                    <View style={[styles.waypointDot, { backgroundColor: colors.border }]} />
                    <Text style={[styles.waypointText, { color: colors.foreground }]}>
                      Waypoint {i + 1}
                    </Text>
                    <Text style={[styles.waypointMile, { color: colors.mutedForeground }]}>
                      Mile {wp.mile}
                    </Text>
                  </View>
                ))}
                {guide.routeCoordinates && (
                  <View style={[styles.waypointItem, { borderColor: colors.border }]}>
                    <View style={[styles.waypointDot, { backgroundColor: "#E74C3C" }]} />
                    <Text style={[styles.waypointText, { color: colors.foreground }]}>End</Text>
                    <Text style={[styles.waypointMile, { color: colors.mutedForeground }]}>
                      {guide.lengthMiles ? `Mile ${guide.lengthMiles.toFixed(1)}` : "Finish"}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : null}

          {/* Description */}
          {guide.description ? (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ABOUT THIS TRAIL</Text>
              <Text style={[styles.sectionBody, { color: colors.foreground }]}>{guide.description}</Text>
            </View>
          ) : null}

          {/* Directions */}
          {guide.directions ? (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>GETTING THERE</Text>
              <Text style={[styles.sectionBody, { color: colors.foreground }]}>{guide.directions}</Text>
            </View>
          ) : null}

          {/* Managing org */}
          {guide.managingOrg ? (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MANAGED BY</Text>
              <Text style={[styles.sectionBody, { color: colors.foreground }]}>{guide.managingOrg}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* CTA */}
        <TouchableOpacity
          style={[
            styles.navBtn,
            {
              backgroundColor: hasRoute ? src.color : colors.border,
              marginTop: 14,
            },
          ]}
          onPress={handleNavigate}
          activeOpacity={0.85}
          disabled={!hasRoute}
        >
          <MaterialIcons
            name="navigation"
            size={16}
            color={hasRoute ? src.textColor : colors.mutedForeground}
          />
          <Text style={[styles.navBtnText, { color: hasRoute ? src.textColor : colors.mutedForeground }]}>
            {hasRoute ? "FOLLOW THIS TRAIL" : "NO GPS ROUTE AVAILABLE"}
          </Text>
        </TouchableOpacity>

        {!!onGroupRide && (
          <TouchableOpacity
            style={[styles.navBtn, {
              backgroundColor: activeRideInfo ? "#1E88E5" : "#43A047",
              marginTop: 8,
            }]}
            onPress={() => onGroupRide(activeRideInfo ? "join" : "start")}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="account-group" size={17} color="#fff" />
            <Text style={[styles.navBtnText, { color: "#fff" }]}>
              {activeRideInfo
                ? `JOIN GROUP ${activityWord}  (${activeRideInfo.memberCount} ${memberWord}${activeRideInfo.memberCount !== 1 ? "S" : ""})`
                : `START GROUP ${activityWord}`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Hand the spot to the AI Trip Assistant — matches the campground sheet */}
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: "#7B3F9E", marginTop: 8 }]}
          onPress={handleAskAi}
          activeOpacity={0.85}
        >
          <Text style={[styles.navBtnText, { color: "#fff" }]}>✨ ASK AI ABOUT THIS SPOT</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  trailName: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
  },
  waypointList: { gap: 0 },
  waypointItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  waypointDot: { width: 10, height: 10, borderRadius: 5 },
  waypointText: { flex: 1, fontSize: 13, fontWeight: "600" },
  waypointMile: { fontSize: 11, fontWeight: "700" },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
