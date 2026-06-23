import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Image,
  FlatList,
} from "react-native";
import {
  Map as MapLibreMap,
  Camera,
  type CameraRef,
  UserLocation,
  Marker,
  GeoJSONSource,
  Layer,
  OfflineManager,
} from "@maplibre/maplibre-react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { markTrailComplete } from "@/lib/achievements";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  ALL_TRAILS,
  US_STATES,
  STATE_NAMES,
  getTrailsByState,
  type Trail,
} from "@/lib/trails";

interface TrailPhoto {
  url: string;
  uploadedBy: string;
  createdAt: unknown;
}

interface RidePoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  timestamp: number;
}

function distanceMiles(a: RidePoint, b: RidePoint): number {
  const R = 3958.8;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function mpsToMph(mps: number): number {
  return mps * 2.23694;
}

function metersToFeet(m: number): number {
  return m * 3.28084;
}

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function DifficultyBar({ rating }: { rating: number }) {
  const colors = useColors();
  const color =
    rating <= 3 ? colors.success : rating <= 6 ? "#FFC107" : colors.destructive;
  return (
    <View style={diffStyles.row}>
      {Array.from({ length: 10 }).map((_, i) => (
        <View
          key={i}
          style={[
            diffStyles.bar,
            { backgroundColor: i < rating ? color : colors.border },
          ]}
        />
      ))}
    </View>
  );
}

const diffStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 3, marginTop: 4, marginBottom: 12 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
});

type MapLayer = "standard" | "topo" | "satellite" | "terrain3d";

const LAYER_OPTIONS: { id: MapLayer; label: string; icon: string }[] = [
  { id: "standard", label: "Standard", icon: "map" },
  { id: "topo", label: "Topo", icon: "terrain" },
  { id: "satellite", label: "Satellite", icon: "satellite-alt" },
  { id: "terrain3d", label: "3D Terrain", icon: "view-in-ar" },
];

const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    esri: {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri",
    },
  },
  layers: [{ id: "esri-satellite", type: "raster" as const, source: "esri" }],
};

