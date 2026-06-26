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
  TextInput,
} from "react-native";
import {
  Map as MapLibreMap,
  Camera,
  type CameraRef,
  UserLocation,
  Marker,
  GeoJSONSource,
  RasterSource,
  Layer,
  OfflineManager,
} from "@maplibre/maplibre-react-native";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import TerraPulseLogo from "@/components/TerraPulseLogo";
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
  query,
  where,
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
  type VehicleType,
  VEHICLE_TYPE_CONFIG,
} from "@/lib/trails";
import { TRAIL_ROUTES } from "@/lib/trail-routes";
import TrailDetailScreen from "@/components/TrailDetailScreen";

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

function latLngDistMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}


type MapLayer = "standard" | "topo" | "satellite" | "terrain3d";

const LAYER_OPTIONS: { id: MapLayer; label: string; icon: string }[] = [
  { id: "standard", label: "Standard", icon: "map" },
  { id: "topo", label: "Topo", icon: "terrain" },
  { id: "satellite", label: "Satellite", icon: "satellite-alt" },
  { id: "terrain3d", label: "3D Terrain", icon: "view-in-ar" },
];

const MAPTILER_KEY: string =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.maptilerApiKey ?? "";

function mtStyle(id: string): string {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

// MapTiler Outdoor v2 — contours, hiking/offroad routes, rich terrain detail
const STANDARD_STYLE_URL = mtStyle("outdoor-v2");
// MapTiler Hybrid — high-res satellite imagery + road/label overlay
const SATELLITE_STYLE_URL = mtStyle("hybrid");
// MapTiler Topo v2 — topographic focus with elevation contours
const TOPO_STYLE_URL = mtStyle("topo-v2");
// Terrain 3D reuses outdoor-v2 base, then we inject the terrain DEM at runtime
const TERRAIN3D_STYLE_URL = STANDARD_STYLE_URL;

/**
 * Fetch outdoor-v2 style JSON and inject a MapTiler terrain-DEM source +
 * terrain exaggeration so MapLibre renders true 3D elevation.
 */
async function buildTerrain3dStyle(key: string): Promise<Record<string, unknown>> {
  const url = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${key}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MapTiler fetch failed: ${resp.status}`);
  const style = (await resp.json()) as Record<string, unknown>;

  // Inject raster-dem source from MapTiler terrain-rgb-v2
  const sources = (style.sources as Record<string, unknown>) ?? {};
  sources["terrain-dem"] = {
    type: "raster-dem",
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`,
    tileSize: 256,
    encoding: "mapbox",
  };
  style.sources = sources;

  // Enable terrain exaggeration
  style.terrain = { source: "terrain-dem", exaggeration: 1.5 };

  return style;
}

const USFS_MVUM_TILES = [
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MotorVehicleUse_01/MapServer/tile/{z}/{y}/{x}",
];

interface UserTrail extends Trail {
  routeCoordinates?: Array<{ lat: number; lng: number }>;
  isUserSubmitted?: boolean;
  submittedByName?: string;
}

function enrichWithRoute(trail: UserTrail): UserTrail {
  if (trail.routeCoordinates?.length) return trail;
  const rc = TRAIL_ROUTES[trail.id];
  return rc ? { ...trail, routeCoordinates: rc } : trail;
}

function difficultyLabel(rating: number): string {
  if (rating <= 2) return "Easy";
  if (rating <= 4) return "Moderate";
  if (rating <= 6) return "Challenging";
  if (rating <= 8) return "Very Hard";
  return "Extreme";
}

const stateNameToCode = Object.fromEntries(
  Object.entries(STATE_NAMES)
    .filter(([code]) => code !== "All States")
    .map(([code, name]) => [name.toUpperCase(), code])
) as Record<string, string>;

