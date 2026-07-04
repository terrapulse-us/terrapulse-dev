"use no memo";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  PanResponder,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { doc, onSnapshot, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import {
  Map as MapLibreMap,
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Marker,
} from "@maplibre/maplibre-react-native";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ALL_TRAILS } from "@/lib/trails";
import {
  decodePointsFlat,
  segmentDistanceMiles,
  segmentDurationSecs,
  formatRideDuration,
  makeSegmentId,
  type RidePoint,
  type RideSegment,
} from "@/lib/ride-utils";

interface RideDoc {
  startedAt: number;
  endedAt: number;
  durationSecs: number;
  distanceMiles: number;
  topSpeedMph: number;
  avgSpeedMph: number;
  elevationGainFt: number;
  name?: string | null;
  hasTrack?: boolean;
  segments?: RideSegment[];
}

const SEGMENT_COLORS = ["#00E5FF", "#FF4081", "#7C4DFF", "#FFD740", "#69F0AE", "#FF7043"];

function formatMi(n: number): string {
  return n.toFixed(2);
}

function RangeScrubber({
  total,
  start,
  end,
  onChange,
}: {
  total: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const containerRef = useRef<View>(null);
  const trackX = useRef(0);
  const trackWidth = useRef(0);
  const startRef = useRef(start);
  const endRef = useRef(end);
  startRef.current = start;
  endRef.current = end;

  const measure = useCallback(() => {
    containerRef.current?.measureInWindow((x, _y, width) => {
      trackX.current = x;
      trackWidth.current = width;
    });
  }, []);

  const indexFromPageX = useCallback(
    (pageX: number) => {
      const ratio = Math.min(1, Math.max(0, (pageX - trackX.current) / Math.max(1, trackWidth.current)));
      return Math.round(ratio * (total - 1));
    },
    [total]
  );

  const startPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => measure(),
      onPanResponderMove: (evt) => {
        const idx = Math.min(indexFromPageX(evt.nativeEvent.pageX), endRef.current - 1);
        onChange(Math.max(0, idx), endRef.current);
      },
    })
  ).current;

  const endPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => measure(),
      onPanResponderMove: (evt) => {
        const idx = Math.max(indexFromPageX(evt.nativeEvent.pageX), startRef.current + 1);
        onChange(startRef.current, Math.min(total - 1, idx));
      },
    })
  ).current;

  const startPct = total > 1 ? (start / (total - 1)) * 100 : 0;
  const endPct = total > 1 ? (end / (total - 1)) * 100 : 100;

  return (
    <View ref={containerRef} style={scrubberStyles.container} onLayout={measure}>
      <View style={scrubberStyles.track} />
      <View
        style={[
          scrubberStyles.rangeFill,
          { left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` },
        ]}
      />
      <View style={[scrubberStyles.handle, { left: `${startPct}%`, backgroundColor: "#00E676" }]} {...startPan.panHandlers} />
      <View style={[scrubberStyles.handle, { left: `${endPct}%`, backgroundColor: "#FF5252" }]} {...endPan.panHandlers} />
    </View>
  );
}

const scrubberStyles = StyleSheet.create({
  container: { height: 40, justifyContent: "center", marginTop: 8 },
  track: { height: 5, borderRadius: 3, backgroundColor: "rgba(128,128,128,0.35)" },
  rangeFill: { position: "absolute", height: 5, borderRadius: 3, backgroundColor: "#FF5500" },
  handle: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -12,
    borderWidth: 2,
    borderColor: "#fff",
    ...Platform.select({
      android: { elevation: 3 },
      default: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    }),
  },
});

export default function RideDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cameraRef = useRef<CameraRef>(null);

  const [ride, setRide] = useState<RideDoc | null>(null);
  const [trackPoints, setTrackPoints] = useState<RidePoint[]>([]);
  const [trackLoading, setTrackLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const deletingRef = useRef(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [addingSegment, setAddingSegment] = useState(false);
  const [draftStart, setDraftStart] = useState(0);
  const [draftEnd, setDraftEnd] = useState(1);
  const [draftName, setDraftName] = useState("");
  const [draftTrailId, setDraftTrailId] = useState<string | undefined>(undefined);
  const [trailPickerVisible, setTrailPickerVisible] = useState(false);
  const [trailSearch, setTrailSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    const unsub = onSnapshot(doc(db, "users", user.uid, "rides", id), (snap) => {
      if (deletingRef.current) return;
      if (snap.exists()) {
        setRide(snap.data() as RideDoc);
      } else {
        Alert.alert("Ride not found", "This ride may have been deleted.");
        router.back();
      }
      setLoading(false);
    });
    return unsub;
  }, [user, id]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    setTrackLoading(true);
    getDoc(doc(db, "users", user.uid, "rides", id, "track", "data"))
      .then((snap) => {
        if (cancelled) return;
        const flat = (snap.exists() ? (snap.data().points as number[] | undefined) : undefined) ?? [];
        setTrackPoints(decodePointsFlat(flat));
      })
      .catch(() => {
        if (!cancelled) setTrackPoints([]);
      })
      .finally(() => {
        if (!cancelled) setTrackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  const points: RidePoint[] = trackPoints;

  const segments = ride?.segments ?? [];

  useEffect(() => {
    if (!mapStyleLoaded || points.length < 2) return;
    const lats = points.map((p) => p.latitude);
    const lons = points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const pad = 0.01;
    cameraRef.current?.fitBounds(
      [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad],
      { padding: { top: 60, right: 40, bottom: 40, left: 40 }, duration: 500 }
    );
  }, [mapStyleLoaded, points]);

  const fullPathGeoJSON = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: points.map((p) => [p.longitude, p.latitude]),
      },
      properties: {},
    }),
    [points]
  );

  const segmentGeoJSON = useCallback(
    (seg: { startIndex: number; endIndex: number }) => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: points.slice(seg.startIndex, seg.endIndex + 1).map((p) => [p.longitude, p.latitude]),
      },
      properties: {},
    }),
    [points]
  );

  const draftGeoJSON = useMemo(
    () => segmentGeoJSON({ startIndex: draftStart, endIndex: draftEnd }),
    [segmentGeoJSON, draftStart, draftEnd]
  );

  const rideRef = user && id ? doc(db, "users", user.uid, "rides", id) : null;

  const startNameEdit = () => {
    setNameDraft(ride?.name || "");
    setNameEditing(true);
  };

  const saveName = async () => {
    if (!rideRef) return;
    try {
      await updateDoc(rideRef, { name: nameDraft.trim() || null });
      setNameEditing(false);
    } catch {
      Alert.alert("Error", "Could not save the ride name.");
    }
  };

  const deleteRide = () => {
    if (!rideRef || !user || !id) return;
    Alert.alert("Delete Ride", "This will permanently delete this ride and all its segments.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          deletingRef.current = true;
          try {
            await deleteDoc(doc(db, "users", user.uid, "rides", id, "track", "data"));
            await deleteDoc(rideRef);
            router.back();
          } catch {
            deletingRef.current = false;
            Alert.alert("Error", "Could not delete this ride.");
          }
        },
      },
    ]);
  };

  const startAddSegment = () => {
    if (points.length < 2) return;
    setDraftStart(0);
    setDraftEnd(Math.min(points.length - 1, Math.max(1, Math.floor(points.length * 0.25))));
    setDraftName("");
    setDraftTrailId(undefined);
    setAddingSegment(true);
  };

  const cancelAddSegment = () => {
    setAddingSegment(false);
  };

  const saveDraftSegment = async () => {
    if (!rideRef) return;
    if (!draftName.trim()) {
      Alert.alert("Name required", "Give this segment a name before saving.");
      return;
    }
    setSaving(true);
    try {
      const newSegment: RideSegment = {
        id: makeSegmentId(),
        name: draftName.trim(),
        ...(draftTrailId ? { trailId: draftTrailId } : {}),
        startIndex: draftStart,
        endIndex: draftEnd,
        distanceMiles: parseFloat(segmentDistanceMiles(points, draftStart, draftEnd).toFixed(2)),
        durationSecs: segmentDurationSecs(points, draftStart, draftEnd),
      };
      await updateDoc(rideRef, { segments: [...segments, newSegment] });
      setAddingSegment(false);
    } catch {
      Alert.alert("Error", "Could not save this segment.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSegment = (segId: string) => {
    if (!rideRef) return;
    Alert.alert("Remove Segment", "Remove this segment from the ride?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await updateDoc(rideRef, { segments: segments.filter((s) => s.id !== segId) });
          } catch {
            Alert.alert("Error", "Could not remove this segment.");
          }
        },
      },
    ]);
  };

  const trailTitleFor = (trailId?: string) => ALL_TRAILS.find((t) => t.id === trailId)?.title;

  const filteredTrails = useMemo(() => {
    const q = trailSearch.trim().toLowerCase();
    if (!q) return ALL_TRAILS.slice(0, 50);
    return ALL_TRAILS.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 50);
  }, [trailSearch]);

  const draftDistance = points.length > 1 ? segmentDistanceMiles(points, draftStart, draftEnd) : 0;
  const draftDuration = points.length > 1 ? segmentDurationSecs(points, draftStart, draftEnd) : 0;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!ride) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        {nameEditing ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border }]}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Name this ride"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
            <TouchableOpacity onPress={saveName} hitSlop={8}>
              <Feather name="check" size={20} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setNameEditing(false)} hitSlop={8}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.titleRow} onPress={startNameEdit} activeOpacity={0.7}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
              {ride.name || new Date(ride.startedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </Text>
            <Feather name="edit-2" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={deleteRide} hitSlop={10}>
          <Feather name="trash-2" size={20} color={colors.destructive} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        {points.length >= 2 ? (
          <View style={styles.mapWrap}>
            <MapLibreMap
              style={styles.map}
              mapStyle="https://tiles.openfreemap.org/styles/liberty"
              onDidFinishLoadingStyle={() => setMapStyleLoaded(true)}
            >
              <Camera ref={cameraRef} center={[points[0].longitude, points[0].latitude]} zoom={12} />

              {mapStyleLoaded && (
                <GeoJSONSource id="ride-full-path" data={fullPathGeoJSON}>
                  <Layer
                    id="ride-full-line"
                    type="line"
                    paint={{ "line-color": colors.mutedForeground, "line-width": 3, "line-opacity": 0.6 }}
                  />
                </GeoJSONSource>
              )}

              {mapStyleLoaded &&
                segments.map((seg, i) => (
                  <GeoJSONSource key={seg.id} id={`ride-segment-${seg.id}`} data={segmentGeoJSON(seg)}>
                    <Layer
                      id={`ride-segment-line-${seg.id}`}
                      type="line"
                      paint={{ "line-color": SEGMENT_COLORS[i % SEGMENT_COLORS.length], "line-width": 5, "line-opacity": 0.95 }}
                    />
                  </GeoJSONSource>
                ))}

              {mapStyleLoaded && addingSegment && (
                <GeoJSONSource id="ride-draft-segment" data={draftGeoJSON}>
                  <Layer
                    id="ride-draft-line"
                    type="line"
                    paint={{ "line-color": "#FF5500", "line-width": 5, "line-opacity": 0.95 }}
                  />
                </GeoJSONSource>
              )}

              {addingSegment && points[draftStart] && (
                <Marker lngLat={[points[draftStart].longitude, points[draftStart].latitude]}>
                  <View style={[styles.markerDot, { backgroundColor: "#00E676" }]} />
                </Marker>
              )}
              {addingSegment && points[draftEnd] && (
                <Marker lngLat={[points[draftEnd].longitude, points[draftEnd].latitude]}>
                  <View style={[styles.markerDot, { backgroundColor: "#FF5252" }]} />
                </Marker>
              )}
            </MapLibreMap>
          </View>
        ) : trackLoading ? (
          <View style={[styles.noPathBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.mutedForeground} />
            <Text style={[styles.noPathText, { color: colors.mutedForeground }]}>Loading GPS path…</Text>
          </View>
        ) : (
          <View style={[styles.noPathBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="info" size={16} color={colors.mutedForeground} />
            <Text style={[styles.noPathText, { color: colors.mutedForeground }]}>
              GPS path not available for rides recorded before this update.
            </Text>
          </View>
        )}

        <View style={[styles.statsRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{ride.distanceMiles.toFixed(2)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>MILES</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{formatRideDuration(ride.durationSecs)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>TIME</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{ride.topSpeedMph.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>TOP MPH</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>+{ride.elevationGainFt}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>ELEV FT</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>SEGMENTS</Text>
            {points.length >= 2 && !addingSegment && (
              <TouchableOpacity style={styles.addSegBtn} onPress={startAddSegment}>
                <Feather name="plus" size={14} color={colors.accent} />
                <Text style={[styles.addSegText, { color: colors.accent }]}>Add Segment</Text>
              </TouchableOpacity>
            )}
          </View>

          {segments.length === 0 && !addingSegment && (
            <Text style={[styles.emptySegText, { color: colors.mutedForeground }]}>
              No segments yet. If this ride covered multiple trails, split it up and name each part.
            </Text>
          )}

          {segments.map((seg, i) => (
            <View key={seg.id} style={[styles.segCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.segColorDot, { backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.segName, { color: colors.foreground }]} numberOfLines={1}>{seg.name}</Text>
                <Text style={[styles.segSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {trailTitleFor(seg.trailId) ? `${trailTitleFor(seg.trailId)} · ` : ""}
                  {formatMi(seg.distanceMiles)} mi · {formatRideDuration(seg.durationSecs)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteSegment(seg.id)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ))}

          {addingSegment && (
            <View style={[styles.draftCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <RangeScrubber total={points.length} start={draftStart} end={draftEnd} onChange={(s, e) => { setDraftStart(s); setDraftEnd(e); }} />
              <Text style={[styles.draftPreview, { color: colors.mutedForeground }]}>
                {formatMi(draftDistance)} mi · {formatRideDuration(draftDuration)}
              </Text>

              <TextInput
                style={[styles.draftNameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Segment name (e.g. Rubicon Trail)"
                placeholderTextColor={colors.mutedForeground}
              />

              <TouchableOpacity
                style={[styles.trailPickBtn, { borderColor: colors.border }]}
                onPress={() => setTrailPickerVisible(true)}
              >
                <Feather name="map" size={14} color={colors.mutedForeground} />
                <Text style={[styles.trailPickText, { color: draftTrailId ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                  {draftTrailId ? trailTitleFor(draftTrailId) : "Link to an existing trail (optional)"}
                </Text>
                {draftTrailId && (
                  <TouchableOpacity onPress={() => setDraftTrailId(undefined)} hitSlop={8}>
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              <View style={styles.draftActionsRow}>
                <TouchableOpacity style={[styles.draftBtn, { borderColor: colors.border }]} onPress={cancelAddSegment}>
                  <Text style={[styles.draftBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.draftBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  onPress={saveDraftSegment}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.accentForeground} />
                  ) : (
                    <Text style={[styles.draftBtnText, { color: colors.accentForeground }]}>Save Segment</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={trailPickerVisible} animationType="slide" transparent onRequestClose={() => setTrailPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Link a Trail</Text>
              <TouchableOpacity onPress={() => setTrailPickerVisible(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.trailSearchInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={trailSearch}
              onChangeText={setTrailSearch}
              placeholder="Search trails..."
              placeholderTextColor={colors.mutedForeground}
            />
            <FlatList
              data={filteredTrails}
              keyExtractor={(t) => t.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.trailRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setDraftTrailId(item.id);
                    setTrailPickerVisible(false);
                  }}
                >
                  <Text style={[styles.trailRowText, { color: colors.foreground }]}>{item.title}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "900" },
  nameEditRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  nameInput: { flex: 1, borderBottomWidth: 1, fontSize: 15, fontWeight: "700", paddingVertical: 2 },

  mapWrap: { height: 260, width: "100%" },
  map: { flex: 1 },
  markerDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#fff" },

  noPathBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  noPathText: { flex: 1, fontSize: 12, fontWeight: "600" },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  stat: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "900" },
  statLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 2 },

  section: { paddingHorizontal: 16, marginTop: 22 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  addSegBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  addSegText: { fontSize: 12, fontWeight: "800" },
  emptySegText: { fontSize: 12, fontWeight: "600", lineHeight: 18 },

  segCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  segColorDot: { width: 10, height: 10, borderRadius: 5 },
  segName: { fontSize: 13, fontWeight: "800" },
  segSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },

  draftCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  draftPreview: { fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 6 },
  draftNameInput: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "600",
  },
  trailPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trailPickText: { flex: 1, fontSize: 12, fontWeight: "600" },
  draftActionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  draftBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  draftBtnText: { fontSize: 13, fontWeight: "800" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: { height: "70%", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: "900" },
  trailSearchInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 8 },
  trailRow: { paddingVertical: 12, borderBottomWidth: 1 },
  trailRowText: { fontSize: 13, fontWeight: "600" },
});