export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, logout } = useAuth();
  const cameraRef = useRef<CameraRef>(null);

  const [mapLayer, setMapLayer] = useState<MapLayer>("standard");
  const [showLayerPicker, setShowLayerPicker] = useState(false);

  const mapStyle = useMemo(() => {
    if (mapLayer === "topo" || mapLayer === "terrain3d")
      return "https://tiles.openfreemap.org/styles/bright";
    if (mapLayer === "satellite") return SATELLITE_STYLE as never;
    return "https://tiles.openfreemap.org/styles/liberty";
  }, [mapLayer]);

  const [selectedState, setSelectedState] = useState("All States");
  const filteredTrails = getTrailsByState(selectedState);

  const [selectedTrail, setSelectedTrail] = useState<Trail | null>(null);
  const [photos, setPhotos] = useState<TrailPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [completedTrails, setCompletedTrails] = useState<string[]>([]);

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [ridePoints, setRidePoints] = useState<RidePoint[]>([]);
  const [rideTotalMiles, setRideTotalMiles] = useState(0);
  const [rideTopSpeedMph, setRideTopSpeedMph] = useState(0);
  const [rideElevGainFt, setRideElevGainFt] = useState(0);
  const [rideElapsed, setRideElapsed] = useState(0);
  const [rideStartTime, setRideStartTime] = useState(0);
  const [rideCurSpeedMph, setRideCurSpeedMph] = useState(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ridePointsRef = useRef<RidePoint[]>([]);
  const rideMilesRef = useRef(0);
  const rideTopRef = useRef(0);
  const rideElevRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists())
        setCompletedTrails(snap.data().completedTrails ?? []);
    });
  }, [user]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedTrail) {
      setPhotos([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "trails", selectedTrail.id, "photos"),
      (snap) => {
        const p: TrailPhoto[] = [];
        snap.forEach((d) => p.push(d.data() as TrailPhoto));
        setPhotos(p);
      }
    );
    return unsub;
  }, [selectedTrail]);

  useEffect(() => {
    if (selectedState === "All States") {
      cameraRef.current?.flyTo({
        center: [-98.5795, 39.8283],
        zoom: 3,
        duration: 600,
      });
    } else {
      const trails = getTrailsByState(selectedState);
      if (trails.length === 0) return;
      const lats = trails.map((t) => t.coords.latitude);
      const lons = trails.map((t) => t.coords.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);
      const pad = 1.0;
      cameraRef.current?.fitBounds(
        [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad],
        { padding: { top: 100, right: 40, bottom: 40, left: 40 }, duration: 600 }
      );
    }
  }, [selectedState]);

  const startRecording = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location required", "Enable location to record rides.");
      return;
    }
    ridePointsRef.current = [];
    rideMilesRef.current = 0;
    rideTopRef.current = 0;
    rideElevRef.current = 0;
    setRidePoints([]);
    setRideTotalMiles(0);
    setRideTopSpeedMph(0);
    setRideElevGainFt(0);
    setRideElapsed(0);
    setRideCurSpeedMph(0);
    const start = Date.now();
    setRideStartTime(start);
    setIsRecording(true);

    timerRef.current = setInterval(() => {
      setRideElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        timeInterval: 2000,
      },
      (loc) => {
        const pt: RidePoint = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? 0,
          speed: Math.max(loc.coords.speed ?? 0, 0),
          timestamp: loc.timestamp,
        };
        const prev = ridePointsRef.current[ridePointsRef.current.length - 1];
        if (prev) {
          const d = distanceMiles(prev, pt);
          rideMilesRef.current += d;
          setRideTotalMiles(parseFloat(rideMilesRef.current.toFixed(2)));
          if (pt.altitude > prev.altitude) {
            const gain = metersToFeet(pt.altitude - prev.altitude);
            rideElevRef.current += gain;
            setRideElevGainFt(Math.round(rideElevRef.current));
          }
        }
        const speedMph = mpsToMph(pt.speed);
        if (speedMph > rideTopRef.current) {
          rideTopRef.current = speedMph;
          setRideTopSpeedMph(parseFloat(speedMph.toFixed(1)));
        }
        setRideCurSpeedMph(parseFloat(speedMph.toFixed(1)));
        ridePointsRef.current = [...ridePointsRef.current, pt];
        setRidePoints((prev) => [...prev, pt]);
      }
    );
  }, []);

  const stopRecording = useCallback(async () => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    const pts = ridePointsRef.current;
    if (pts.length < 2 || !user) {
      Alert.alert("Ride ended", "Not enough GPS data to save this ride.");
      return;
    }

    const durationSecs = Math.floor((Date.now() - rideStartTime) / 1000);
    const distanceMi = parseFloat(rideMilesRef.current.toFixed(2));
    const topSpeedMph = parseFloat(rideTopRef.current.toFixed(1));
    const avgSpeedMph =
      durationSecs > 0
        ? parseFloat(((distanceMi / durationSecs) * 3600).toFixed(1))
        : 0;
    const elevGainFt = Math.round(rideElevRef.current);

    try {
      await addDoc(collection(db, "users", user.uid, "rides"), {
        startedAt: rideStartTime,
        endedAt: Date.now(),
        durationSecs,
        distanceMiles: distanceMi,
        topSpeedMph,
        avgSpeedMph,
        elevationGainFt: elevGainFt,
        pointCount: pts.length,
        createdAt: serverTimestamp(),
      });
      Alert.alert(
        "Ride Saved!",
        `${distanceMi} mi · ${formatElapsed(durationSecs)} · Top: ${topSpeedMph} mph`,
        [
          {
            text: "View in Profile",
            onPress: () => router.push("/(tabs)/profile"),
          },
          { text: "OK" },
        ]
      );
    } catch {
      Alert.alert("Error", "Could not save ride. Try again.");
    }
  }, [user, rideStartTime]);

  const uploadPhoto = useCallback(async () => {
    if (!selectedTrail || !user) return;
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const filename = `${Date.now()}_${user.uid}.jpg`;
      const storageRef = ref(storage, `trails/${selectedTrail.id}/${filename}`);
      const blob = await (await fetch(uri)).blob();
      await uploadBytesResumable(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      await addDoc(
        collection(db, "trails", selectedTrail.id, "photos"),
        {
          url: downloadURL,
          uploadedBy: user.uid,
          createdAt: serverTimestamp(),
        }
      );
    } catch {
      Alert.alert("Upload failed", "Could not upload photo. Try again.");
    } finally {
      setUploading(false);
    }
  }, [selectedTrail, user]);

  const completeTrail = useCallback(async () => {
    if (!user || !selectedTrail) return;
    setCompleting(true);
    try {
      const newAch = await markTrailComplete(user.uid, selectedTrail.id);
      setCompletedTrails((prev) =>
        prev.includes(selectedTrail.id) ? prev : [...prev, selectedTrail.id]
      );
      if (newAch.length > 0) {
        Alert.alert(
          "🏆 Achievement Unlocked!",
          `You earned ${newAch.length} badge${newAch.length > 1 ? "s" : ""}! Check your profile.`,
          [{ text: "NICE!" }]
        );
      } else {
        Alert.alert("Trail Logged!", "Already marked complete.", [
          { text: "OK" },
        ]);
      }
    } catch {
      Alert.alert("Error", "Could not log trail. Try again.");
    } finally {
      setCompleting(false);
    }
  }, [user, selectedTrail]);

  const downloadTrailArea = useCallback(async () => {
    if (!selectedTrail) return;
    setDownloading(true);
    try {
      const packs = await OfflineManager.getPacks();
      const existing = packs.find(
        (p) => (p.metadata as Record<string, unknown>)?.trailId === selectedTrail.id
      );
      if (existing) {
        Alert.alert(
          "Already saved",
          "This trail area is already available offline."
        );
        setDownloading(false);
        return;
      }
      const { coords } = selectedTrail;
      const pad = 0.2;
      await OfflineManager.createPack(
        {
          mapStyle: "https://tiles.openfreemap.org/styles/liberty",
          minZoom: 8,
          maxZoom: 16,
          bounds: [
            coords.longitude - pad,
            coords.latitude - pad,
            coords.longitude + pad,
            coords.latitude + pad,
          ],
          metadata: { trailId: selectedTrail.id },
        },
        (_pack, status) => {
          if (status.percentage >= 100) {
            setDownloading(false);
            Alert.alert(
              "Saved offline!",
              "Trail map downloaded. Works without cell service now."
            );
          }
        },
        (_pack, err) => {
          setDownloading(false);
          Alert.alert("Download failed", err.message ?? "Unknown error.");
        }
      );
    } catch {
      setDownloading(false);
      Alert.alert("Error", "Could not start download.");
    }
  }, [selectedTrail]);

  const locateMe = useCallback(async () => {
    if (userLocation) {
      cameraRef.current?.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 12,
        duration: 600,
      });
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(coords);
        cameraRef.current?.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 12,
          duration: 600,
        });
      }
    }
  }, [userLocation]);

  const markerColor = (rating: number) => {
    if (rating <= 3) return "#00E676";
    if (rating <= 6) return "#FFC107";
    return "#FF5500";
  };

  const rideRouteGeoJSON = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: ridePoints.map((p) => [p.longitude, p.latitude]),
      },
      properties: {},
    }),
    [ridePoints]
  );

  const TOP_BAR_HEIGHT = insets.top + 64;
  const STATE_BAR_HEIGHT = 48;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapLibreMap
        key={mapLayer}
        style={styles.map}
        mapStyle={mapStyle}
      >
        <Camera
          ref={cameraRef}
          center={[-98.5795, 39.8283]}
          zoom={3}
          pitch={mapLayer === "terrain3d" ? 50 : 0}
        />

        <UserLocation />

        {filteredTrails.map((trail) => (
          <Marker
            key={trail.id}
            lngLat={[trail.coords.longitude, trail.coords.latitude]}
            onPress={() => setSelectedTrail(trail)}
          >
            <View
              style={[
                styles.trailMarker,
                { backgroundColor: markerColor(trail.difficultyRating) },
              ]}
            />
          </Marker>
        ))}

        {ridePoints.length > 1 && (
          <GeoJSONSource id="ride-route" data={rideRouteGeoJSON}>
            <Layer
              id="ride-line"
              type="line"
              paint={{ "line-color": "#FF5500", "line-width": 3, "line-opacity": 0.9 }}
            />
          </GeoJSONSource>
        )}
      </MapLibreMap>

      {/* TOP BAR */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.topBarInner,
            { backgroundColor: "rgba(18,18,18,0.92)" },
          ]}
        >
          <View>
            <Text style={[styles.topTitle, { color: colors.foreground }]}>
              TERRAPULSE
            </Text>
            <Text
              style={[styles.topSub, { color: colors.mutedForeground }]}
            >
              {filteredTrails.length} TRAILS ·{" "}
              {selectedState === "All States"
                ? "NATIONWIDE"
                : STATE_NAMES[selectedState] ?? selectedState}
            </Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Feather name="log-out" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* STATE FILTER BAR */}
      <View style={[styles.stateBar, { top: TOP_BAR_HEIGHT }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stateBarContent}
        >
          {US_STATES.map((state) => {
            const active = selectedState === state;
            return (
              <TouchableOpacity
                key={state}
                style={[
                  styles.statePill,
                  {
                    backgroundColor: active
                      ? colors.accent
                      : "rgba(18,18,18,0.9)",
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => setSelectedState(state)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.statePillText,
                    { color: active ? "#000" : colors.mutedForeground },
                  ]}
                >
                  {state === "All States" ? "ALL" : state}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* RECORDING HUD */}
      {isRecording && (
        <View
          style={[
            styles.recHud,
            {
              top: TOP_BAR_HEIGHT + STATE_BAR_HEIGHT + 8,
              backgroundColor: "rgba(0,0,0,0.88)",
              borderColor: colors.destructive,
            },
          ]}
        >
          <View style={styles.recIndicator}>
            <View
              style={[
                styles.recDot,
                { backgroundColor: colors.destructive },
              ]}
            />
            <Text
              style={[styles.recLabel, { color: colors.destructive }]}
            >
              REC
            </Text>
          </View>
          <View style={styles.recStats}>
            <View style={styles.recStat}>
              <Text style={[styles.recValue, { color: "#FFF" }]}>
                {formatElapsed(rideElapsed)}
              </Text>
              <Text
                style={[styles.recUnit, { color: colors.mutedForeground }]}
              >
                TIME
              </Text>
            </View>
            <View style={styles.recDivider} />
            <View style={styles.recStat}>
              <Text style={[styles.recValue, { color: "#FFF" }]}>
                {rideTotalMiles.toFixed(2)}
              </Text>
              <Text
                style={[styles.recUnit, { color: colors.mutedForeground }]}
              >
                MI
              </Text>
            </View>
            <View style={styles.recDivider} />
            <View style={styles.recStat}>
              <Text style={[styles.recValue, { color: "#FFF" }]}>
                {rideCurSpeedMph.toFixed(0)}
              </Text>
              <Text
                style={[styles.recUnit, { color: colors.mutedForeground }]}
              >
                MPH
              </Text>
            </View>
            <View style={styles.recDivider} />
            <View style={styles.recStat}>
              <Text style={[styles.recValue, { color: "#FFF" }]}>
                +{rideElevGainFt}
              </Text>
              <Text
                style={[styles.recUnit, { color: colors.mutedForeground }]}
              >
                FT
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* LAYERS BUTTON */}
      <TouchableOpacity
        style={[
          styles.locateBtn,
          {
            bottom: tabBarHeight + 136,
            backgroundColor: mapLayer !== "standard" ? colors.accent : colors.card,
            borderColor: mapLayer !== "standard" ? colors.accent : colors.border,
          },
        ]}
        onPress={() => setShowLayerPicker(true)}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name="layers"
          size={20}
          color={mapLayer !== "standard" ? "#000" : colors.mutedForeground}
        />
      </TouchableOpacity>

      {/* LOCATE BUTTON */}
      <TouchableOpacity
        style={[
          styles.locateBtn,
          {
            bottom: tabBarHeight + 80,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        onPress={locateMe}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name="my-location"
          size={20}
          color={userLocation ? colors.accent : colors.mutedForeground}
        />
      </TouchableOpacity>

      {/* BOTTOM BUTTONS */}
      <View style={[styles.bottomBtns, { bottom: tabBarHeight + 16 }]}>
        <TouchableOpacity
          style={[
            styles.recordBtn,
            {
              backgroundColor: isRecording
                ? colors.destructive
                : colors.card,
              borderColor: isRecording
                ? colors.destructive
                : colors.border,
            },
          ]}
          onPress={isRecording ? stopRecording : startRecording}
          activeOpacity={0.85}
        >
          <Feather
            name={isRecording ? "square" : "circle"}
            size={14}
            color={isRecording ? "#fff" : colors.accent}
          />
          <Text
            style={[
              styles.recordBtnText,
              { color: isRecording ? "#fff" : colors.accent },
            ]}
          >
            {isRecording ? "STOP" : "RECORD"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.liveBtn, { backgroundColor: colors.accent }]}
          onPress={() => router.push("/(tabs)/stream")}
          activeOpacity={0.85}
        >
          <Feather name="radio" size={14} color="#000" />
          <Text style={styles.liveBtnText}>GO LIVE</Text>
        </TouchableOpacity>
      </View>

      {/* LAYER PICKER MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={showLayerPicker}
        onRequestClose={() => setShowLayerPicker(false)}
      >
        <TouchableOpacity
          style={styles.layerBackdrop}
          activeOpacity={1}
          onPress={() => setShowLayerPicker(false)}
        >
          <View
            style={[
              styles.layerSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.layerTitle, { color: colors.foreground }]}>
              MAP LAYERS
            </Text>
            <View style={styles.layerGrid}>
              {LAYER_OPTIONS.map((opt) => {
                const active = mapLayer === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.layerCard,
                      {
                        backgroundColor: active
                          ? colors.accent
                          : "rgba(255,255,255,0.05)",
                        borderColor: active ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setMapLayer(opt.id);
                      setShowLayerPicker(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name={opt.icon as never}
                      size={24}
                      color={active ? "#000" : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.layerCardLabel,
                        { color: active ? "#000" : colors.foreground },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {mapLayer === "terrain3d" && (
              <Text
                style={[styles.layerHint, { color: colors.mutedForeground }]}
              >
                Tilt the map with two fingers to see 3D elevation
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* TRAIL DETAIL MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={!!selectedTrail}
        onRequestClose={() => setSelectedTrail(null)}
      >
        {selectedTrail && (
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.accent,
                },
              ]}
            >
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.trailTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    {selectedTrail.title.toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.trailRegion,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {selectedTrail.region} ·{" "}
                    {STATE_NAMES[selectedTrail.state] ?? selectedTrail.state}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedTrail(null)}>
                  <Feather
                    name="x"
                    size={22}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.diffRow,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.specLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    DIFFICULTY
                  </Text>
                  <Text
                    style={[
                      styles.specValue,
                      { color: colors.foreground },
                    ]}
                  >
                    {selectedTrail.difficulty}
                  </Text>
                  <DifficultyBar rating={selectedTrail.difficultyRating} />
                </View>
              </View>

              <View style={styles.specsGrid}>
                <View
                  style={[
                    styles.specCard,
                    { backgroundColor: colors.secondary },
                  ]}
                >
                  <Feather name="truck" size={16} color={colors.accent} />
                  <Text
                    style={[
                      styles.specLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    VEHICLE SIZE
                  </Text>
                  <Text
                    style={[
                      styles.specValue,
                      { color: colors.foreground },
                    ]}
                  >
                    {selectedTrail.size}
                  </Text>
                </View>
                <View
                  style={[
                    styles.specCard,
                    { backgroundColor: colors.secondary },
                  ]}
                >
                  <Feather
                    name="settings"
                    size={16}
                    color={colors.accent}
                  />
                  <Text
                    style={[
                      styles.specLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    SUSPENSION
                  </Text>
                  <Text
                    style={[
                      styles.specValue,
                      { color: colors.foreground },
                    ]}
                  >
                    {selectedTrail.suspension}
                  </Text>
                </View>
              </View>

              {/* OFFLINE DOWNLOAD */}
              <TouchableOpacity
                style={[
                  styles.downloadBtn,
                  {
                    backgroundColor: colors.secondary,
                    borderColor: colors.border,
                  },
                ]}
                onPress={downloadTrailArea}
                disabled={downloading}
                activeOpacity={0.8}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Feather
                      name="download"
                      size={14}
                      color={colors.accent}
                    />
                    <Text
                      style={[
                        styles.downloadBtnText,
                        { color: colors.accent },
                      ]}
                    >
                      SAVE MAP OFFLINE
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.photosSection}>
                <View style={styles.photosHeader}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    COMMUNITY PICS
                  </Text>
                  <TouchableOpacity
                    onPress={uploadPhoto}
                    disabled={uploading}
                    style={[
                      styles.addPicBtn,
                      { borderColor: colors.accent },
                    ]}
                  >
                    {uploading ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.accent}
                      />
                    ) : (
                      <>
                        <Feather
                          name="camera"
                          size={14}
                          color={colors.accent}
                        />
                        <Text
                          style={[
                            styles.addPicText,
                            { color: colors.accent },
                          ]}
                        >
                          ADD PIC
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {photos.length === 0 ? (
                  <View style={styles.noPhotos}>
                    <Feather name="image" size={24} color={colors.border} />
                    <Text
                      style={[
                        styles.noPhotosText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      No photos yet. Be the first!
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    horizontal
                    data={photos}
                    keyExtractor={(_, i) => String(i)}
                    showsHorizontalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <Image
                        source={{ uri: item.url }}
                        style={[
                          styles.photo,
                          { borderColor: colors.border },
                        ]}
                      />
                    )}
                  />
                )}
              </View>

              {(() => {
                const done = completedTrails.includes(selectedTrail.id);
                return (
                  <TouchableOpacity
                    style={[
                      styles.completeBtn,
                      {
                        backgroundColor: done
                          ? colors.secondary
                          : colors.success,
                        borderColor: done ? colors.success : "transparent",
                        borderWidth: done ? 1 : 0,
                      },
                      completing && { opacity: 0.6 },
                    ]}
                    onPress={completeTrail}
                    disabled={completing}
                    activeOpacity={0.85}
                  >
                    {completing ? (
                      <ActivityIndicator
                        color={done ? colors.success : "#000"}
                      />
                    ) : (
                      <>
                        <Feather
                          name={done ? "check-circle" : "flag"}
                          size={16}
                          color={done ? colors.success : "#000"}
                        />
                        <Text
                          style={[
                            styles.completeBtnText,
                            { color: done ? colors.success : "#000" },
                          ]}
                        >
                          {done ? "TRAIL COMPLETED ✓" : "MARK AS COMPLETE"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  trailMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  topBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  topTitle: { fontWeight: "900", fontSize: 15, letterSpacing: 2 },
  topSub: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 1,
  },
  logoutBtn: { padding: 6 },
  stateBar: { position: "absolute", left: 0, right: 0, height: 48 },
  stateBarContent: {
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 8,
  },
  statePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  statePillText: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  recHud: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 14,
    elevation: 6,
    shadowColor: "#FF0000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  recIndicator: { flexDirection: "row", alignItems: "center", gap: 5 },
  recDot: { width: 8, height: 8, borderRadius: 4 },
  recLabel: { fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  recStats: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recStat: { alignItems: "center" },
  recValue: { fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  recUnit: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  recDivider: { width: 1, height: 28, backgroundColor: "#333" },
  locateBtn: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  bottomBtns: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 10,
  },
  recordBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 14,
    borderRadius: 4,
    borderWidth: 1,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  recordBtnText: { fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  liveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 4,
    elevation: 8,
    shadowColor: "#FF5500",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  liveBtnText: {
    fontWeight: "900",
    letterSpacing: 2,
    color: "#000",
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 2,
    padding: 20,
    paddingBottom: 34,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#444",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  trailTitle: { fontSize: 20, fontWeight: "900", letterSpacing: 1.5 },
  trailRegion: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 3,
  },
  diffRow: { padding: 14, borderRadius: 8, marginBottom: 12 },
  specsGrid: { flexDirection: "row", gap: 10, marginBottom: 12 },
  specCard: { flex: 1, padding: 12, borderRadius: 8, gap: 4 },
  specLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 6,
  },
  specValue: { fontSize: 12, fontWeight: "700", lineHeight: 16 },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 14,
  },
  downloadBtnText: { fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },
  photosSection: { gap: 10 },
  photosHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontWeight: "900", fontSize: 13, letterSpacing: 1 },
  addPicBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addPicText: { fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  noPhotos: { alignItems: "center", paddingVertical: 24, gap: 8 },
  noPhotosText: { fontSize: 12, fontWeight: "600" },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 4,
    marginRight: 8,
    borderWidth: 1,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 4,
    marginTop: 12,
  },
  completeBtnText: { fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  layerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  layerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 20,
    paddingBottom: 36,
  },
  layerTitle: {
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 16,
  },
  layerGrid: {
    flexDirection: "row",
    gap: 10,
  },
  layerCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  layerCardLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  layerHint: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 14,
    fontStyle: "italic",
  },
});