export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, logout } = useAuth();
  const cameraRef = useRef<CameraRef>(null);

  const [mapLayer, setMapLayer] = useState<MapLayer>("standard");
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showUsfsOverlay, setShowUsfsOverlay] = useState(false);

  const [terrain3dStyleObj, setTerrain3dStyleObj] =
    useState<Record<string, unknown> | null>(null);

  // Fetch terrain3d style once (cached in state)
  useEffect(() => {
    if (mapLayer !== "terrain3d" || terrain3dStyleObj !== null) return;
    if (!MAPTILER_KEY) return;
    let cancelled = false;
    buildTerrain3dStyle(MAPTILER_KEY)
      .then((s) => { if (!cancelled) setTerrain3dStyleObj(s); })
      .catch(() => { /* falls back to flat outdoor-v2 URL */ });
    return () => { cancelled = true; };
  }, [mapLayer, terrain3dStyleObj]);

  const mapStyle = useMemo<never>(() => {
    switch (mapLayer) {
      case "standard":  return STANDARD_STYLE_URL as never;
      case "satellite": return SATELLITE_STYLE_URL as never;
      case "terrain3d": return (terrain3dStyleObj ?? TERRAIN3D_STYLE_URL) as never;
      case "topo":
      default:          return TOPO_STYLE_URL as never;
    }
  }, [mapLayer, terrain3dStyleObj]);

  const [selectedState, setSelectedState] = useState("All States");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<Set<VehicleType>>(new Set());

  const toggleVehicleFilter = useCallback((vt: VehicleType) => {
    setVehicleTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(vt)) next.delete(vt);
      else next.add(vt);
      return next;
    });
  }, []);

  const filteredTrails = useMemo(() => {
    let trails = getTrailsByState(selectedState);
    if (vehicleTypeFilter.size > 0) {
      trails = trails.filter(t =>
        (t.vehicleTypes ?? []).some(vt => vehicleTypeFilter.has(vt))
      );
    }
    return trails;
  }, [selectedState, vehicleTypeFilter]);

  const [selectedTrail, setSelectedTrail] = useState<UserTrail | null>(null);
  const [photos, setPhotos] = useState<TrailPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [completedTrails, setCompletedTrails] = useState<string[]>([]);

  const [followUser, setFollowUser] = useState(false);

  const [isNavigating, setIsNavigating] = useState(false);
  const [navTrail, setNavTrail] = useState<UserTrail | null>(null);
  const [navDistCovered, setNavDistCovered] = useState(0);
  const [navDistTotal, setNavDistTotal] = useState(0);
  const navWatchRef = useRef<Location.LocationSubscription | null>(null);

  const [isTrailRecording, setIsTrailRecording] = useState(false);
  const [trailPoints, setTrailPoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const trailPointsRef = useRef<Array<{ latitude: number; longitude: number }>>([]);
  const trailWatchRef = useRef<Location.LocationSubscription | null>(null);
  const trailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [trailElapsed, setTrailElapsed] = useState(0);
  const [trailStartTime, setTrailStartTime] = useState(0);
  const [trailDistanceMi, setTrailDistanceMi] = useState(0);
  const trailDistRef = useRef(0);

  const [showAddTrailModal, setShowAddTrailModal] = useState(false);
  const [trailName, setTrailName] = useState("");
  const [trailDifficultyRating, setTrailDifficultyRating] = useState(5);
  const [submittingTrail, setSubmittingTrail] = useState(false);
  const [userTrails, setUserTrails] = useState<UserTrail[]>([]);

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

  const startNavigation = useCallback(() => {
    const route = selectedTrail?.routeCoordinates;
    if (!route?.length) return;
    let total = 0;
    for (let i = 1; i < route.length; i++) {
      total += latLngDistMiles(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng);
    }
    cameraRef.current?.flyTo({ center: [route[0].lng, route[0].lat], zoom: 13, duration: 1200 });
    setNavTrail(selectedTrail);
    setNavDistTotal(parseFloat(total.toFixed(2)));
    setNavDistCovered(0);
    setIsNavigating(true);
    setSelectedTrail(null);
    setFollowUser(true);
  }, [selectedTrail]);

  const stopNavigation = useCallback(() => {
    navWatchRef.current?.remove();
    navWatchRef.current = null;
    setIsNavigating(false);
    setNavTrail(null);
    setNavDistCovered(0);
    setNavDistTotal(0);
    setFollowUser(false);
  }, []);

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
    if (!isNavigating) {
      navWatchRef.current?.remove();
      navWatchRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      navWatchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 15 },
        (loc) => {
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      );
    })();
    return () => {
      cancelled = true;
      navWatchRef.current?.remove();
      navWatchRef.current = null;
    };
  }, [isNavigating]);

  useEffect(() => {
    if (!isNavigating || !navTrail?.routeCoordinates?.length || !userLocation) return;
    const route = navTrail.routeCoordinates;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = latLngDistMiles(userLocation.latitude, userLocation.longitude, route[i].lat, route[i].lng);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    let covered = 0;
    for (let i = 1; i <= nearestIdx; i++) {
      covered += latLngDistMiles(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng);
    }
    setNavDistCovered(parseFloat(covered.toFixed(2)));
  }, [isNavigating, navTrail, userLocation]);


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
    const unsub = onSnapshot(
      query(collection(db, "trails"), where("isUserSubmitted", "==", true)),
      (snap) => {
        setUserTrails(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserTrail)));
      }
    );
    return unsub;
  }, []);

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
    if (isTrailRecording) {
      Alert.alert("Already Recording", "Stop your trail recording first.");
      return;
    }
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
    if (followUser) {
      setFollowUser(false);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location required", "Enable location to follow your position.");
      return;
    }
    let loc = userLocation;
    if (!loc) {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      loc = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setUserLocation(loc);
    }
    cameraRef.current?.flyTo({ center: [loc.longitude, loc.latitude], zoom: 14, duration: 800 });
    setFollowUser(true);
  }, [followUser, userLocation]);

  const startTrailRecording = useCallback(async () => {
    if (isRecording) {
      Alert.alert("Already Recording", "Stop your ride recording first.");
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location required", "Enable location to record a trail.");
      return;
    }
    trailPointsRef.current = [];
    trailDistRef.current = 0;
    setTrailPoints([]);
    setTrailDistanceMi(0);
    setTrailElapsed(0);
    const start = Date.now();
    setTrailStartTime(start);
    setIsTrailRecording(true);
    setFollowUser(true);
    trailTimerRef.current = setInterval(() => {
      setTrailElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    trailWatchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
      (loc) => {
        const pt = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        const prev = trailPointsRef.current[trailPointsRef.current.length - 1];
        if (prev) {
          const d = distanceMiles(
            { ...prev, altitude: 0, speed: 0, timestamp: 0 },
            { ...pt, altitude: 0, speed: 0, timestamp: 0 }
          );
          trailDistRef.current += d;
          setTrailDistanceMi(parseFloat(trailDistRef.current.toFixed(2)));
        }
        trailPointsRef.current = [...trailPointsRef.current, pt];
        setTrailPoints((p) => [...p, pt]);
      }
    );
  }, [isRecording]);

  const stopTrailRecording = useCallback(() => {
    trailWatchRef.current?.remove();
    trailWatchRef.current = null;
    if (trailTimerRef.current) {
      clearInterval(trailTimerRef.current);
      trailTimerRef.current = null;
    }
    setIsTrailRecording(false);
    if (trailPointsRef.current.length < 2) {
      Alert.alert("Too Short", "Not enough GPS points. Try recording a longer stretch.");
      trailPointsRef.current = [];
      setTrailPoints([]);
      return;
    }
    setShowAddTrailModal(true);
  }, []);

  const submitTrail = useCallback(async () => {
    if (!user || !trailName.trim()) {
      Alert.alert("Name Required", "Please give your trail a name.");
      return;
    }
    const pts = trailPointsRef.current;
    setSubmittingTrail(true);
    try {
      const lat = pts.reduce((s, p) => s + p.latitude, 0) / pts.length;
      const lng = pts.reduce((s, p) => s + p.longitude, 0) / pts.length;
      let stateCode = "US";
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const regionName = geo[0]?.region ?? "";
        stateCode = stateNameToCode[regionName.toUpperCase()] ?? regionName.substring(0, 2).toUpperCase();
      } catch { /* keep default */ }
      const rating = trailDifficultyRating;
      await addDoc(collection(db, "trails"), {
        title: trailName.trim(),
        state: stateCode,
        coords: { latitude: lat, longitude: lng },
        difficulty: `${rating}/10 ${difficultyLabel(rating)}`,
        difficultyRating: rating,
        size: "High Clearance",
        suspension: "Stock OK",
        region: stateCode,
        submittedBy: user.uid,
        submittedByName: user.displayName ?? "Unknown",
        createdAt: serverTimestamp(),
        routeCoordinates: pts.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        isUserSubmitted: true,
      });
      Alert.alert(
        "Trail Added!",
        `"${trailName.trim()}" is now visible to everyone on TerraPulse!`,
        [{ text: "LET'S RIDE!" }]
      );
      setShowAddTrailModal(false);
      setTrailName("");
      setTrailDifficultyRating(5);
      trailPointsRef.current = [];
      setTrailPoints([]);
      setTrailDistanceMi(0);
    } catch {
      Alert.alert("Error", "Could not save trail. Try again.");
    } finally {
      setSubmittingTrail(false);
    }
  }, [user, trailName, trailDifficultyRating]);

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

  const trailRecordingGeoJSON = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: trailPoints.map((p) => [p.longitude, p.latitude]),
      },
      properties: {},
    }),
    [trailPoints]
  );

  const selectedUserTrailGeoJSON = useMemo(() => {
    const rc = isNavigating
      ? navTrail?.routeCoordinates
      : selectedTrail?.routeCoordinates;
    if (!rc?.length) return null;
    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: rc.map((p) => [p.lng, p.lat]),
      },
      properties: {},
    };
  }, [isNavigating, navTrail, selectedTrail]);

  const TOP_BAR_HEIGHT = insets.top + 64;
  const STATE_BAR_HEIGHT = 48;
  const VEHICLE_BAR_HEIGHT = 44;

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
          trackUserLocation={followUser ? "course" : undefined}
        />

        <UserLocation />

        {filteredTrails.map((trail) => (
          <Marker
            key={trail.id}
            lngLat={[trail.coords.longitude, trail.coords.latitude]}
            onPress={() => setSelectedTrail(enrichWithRoute(trail))}
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

        {trailPoints.length > 1 && (
          <GeoJSONSource id="trail-recording" data={trailRecordingGeoJSON}>
            <Layer
              id="trail-recording-line"
              type="line"
              paint={{ "line-color": "#00E676", "line-width": 3, "line-opacity": 0.9 }}
            />
          </GeoJSONSource>
        )}

        {selectedUserTrailGeoJSON && (
          <GeoJSONSource id="selected-user-trail" data={selectedUserTrailGeoJSON}>
            <Layer
              id="selected-user-trail-line"
              type="line"
              paint={{ "line-color": "#FF9800", "line-width": 3, "line-opacity": 0.85 }}
            />
          </GeoJSONSource>
        )}

        {showUsfsOverlay && (
          <RasterSource
            id="usfs-mvum"
            tiles={USFS_MVUM_TILES}
            tileSize={256}
            minzoom={8}
          >
            <Layer
              id="usfs-mvum-layer"
              type="raster"
              paint={{ "raster-opacity": 0.75 }}
            />
          </RasterSource>
        )}

        {userTrails
          .filter((t) => selectedState === "All States" || t.state === selectedState)
          .map((trail) => (
            <Marker
              key={trail.id}
              lngLat={[trail.coords.longitude, trail.coords.latitude]}
              onPress={() => setSelectedTrail(enrichWithRoute(trail))}
            >
              <View
                style={[
                  styles.userTrailMarker,
                  { borderColor: markerColor(trail.difficultyRating) },
                ]}
              />
            </Marker>
          ))}
      </MapLibreMap>

      {/* TOP BAR */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.topBarInner,
            { backgroundColor: colors.card },
          ]}
        >
          <View>
            <TerraPulseLogo color={colors.primary} size="md" />
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
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedState(state)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.statePillText,
                    { color: active ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {state === "All States" ? "ALL" : state}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* VEHICLE TYPE FILTER BAR */}
      <View style={[styles.vehicleBar, { top: TOP_BAR_HEIGHT + STATE_BAR_HEIGHT }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.vehicleBarContent}
        >
          {(Object.keys(VEHICLE_TYPE_CONFIG) as VehicleType[]).map((vt) => {
            const cfg = VEHICLE_TYPE_CONFIG[vt];
            const active = vehicleTypeFilter.has(vt);
            return (
              <TouchableOpacity
                key={vt}
                style={[
                  styles.vehiclePill,
                  {
                    backgroundColor: active ? cfg.color : colors.card,
                    borderColor: active ? cfg.color : colors.border,
                  },
                ]}
                onPress={() => toggleVehicleFilter(vt)}
                activeOpacity={0.75}
              >
                <Text style={styles.vehiclePillEmoji}>{cfg.emoji}</Text>
                <Text style={[styles.vehiclePillText, { color: active ? "#fff" : colors.mutedForeground }]}>
                  {cfg.shortLabel}
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
              top: TOP_BAR_HEIGHT + STATE_BAR_HEIGHT + VEHICLE_BAR_HEIGHT + 8,
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

      {/* TRAIL RECORDING HUD */}
      {isTrailRecording && (
        <View
          style={[
            styles.recHud,
            {
              top: TOP_BAR_HEIGHT + STATE_BAR_HEIGHT + VEHICLE_BAR_HEIGHT + 8,
              backgroundColor: "rgba(0,0,0,0.88)",
              borderColor: colors.success,
            },
          ]}
        >
          <View style={styles.recIndicator}>
            <View style={[styles.recDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.recLabel, { color: colors.success }]}>TRAIL</Text>
          </View>
          <View style={styles.recStats}>
            <View style={styles.recStat}>
              <Text style={[styles.recValue, { color: "#FFF" }]}>{formatElapsed(trailElapsed)}</Text>
              <Text style={[styles.recUnit, { color: colors.mutedForeground }]}>TIME</Text>
            </View>
            <View style={styles.recDivider} />
            <View style={styles.recStat}>
              <Text style={[styles.recValue, { color: "#FFF" }]}>{trailDistanceMi.toFixed(2)}</Text>
              <Text style={[styles.recUnit, { color: colors.mutedForeground }]}>MI</Text>
            </View>
            <View style={styles.recDivider} />
            <View style={styles.recStat}>
              <Text style={[styles.recValue, { color: "#FFF" }]}>{trailPoints.length}</Text>
              <Text style={[styles.recUnit, { color: colors.mutedForeground }]}>PTS</Text>
            </View>
          </View>
        </View>
      )}

      {/* ADD TRAIL BUTTON */}
      <TouchableOpacity
        style={[
          styles.locateBtn,
          {
            bottom: tabBarHeight + 192,
            backgroundColor: isTrailRecording ? colors.success : colors.card,
            borderColor: isTrailRecording ? colors.success : colors.border,
            opacity: isRecording ? 0.4 : 1,
          },
        ]}
        onPress={isTrailRecording ? stopTrailRecording : startTrailRecording}
        disabled={isRecording}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name={isTrailRecording ? "stop" : "add-location-alt"}
          size={20}
          color={isTrailRecording ? "#000" : colors.accent}
        />
      </TouchableOpacity>

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

      {/* LOCATE / FOLLOW BUTTON */}
      <TouchableOpacity
        style={[
          styles.locateBtn,
          {
            bottom: tabBarHeight + 80,
            backgroundColor: followUser ? colors.accent : colors.card,
            borderColor: followUser ? colors.accent : colors.border,
          },
        ]}
        onPress={locateMe}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name={followUser ? "gps-fixed" : "my-location"}
          size={20}
          color={followUser ? "#000" : (userLocation ? colors.accent : colors.mutedForeground)}
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
          style={[styles.liveBtn, { backgroundColor: "#5A9A5A" }]}
          onPress={() => router.push("/(tabs)/stream")}
          activeOpacity={0.85}
        >
          <Feather name="radio" size={14} color="#FFFFFF" />
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

            <View style={[styles.overlayDivider, { borderColor: colors.border }]} />
            <Text style={[styles.layerTitle, { color: colors.mutedForeground, fontSize: 10, marginBottom: 10 }]}>
              OVERLAYS
            </Text>
            <TouchableOpacity
              style={[
                styles.overlayToggle,
                {
                  backgroundColor: showUsfsOverlay ? colors.accent : "rgba(255,255,255,0.05)",
                  borderColor: showUsfsOverlay ? colors.accent : colors.border,
                },
              ]}
              onPress={() => setShowUsfsOverlay((v) => !v)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="forest"
                size={20}
                color={showUsfsOverlay ? "#000" : colors.mutedForeground}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.overlayLabel, { color: showUsfsOverlay ? "#000" : colors.foreground }]}>
                  USFS TRAILS
                </Text>
                <Text style={[styles.overlaySubLabel, { color: showUsfsOverlay ? "#000" : colors.mutedForeground }]}>
                  Official OHV / motor vehicle routes · zoom in to see
                </Text>
              </View>
              <MaterialIcons
                name={showUsfsOverlay ? "toggle-on" : "toggle-off"}
                size={28}
                color={showUsfsOverlay ? "#000" : colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* NAV HUD */}
      {isNavigating && navTrail && (
        <View style={[styles.navHud, { bottom: tabBarHeight + 76, backgroundColor: colors.card, borderColor: colors.accent }]}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <MaterialIcons name="navigation" size={13} color={colors.accent} />
              <Text style={[styles.navTrailName, { color: colors.foreground }]} numberOfLines={1}>
                {navTrail.title.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.navProgressBarBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.navProgressFill,
                  {
                    width: navDistTotal > 0 ? `${Math.min(100, Math.round((navDistCovered / navDistTotal) * 100))}%` : "0%",
                    backgroundColor: colors.accent,
                  },
                ]}
              />
            </View>
            <Text style={[styles.navProgressText, { color: colors.mutedForeground }]}>
              {navDistCovered.toFixed(1)} of {navDistTotal.toFixed(1)} MI
              {navDistTotal > 0 ? `  ·  ${Math.round((navDistCovered / navDistTotal) * 100)}%` : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={stopNavigation} style={[styles.navStopBtn, { backgroundColor: colors.destructive }]} activeOpacity={0.8}>
            <Feather name="x" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <TrailDetailScreen
        trail={selectedTrail}
        visible={!!selectedTrail}
        onClose={() => setSelectedTrail(null)}
        photos={photos}
        uploading={uploading}
        onUploadPhoto={uploadPhoto}
        downloading={downloading}
        onDownload={downloadTrailArea}
        completedTrails={completedTrails}
        completing={completing}
        onComplete={completeTrail}
        onNavigate={startNavigation}
      />

      {/* ADD TRAIL SUBMISSION MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={showAddTrailModal}
        onRequestClose={() => setShowAddTrailModal(false)}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => {}}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.card, borderColor: colors.success, borderTopWidth: 2 },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.layerTitle, { color: colors.success, marginBottom: 4 }]}>
              NEW TRAIL
            </Text>
            <Text style={[styles.trailRegion, { color: colors.mutedForeground, marginBottom: 18 }]}>
              {trailDistanceMi.toFixed(2)} MI RECORDED · {trailPoints.length} GPS POINTS
            </Text>

            <Text style={[styles.specLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>
              TRAIL NAME
            </Text>
            <TextInput
              style={[
                styles.trailNameInput,
                { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
              ]}
              placeholder="e.g. Lost Canyon Loop"
              placeholderTextColor={colors.mutedForeground}
              value={trailName}
              onChangeText={setTrailName}
              maxLength={60}
              autoFocus
            />

            <Text style={[styles.specLabel, { color: colors.mutedForeground, marginTop: 18, marginBottom: 8 }]}>
              DIFFICULTY: {trailDifficultyRating}/10 — {difficultyLabel(trailDifficultyRating).toUpperCase()}
            </Text>
            <View style={styles.diffPickerRow}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                const active = n === trailDifficultyRating;
                const col = n <= 3 ? colors.success : n <= 6 ? "#FFC107" : colors.destructive;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[
                      styles.diffPickerBtn,
                      {
                        backgroundColor: active ? col : "rgba(255,255,255,0.05)",
                        borderColor: active ? col : colors.border,
                      },
                    ]}
                    onPress={() => setTrailDifficultyRating(n)}
                  >
                    <Text
                      style={{ color: active ? "#000" : colors.mutedForeground, fontWeight: "900", fontSize: 12 }}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>
              <TouchableOpacity
                style={[styles.downloadBtn, { flex: 1, borderColor: colors.border, marginBottom: 0 }]}
                onPress={() => {
                  setShowAddTrailModal(false);
                  setTrailName("");
                  setTrailDifficultyRating(5);
                  trailPointsRef.current = [];
                  setTrailPoints([]);
                  setTrailDistanceMi(0);
                }}
              >
                <Text style={[styles.downloadBtnText, { color: colors.mutedForeground }]}>DISCARD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completeBtn, { flex: 1, marginTop: 0, backgroundColor: colors.success }]}
                onPress={submitTrail}
                disabled={submittingTrail}
              >
                {submittingTrail ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={[styles.completeBtnText, { color: "#000" }]}>SUBMIT TRAIL</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  navHud: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  navTrailName: { fontWeight: "900", fontSize: 12, letterSpacing: 1, flex: 1 },
  navProgressBarBg: { height: 4, borderRadius: 2, marginBottom: 5 },
  navProgressFill: { height: 4, borderRadius: 2 },
  navProgressText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  navStopBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
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
  vehicleBar: { position: "absolute", left: 0, right: 0, height: 44 },
  vehicleBarContent: { paddingHorizontal: 12, alignItems: "center", gap: 6 },
  vehiclePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  vehiclePillEmoji: { fontSize: 14 },
  vehiclePillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
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
    color: "#FFFFFF",
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
  userTrailMarker: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 2,
    backgroundColor: "transparent",
    transform: [{ rotate: "45deg" }],
  },
  trailNameInput: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  diffPickerRow: {
    flexDirection: "row",
    gap: 6,
  },
  diffPickerBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
  },
  overlayDivider: { borderTopWidth: 1, marginVertical: 14 },
  overlayToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  overlayLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  overlaySubLabel: { fontSize: 10, fontWeight: "600", marginTop: 2 },
});
