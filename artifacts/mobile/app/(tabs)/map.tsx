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
  Platform,
  type NativeSyntheticEvent,
} from "react-native";
import {
  Map as MapLibreMap,
  Camera,
  type CameraRef,
  UserLocation,
  NativeUserLocation,
  Marker,
  GeoJSONSource,
  RasterSource,
  Layer,
  OfflineManager,
  type PressEventWithFeatures,
} from "@maplibre/maplibre-react-native";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Feather, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import TerraPulseLogo from "@/components/TerraPulseLogo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router, useLocalSearchParams } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
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
import {
  fetchUsfsRouteNear,
  fetchUsfsTrailsInBounds,
  fetchUsfsNfsNear,
  extractBestRoute,
  featureStartCoord,
  nfsFeatureStartCoord,
  type UsfsFeature,
  type UsfsCollection,
  type UsfsNfsFeature,
  type UsfsNfsCollection,
} from "@/lib/usfs-api";
import {
  fetchOsmTrailsNear,
  osmFeatureStartCoord,
  osmFeatureEndCoord,
  type OsmFeature,
  type OsmCollection,
} from "@/lib/osm-api";
import {
  fetchBlmOhvNear,
  BLM_SMA_TILES,
  type BlmOhvCollection,
} from "@/lib/blm-api";
import {
  fetchRidbTrailheadsNear,
  ridbFacilityCoord,
  ridbHasApiKey,
  type RidbFacility,
} from "@/lib/ridb-api";
import {
  fetchNpsOhvParksNear,
  npsParkCoord,
  npsHasApiKey,
  type NpsPark,
} from "@/lib/nps-api";
import {
  fromUsfsFeature,
  fromUsfsNfsFeature,
  fromOsmFeature,
  fromRidbFacility,
  fromNpsPark,
  type TrailGuide,
} from "@/lib/trail-guide";
import TrailGuideSheet from "@/components/TrailGuideSheet";
import TrailDetailScreen from "@/components/TrailDetailScreen";
import * as Updates from "expo-updates";

interface TrailPhoto {
  url: string;
  uploadedBy: string;
  createdAt: unknown;
}

interface TrailKeypoint {
  type: string;
  label: string;
  customText: string;
  lat: number;
  lng: number;
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

interface KeypointConfig { id: string; label: string; icon: string; color: string; }
const KEYPOINT_CONFIGS: KeypointConfig[] = [
  { id: "closed",    label: "Closed",     icon: "block",       color: "#C0392B" },
  { id: "flooded",   label: "Flooded",    icon: "water",       color: "#1565C0" },
  { id: "rockslide", label: "Rock Slide", icon: "terrain",     color: "#795548" },
  { id: "danger",    label: "Danger",     icon: "warning",     color: "#E65100" },
  { id: "custom",    label: "Custom",     icon: "edit",        color: "#5A9A5A" },
];

// Community Notes — live, shared reports posted by anyone navigating a trail.
// Stored at trails/{trailId}/community_notes and auto-expire after 48h.
const NOTE_EXPIRY_MS = 48 * 60 * 60 * 1000;
interface NoteTypeConfig { id: string; label: string; icon: string; color: string; }
const NOTE_TYPE_CONFIGS: NoteTypeConfig[] = [
  { id: "hazard",     label: "Hazard",     icon: "warning",       color: "#E65100" },
  { id: "closed",     label: "Closed",     icon: "block",         color: "#C0392B" },
  { id: "flooded",    label: "Flooded",    icon: "water",         color: "#1565C0" },
  { id: "washed_out", label: "Washed Out", icon: "waves",         color: "#795548" },
  { id: "custom",     label: "Custom",     icon: "edit",          color: "#5A9A5A" },
];
interface CommunityNote {
  id: string;
  type: string;
  message: string;
  lat: number;
  lng: number;
  createdBy: string;
  createdByName: string;
  createdAtMs: number;
  confirmedBy: string[];
}

const MAPTILER_KEY: string =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.maptilerApiKey ?? (process.env.EXPO_PUBLIC_MAPTILER_KEY ?? "");

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

  // Dramatic terrain exaggeration (was 1.5)
  style.terrain = { source: "terrain-dem", exaggeration: 2.2 };

  // Inject hillshade layer before labels
  const layers = (style.layers as unknown[]) ?? [];
  // Insert hillshade right after background/fill layers but before labels
  const insertIdx = layers.findIndex(
    (l) => (l as { type: string }).type === "symbol"
  );
  const hillshadeLayer = {
    id: "terrain-hillshade",
    type: "hillshade",
    source: "terrain-dem",
    paint: {
      "hillshade-exaggeration": 0.55,
      "hillshade-shadow-color": "#2D1B0E",
      "hillshade-highlight-color": "#FFF8EE",
      "hillshade-accent-color": "#7A5C3A",
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-anchor": "map",
    },
  };
  if (insertIdx > 0) {
    layers.splice(insertIdx, 0, hillshadeLayer);
  } else {
    layers.push(hillshadeLayer);
  }

  // Atmospheric sky layer for depth
  layers.push({
    id: "sky",
    type: "sky",
    paint: {
      "sky-type": "atmosphere",
      "sky-atmosphere-sun": [0.0, 0.0],
      "sky-atmosphere-sun-intensity": 15,
      "sky-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0, 5, 0.3, 8, 1],
    },
  });

  style.layers = layers;

  // Stronger directional lighting
  style.light = {
    anchor: "map",
    position: [1.5, 315, 45],
    color: "#FFF5E0",
    intensity: 0.35,
  };

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
  const [showUsfsOverlay, setShowUsfsOverlay] = useState(true);

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

  const [trailKeypoints, setTrailKeypoints] = useState<TrailKeypoint[]>([]);
  const [showKeypointModal, setShowKeypointModal] = useState(false);
  const [keypointSelectedType, setKeypointSelectedType] = useState<string | null>(null);
  const [keypointCustomText, setKeypointCustomText] = useState("");

  const [communityNotes, setCommunityNotes] = useState<CommunityNote[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteSelectedType, setNoteSelectedType] = useState<string | null>(null);
  const [noteCustomText, setNoteCustomText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [selectedNote, setSelectedNote] = useState<CommunityNote | null>(null);
  const [confirmingNote, setConfirmingNote] = useState(false);

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const hasAutoFlownRef = useRef(false);
  // Gate all GeoJSONSource renders until the map style has finished loading.
  // Registering sources before onDidFinishLoadingStyle silently fails on Android.
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  // Deep-link params from Profile > Offline Maps ("view on map" for a saved pack).
  const { focusLat, focusLng, focusTrailId } = useLocalSearchParams<{
    focusLat?: string;
    focusLng?: string;
    focusTrailId?: string;
  }>();
  const focusHandledRef = useRef<string | null>(null);
  // OSM fetch center — null until GPS arrives so we always load trails for the
  // user's real location, not a hardcoded default.
  const [osmFetchCenter, setOsmFetchCenter] = useState<{ lat: number; lng: number } | null>(null);

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

  // Unified trail guide — single selection for all data sources
  const [selectedGuide, setSelectedGuide] = useState<TrailGuide | null>(null);

  const [usfsGeoJSON, setUsfsGeoJSON] = useState<UsfsCollection | null>(null);
  const [usfsLoading, setUsfsLoading] = useState(false);

  const [showNfsOverlay, setShowNfsOverlay] = useState(false);
  const [nfsGeoJSON, setNfsGeoJSON] = useState<UsfsNfsCollection | null>(null);
  const [nfsLoading, setNfsLoading] = useState(false);

  const [showOsmOverlay, setShowOsmOverlay] = useState(true);
  const [osmGeoJSON, setOsmGeoJSON] = useState<OsmCollection | null>(null);
  const [osmLoading, setOsmLoading] = useState(false);
  const [osmError, setOsmError] = useState(false);

  const [showBlmOverlay, setShowBlmOverlay] = useState(false);
  const [blmOhvData, setBlmOhvData] = useState<BlmOhvCollection | null>(null);
  const [blmLoading, setBlmLoading] = useState(false);

  const [ridbFacilities, setRidbFacilities] = useState<RidbFacility[]>([]);
  const [showRidbOverlay, setShowRidbOverlay] = useState(false);

  const [npsParks, setNpsParks] = useState<NpsPark[]>([]);
  const [showNpsOverlay, setShowNpsOverlay] = useState(false);
  const [npsLoading, setNpsLoading] = useState(false);

  // Core navigation: takes a trail explicitly so it works from any call site
  const navigateTrail = useCallback((trail: UserTrail) => {
    const route = trail.routeCoordinates;
    if (!route?.length) return;
    let total = 0;
    for (let i = 1; i < route.length; i++) {
      total += latLngDistMiles(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng);
    }
    cameraRef.current?.flyTo({ center: [route[0].lng, route[0].lat], zoom: 13, duration: 1200 });
    setNavTrail(trail);
    setNavDistTotal(parseFloat(total.toFixed(2)));
    setNavDistCovered(0);
    setIsNavigating(true);
    setSelectedTrail(null);
    setSelectedGuide(null);
    setFollowUser(true);
  }, []);

  // Wrapper used by the existing TrailDetailScreen onNavigate prop
  const startNavigation = useCallback(() => {
    if (selectedTrail) navigateTrail(selectedTrail);
  }, [selectedTrail, navigateTrail]);

  const stopNavigation = useCallback(() => {
    navWatchRef.current?.remove();
    navWatchRef.current = null;
    setIsNavigating(false);
    setNavTrail(null);
    setNavDistCovered(0);
    setNavDistTotal(0);
    setFollowUser(false);
    setShowNoteModal(false);
    setSelectedNote(null);
  }, []);

  // ── NFS overlay fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!showNfsOverlay) { setNfsGeoJSON(null); return; }
    let cancelled = false;
    setNfsLoading(true);
    const center = userLocation ?? { latitude: 36.7783, longitude: -119.4179 };
    fetchUsfsNfsNear(center.latitude, center.longitude, 25)
      .then(data => { if (!cancelled) setNfsGeoJSON(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNfsLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNfsOverlay]);

  // ── RIDB trailhead fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showRidbOverlay || !ridbHasApiKey()) { setRidbFacilities([]); return; }
    let cancelled = false;
    const center = userLocation ?? { latitude: 36.7783, longitude: -119.4179 };
    fetchRidbTrailheadsNear(center.latitude, center.longitude, 25)
      .then(data => { if (!cancelled) setRidbFacilities(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRidbOverlay]);

  // ── NPS parks fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showNpsOverlay || !npsHasApiKey()) { setNpsParks([]); return; }
    let cancelled = false;
    setNpsLoading(true);
    const center = userLocation ?? { latitude: 36.7783, longitude: -119.4179 };
    fetchNpsOhvParksNear(center.latitude, center.longitude, 150)
      .then(data => { if (!cancelled) setNpsParks(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNpsLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNpsOverlay]);

  // ── OSM overlay fetch ───────────────────────────────────────────────────────
  // Only runs once GPS provides a real fix — osmFetchCenter stays null until then.
  useEffect(() => {
    if (!showOsmOverlay) { setOsmGeoJSON(null); setOsmError(false); return; }
    if (!osmFetchCenter) return; // wait for GPS
    let cancelled = false;
    setOsmLoading(true);
    setOsmError(false);
    fetchOsmTrailsNear(osmFetchCenter.lat, osmFetchCenter.lng, 10)
      .then(data => { if (!cancelled) { setOsmGeoJSON(data); setOsmError(false); } })
      .catch(() => { if (!cancelled) setOsmError(true); })
      .finally(() => { if (!cancelled) setOsmLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOsmOverlay, osmFetchCenter]);

  // ── BLM overlay fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!showBlmOverlay) { setBlmOhvData(null); return; }
    let cancelled = false;
    setBlmLoading(true);
    const center = userLocation ?? { latitude: 36.7783, longitude: -119.4179 };
    fetchBlmOhvNear(center.latitude, center.longitude, 25)
      .then(data => { if (!cancelled) setBlmOhvData(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBlmLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBlmOverlay]);

  // Fetch real USFS GeoJSON routes whenever the USFS overlay is toggled on.
  // Waits for a real GPS fix — fetching the CA-center fallback returns 0 results
  // (Central Valley has no National Forest land). Re-runs when GPS first arrives.
  // The 24h cache in fetchUsfsTrailsInBounds deduplicates subsequent GPS ticks.
  useEffect(() => {
    if (!showUsfsOverlay) { setUsfsGeoJSON(null); return; }
    if (!userLocation) return; // defer until GPS lock — avoid CA-farmland fallback
    let cancelled = false;
    setUsfsLoading(true);
    fetchUsfsTrailsInBounds(
      userLocation.longitude - 0.5, userLocation.latitude - 0.5,
      userLocation.longitude + 0.5, userLocation.latitude + 0.5,
    )
      .then(data => { if (!cancelled) setUsfsGeoJSON(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setUsfsLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUsfsOverlay, userLocation]);

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

  // Auto-fly to user's location the first time GPS arrives, and update OSM fetch center
  useEffect(() => {
    if (!userLocation || hasAutoFlownRef.current) return;
    hasAutoFlownRef.current = true;
    cameraRef.current?.flyTo({
      center: [userLocation.longitude, userLocation.latitude],
      zoom: 12,
      duration: 1500,
    });
    // Update OSM fetch center to real location so OSM re-fetches for user's area
    setOsmFetchCenter({ lat: userLocation.latitude, lng: userLocation.longitude });
  }, [userLocation]);

  // Handle "view on map" deep link from Profile > Offline Maps: fly to the
  // saved pack's location and open its trail sheet if it's a known trail.
  useEffect(() => {
    if (!mapStyleLoaded || !focusLat || !focusLng) return;
    const key = `${focusLat},${focusLng},${focusTrailId ?? ""}`;
    if (focusHandledRef.current === key) return;
    focusHandledRef.current = key;
    const lat = parseFloat(focusLat);
    const lng = parseFloat(focusLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    cameraRef.current?.flyTo({ center: [lng, lat], zoom: 12, duration: 1200 });
    const trail = focusTrailId ? ALL_TRAILS.find((t) => t.id === focusTrailId) : undefined;
    if (trail) setSelectedTrail(enrichWithRoute(trail));
  }, [mapStyleLoaded, focusLat, focusLng, focusTrailId]);

  // Tapping anywhere along an OSM trail line opens that trail's info sheet.
  // Match the pressed feature back to our full OsmFeature (with geometry) by id.
  const handleOsmTrailPress = useCallback(
    (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const pressedId = e.nativeEvent.features?.[0]?.properties?.id;
      if (pressedId == null || !osmGeoJSON) return;
      const match = osmGeoJSON.features.find((f) => f.properties.id === pressedId);
      if (match) setSelectedGuide(fromOsmFeature(match));
    },
    [osmGeoJSON],
  );

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

  // Community Notes — live for whichever trail is currently being navigated.
  // Notes older than NOTE_EXPIRY_MS are hidden and opportunistically deleted
  // by whichever client next observes them (no backend cleanup job exists).
  useEffect(() => {
    if (!isNavigating || !navTrail) {
      setCommunityNotes([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "trails", navTrail.id, "community_notes"),
      (snap) => {
        const now = Date.now();
        const fresh: CommunityNote[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const createdAtMs = (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? (data.createdAtFallback as number | undefined) ?? 0;
          if (now - createdAtMs > NOTE_EXPIRY_MS) {
            deleteDoc(doc(db, "trails", navTrail.id, "community_notes", d.id)).catch(() => {});
            return;
          }
          fresh.push({
            id: d.id,
            type: data.type as string,
            message: (data.message as string) ?? "",
            lat: data.lat as number,
            lng: data.lng as number,
            createdBy: data.createdBy as string,
            createdByName: (data.createdByName as string) ?? "Rider",
            createdAtMs,
            confirmedBy: (data.confirmedBy as string[]) ?? [],
          });
        });
        setCommunityNotes(fresh);
      }
    );
    return unsub;
  }, [isNavigating, navTrail]);

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
          metadata: {
            trailId: selectedTrail.id,
            trailTitle: selectedTrail.title,
            lat: coords.latitude,
            lng: coords.longitude,
          },
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

  const addKeypoint = useCallback(() => {
    if (!keypointSelectedType) return;
    const kpConfig = KEYPOINT_CONFIGS.find(k => k.id === keypointSelectedType);
    const loc = userLocation;
    if (!loc) {
      Alert.alert("No Location", "Enable location to tag a keypoint.");
      return;
    }
    setTrailKeypoints(prev => [...prev, {
      type: keypointSelectedType,
      label: kpConfig?.label ?? keypointSelectedType,
      customText: keypointCustomText,
      lat: loc.latitude,
      lng: loc.longitude,
    }]);
    setShowKeypointModal(false);
    setKeypointSelectedType(null);
    setKeypointCustomText("");
  }, [keypointSelectedType, keypointCustomText, userLocation]);

  const addCommunityNote = useCallback(async () => {
    if (!noteSelectedType || !navTrail || !user) return;
    if (noteSelectedType === "custom" && !noteCustomText.trim()) {
      Alert.alert("Add a Message", "Please describe the custom note before posting.");
      return;
    }
    const loc = userLocation;
    if (!loc) {
      Alert.alert("No Location", "Enable location to post a note.");
      return;
    }
    setSubmittingNote(true);
    try {
      await addDoc(collection(db, "trails", navTrail.id, "community_notes"), {
        type: noteSelectedType,
        message: noteSelectedType === "custom" ? noteCustomText.trim() : "",
        lat: loc.latitude,
        lng: loc.longitude,
        createdBy: user.uid,
        createdByName: user.displayName ?? "Rider",
        createdAt: serverTimestamp(),
        createdAtFallback: Date.now(),
        confirmedBy: [],
      });
      setShowNoteModal(false);
      setNoteSelectedType(null);
      setNoteCustomText("");
    } catch {
      Alert.alert("Couldn't Post Note", "Please check your connection and try again.");
    } finally {
      setSubmittingNote(false);
    }
  }, [noteSelectedType, noteCustomText, navTrail, user, userLocation]);

  const confirmNote = useCallback(async (note: CommunityNote) => {
    if (!navTrail || !user || note.confirmedBy.includes(user.uid)) return;
    setConfirmingNote(true);
    try {
      const noteRef = doc(db, "trails", navTrail.id, "community_notes", note.id);
      await updateDoc(noteRef, { confirmedBy: arrayUnion(user.uid) });
      setSelectedNote((prev) =>
        prev && prev.id === note.id
          ? { ...prev, confirmedBy: [...prev.confirmedBy, user.uid] }
          : prev
      );
    } catch {
      Alert.alert("Couldn't Confirm", "Please check your connection and try again.");
    } finally {
      setConfirmingNote(false);
    }
  }, [navTrail, user]);

  const deleteNote = useCallback(async (note: CommunityNote) => {
    if (!navTrail || !user || note.createdBy !== user.uid) return;
    try {
      await deleteDoc(doc(db, "trails", navTrail.id, "community_notes", note.id));
      setSelectedNote(null);
    } catch {
      Alert.alert("Couldn't Delete", "Please check your connection and try again.");
    }
  }, [navTrail, user]);

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
    setTrailKeypoints([]);
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
        keypoints: trailKeypoints,
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

  const allTrailRoutesGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: ALL_TRAILS
      .filter(t => TRAIL_ROUTES[t.id] != null && TRAIL_ROUTES[t.id].length >= 2)
      .map(t => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: TRAIL_ROUTES[t.id].map(p => [p.lng, p.lat]),
        },
        properties: { color: markerColor(t.difficultyRating) },
      })),
  }), []);

  const TOP_BAR_HEIGHT = insets.top + 64;
  const STATE_BAR_HEIGHT = 48;
  const VEHICLE_BAR_HEIGHT = 44;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapLibreMap
        key={mapLayer}
        style={styles.map}
        mapStyle={mapStyle}
        onDidFinishLoadingStyle={() => setMapStyleLoaded(true)}
      >
        <Camera
          ref={cameraRef}
          center={[-119.4179, 36.7783]}
          zoom={7}
          pitch={mapLayer === "terrain3d" ? 60 : 0}
          trackUserLocation={followUser ? "course" : undefined}
        />

        {Platform.OS === "ios" ? (
          <NativeUserLocation />
        ) : (
          <UserLocation />
        )}

        {filteredTrails.map((trail) => (
          <Marker
            key={trail.id}
            lngLat={[trail.coords.longitude, trail.coords.latitude]}
            onPress={() => {
              const enriched = enrichWithRoute(trail);
              setSelectedTrail(enriched);
              // If no hardcoded route, silently try USFS API in background
              if (!enriched.routeCoordinates?.length) {
                fetchUsfsRouteNear(trail.coords.latitude, trail.coords.longitude)
                  .then(col => {
                    const route = extractBestRoute(col);
                    if (route && route.length >= 5) {
                      setSelectedTrail(prev =>
                        prev?.id === trail.id ? { ...prev, routeCoordinates: route } : prev
                      );
                    }
                  })
                  .catch(() => {});
              }
            }}
          >
            <View
              style={[
                styles.trailMarker,
                { backgroundColor: markerColor(trail.difficultyRating) },
              ]}
            />
          </Marker>
        ))}

        {mapStyleLoaded && ridePoints.length > 1 && (
          <GeoJSONSource id="ride-route" data={rideRouteGeoJSON}>
            <Layer
              id="ride-line"
              type="line"
              paint={{ "line-color": "#FF5500", "line-width": 3, "line-opacity": 0.9 }}
            />
          </GeoJSONSource>
        )}

        {mapStyleLoaded && trailPoints.length > 1 && (
          <GeoJSONSource id="trail-recording" data={trailRecordingGeoJSON}>
            <Layer
              id="trail-recording-line"
              type="line"
              paint={{ "line-color": "#00E676", "line-width": 3, "line-opacity": 0.9 }}
            />
          </GeoJSONSource>
        )}

        {mapStyleLoaded && selectedUserTrailGeoJSON && (
          <GeoJSONSource id="selected-user-trail" data={selectedUserTrailGeoJSON}>
            <Layer
              id="selected-user-trail-line"
              type="line"
              paint={{ "line-color": "#FF9800", "line-width": 3, "line-opacity": 0.85 }}
            />
          </GeoJSONSource>
        )}

        {mapStyleLoaded && allTrailRoutesGeoJSON.features.length > 0 && (
          <GeoJSONSource id="all-trail-routes" data={allTrailRoutesGeoJSON as never}>
            <Layer
              id="all-trail-routes-line"
              type="line"
              paint={{
                "line-color": ["get", "color"] as never,
                "line-width": 3.5,
                "line-opacity": 0.78,
              }}
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

        {/* ── BLM land-status raster overlay ─────────────────────────────── */}
        {showBlmOverlay && (
          <RasterSource id="blm-sma" tiles={BLM_SMA_TILES} tileSize={256} minzoom={6}>
            <Layer id="blm-sma-layer" type="raster" paint={{ "raster-opacity": 0.45 }} />
          </RasterSource>
        )}

        {/* ── BLM OHV designated area polygons ──────────────────────────── */}
        {mapStyleLoaded && blmOhvData && blmOhvData.features.length > 0 && (
          <GeoJSONSource id="blm-ohv" data={blmOhvData as never}>
            <Layer
              id="blm-ohv-fill"
              type="fill"
              paint={{ "fill-color": "#D4860A", "fill-opacity": 0.18 }}
            />
            <Layer
              id="blm-ohv-outline"
              type="line"
              paint={{ "line-color": "#D4860A", "line-width": 1.5, "line-opacity": 0.7 }}
            />
          </GeoJSONSource>
        )}

        {/* ── OSM trail GeoJSON lines ────────────────────────────────────── */}
        {/* Tapping anywhere on the line (not just the endpoint pins) opens the trail info sheet. */}
        {mapStyleLoaded && osmGeoJSON && osmGeoJSON.features.length > 0 && (
          <GeoJSONSource id="osm-trails" data={osmGeoJSON as never} onPress={handleOsmTrailPress}>
            <Layer
              id="osm-trails-casing"
              type="line"
              paint={{ "line-color": "#1B5E20", "line-width": 5, "line-opacity": 0.5 }}
            />
            <Layer
              id="osm-trails-line"
              type="line"
              paint={{ "line-color": "#4CAF50", "line-width": 3, "line-opacity": 0.95 }}
            />
          </GeoJSONSource>
        )}

        {/* ── Start/stop checkered-flag markers (cap 120) ───────────────── */}
        {mapStyleLoaded && showOsmOverlay && osmGeoJSON && osmGeoJSON.features.slice(0, 120).map((f, i) => {
          const start = osmFeatureStartCoord(f);
          const end = osmFeatureEndCoord(f);
          return (
            <React.Fragment key={`osm-${i}`}>
              {start && (
                <Marker lngLat={start} onPress={() => setSelectedGuide(fromOsmFeature(f))}>
                  <View style={[styles.osmFlagMarker, styles.osmFlagMarkerStart]}>
                    <MaterialCommunityIcons name="flag-checkered" size={11} color="#1B5E20" />
                  </View>
                </Marker>
              )}
              {end && (
                <Marker lngLat={end} onPress={() => setSelectedGuide(fromOsmFeature(f))}>
                  <View style={[styles.osmFlagMarker, styles.osmFlagMarkerEnd]}>
                    <MaterialCommunityIcons name="flag-checkered" size={11} color="#B71C1C" />
                  </View>
                </Marker>
              )}
            </React.Fragment>
          );
        })}

        {/* ── NFS Trail System GeoJSON lines ────────────────────────────── */}
        {mapStyleLoaded && nfsGeoJSON && nfsGeoJSON.features.length > 0 && (
          <GeoJSONSource id="nfs-trails" data={nfsGeoJSON as never}>
            <Layer
              id="nfs-trails-line"
              type="line"
              paint={{ "line-color": "#2D6A4F", "line-width": 1.8, "line-opacity": 0.9 }}
            />
          </GeoJSONSource>
        )}

        {/* ── Tappable NFS pins (cap 100) ───────────────────────────────── */}
        {nfsGeoJSON && nfsGeoJSON.features.slice(0, 100).map((f, i) => {
          const coord = nfsFeatureStartCoord(f);
          if (!coord) return null;
          return (
            <Marker key={`nfs-${i}`} lngLat={coord} onPress={() => setSelectedGuide(fromUsfsNfsFeature(f))}>
              <View style={styles.nfsMarker} />
            </Marker>
          );
        })}

        {/* ── RIDB trailhead markers ────────────────────────────────────── */}
        {ridbFacilities.map((f, i) => {
          const coord = ridbFacilityCoord(f);
          if (!coord) return null;
          return (
            <Marker key={`ridb-${i}`} lngLat={coord} onPress={() => setSelectedGuide(fromRidbFacility(f))}>
              <View style={styles.ridbMarker} />
            </Marker>
          );
        })}

        {/* ── NPS parks markers ─────────────────────────────────────────── */}
        {npsParks.map((p, i) => {
          const coord = npsParkCoord(p);
          if (!coord) return null;
          return (
            <Marker key={`nps-${i}`} lngLat={coord} onPress={() => setSelectedGuide(fromNpsPark(p))}>
              <View style={styles.npsMarker} />
            </Marker>
          );
        })}

        {/* ── USFS live GeoJSON routes layer ────────────────────────────── */}
        {mapStyleLoaded && usfsGeoJSON && usfsGeoJSON.features.length > 0 && (
          <GeoJSONSource id="usfs-routes" data={usfsGeoJSON as never}>
            <Layer
              id="usfs-routes-line"
              type="line"
              paint={{ "line-color": "#1A6B9E", "line-width": 2.5, "line-opacity": 0.85 }}
            />
          </GeoJSONSource>
        )}

        {/* Tappable pins at the start of each USFS feature (capped at 100) */}
        {usfsGeoJSON && usfsGeoJSON.features.slice(0, 100).map((f, i) => {
          const coord = featureStartCoord(f);
          if (!coord) return null;
          return (
            <Marker
              key={`usfs-${i}`}
              lngLat={coord}
              onPress={() => setSelectedGuide(fromUsfsFeature(f))}
            >
              <View style={styles.usfsMarker} />
            </Marker>
          );
        })}

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

        {isTrailRecording && trailKeypoints.map((kp, i) => {
          const kpConfig = KEYPOINT_CONFIGS.find(k => k.id === kp.type);
          return (
            <Marker key={`keypoint-${i}`} lngLat={[kp.lng, kp.lat]}>
              <View style={[styles.keypointMarker, { backgroundColor: kpConfig?.color ?? "#999" }]}>
                <MaterialIcons name={(kpConfig?.icon ?? "place") as never} size={12} color="#fff" />
              </View>
            </Marker>
          );
        })}

        {isNavigating && navTrail && communityNotes.map((note) => {
          const noteConfig = NOTE_TYPE_CONFIGS.find(n => n.id === note.type);
          return (
            <Marker
              key={`note-${note.id}`}
              lngLat={[note.lng, note.lat]}
              onPress={() => setSelectedNote(note)}
            >
              <View style={[styles.noteMarker, { backgroundColor: noteConfig?.color ?? "#999" }]}>
                <MaterialIcons name={(noteConfig?.icon ?? "place") as never} size={13} color="#fff" />
              </View>
            </Marker>
          );
        })}
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
              {filteredTrails.length +
                (usfsGeoJSON?.features.length ?? 0) +
                (osmGeoJSON?.features.length ?? 0) +
                (nfsGeoJSON?.features.length ?? 0) +
                ridbFacilities.length +
                npsParks.length} TRAILS ·{" "}
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
          <TouchableOpacity
            style={[styles.tagKeypointBtn, { borderColor: colors.success }]}
            onPress={() => setShowKeypointModal(true)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="add-location" size={13} color={colors.success} />
            <Text style={[styles.tagKeypointText, { color: colors.success }]}>
              TAG{trailKeypoints.length > 0 ? ` (${trailKeypoints.length})` : ""}
            </Text>
          </TouchableOpacity>
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
            backgroundColor: mapLayer !== "standard" ? "#5A9A5A" : colors.card,
            borderColor: mapLayer !== "standard" ? "#5A9A5A" : colors.border,
          },
        ]}
        onPress={() => setShowLayerPicker(true)}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name="layers"
          size={20}
          color={mapLayer !== "standard" ? "#fff" : colors.mutedForeground}
        />
      </TouchableOpacity>

      {/* LOCATE / FOLLOW BUTTON */}
      <TouchableOpacity
        style={[
          styles.locateBtn,
          {
            bottom: tabBarHeight + 80,
            backgroundColor: followUser ? "#5A9A5A" : colors.card,
            borderColor: followUser ? "#5A9A5A" : colors.border,
          },
        ]}
        onPress={locateMe}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name={followUser ? "gps-fixed" : "my-location"}
          size={20}
          color={followUser ? "#fff" : (userLocation ? colors.accent : colors.mutedForeground)}
        />
      </TouchableOpacity>

      {/* ── UNIFIED TRAIL GUIDE SHEET ─────────────────────────────────── */}
      <TrailGuideSheet
        guide={selectedGuide}
        onClose={() => setSelectedGuide(null)}
        onNavigate={(coords, name) => {
          const start = coords[0];
          if (!start) return;
          const trail: UserTrail = {
            id: selectedGuide?.id ?? `guide-${Date.now()}`,
            title: name,
            coords: { latitude: start.lat, longitude: start.lng },
            difficulty: selectedGuide?.subtitle ?? "Off-Road Route",
            difficultyRating: 5,
            size: "All Sizes",
            suspension: "Varies",
            region: selectedGuide?.managingOrg ?? "Public Lands",
            state: "US",
            vehicleTypes: ["4x4"],
            routeCoordinates: coords,
          };
          navigateTrail(trail);
        }}
      />

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
          <View style={[styles.layerSheet, styles.layerSheetLight]}>
            <View style={styles.modalHandleLight} />
            <Text style={styles.layerTitleLight}>MAP LAYERS</Text>
            <View style={styles.layerGrid}>
              {LAYER_OPTIONS.map((opt) => {
                const active = mapLayer === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.layerCard,
                      active ? styles.layerCardActive : styles.layerCardInactive,
                    ]}
                    onPress={() => {
                      setMapStyleLoaded(false);
                      setMapLayer(opt.id);
                      setShowLayerPicker(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name={opt.icon as never}
                      size={24}
                      color={active ? "#fff" : "#3D3D2E"}
                    />
                    <Text style={[styles.layerCardLabel, { color: active ? "#fff" : "#3D3D2E" }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {mapLayer === "terrain3d" && (
              <Text style={styles.layerHintLight}>
                Tilt the map with two fingers to see 3D elevation
              </Text>
            )}

            <View style={styles.overlayDividerLight} />
            <Text style={styles.overlaysSectionTitle}>OVERLAYS</Text>

            {/* USFS toggle */}
            <TouchableOpacity
              style={[styles.overlayToggle, showUsfsOverlay ? styles.overlayToggleActive : styles.overlayToggleInactive, { borderColor: showUsfsOverlay ? "#5A9A5A" : "#C8C2B8" }]}
              onPress={() => setShowUsfsOverlay((v) => !v)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="forest" size={20} color={showUsfsOverlay ? "#fff" : "#6B6B5A"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.overlayLabel, { color: showUsfsOverlay ? "#fff" : "#2A2A1E" }]}>
                  USFS TRAILS{usfsLoading ? "  ⏳" : usfsGeoJSON ? `  (${usfsGeoJSON.features.length})` : ""}
                </Text>
                <Text style={[styles.overlaySubLabel, { color: showUsfsOverlay ? "rgba(255,255,255,0.8)" : "#7A7A6A" }]}>
                  Official OHV / 4x4 gov. routes (blue)
                </Text>
              </View>
              {usfsLoading ? <ActivityIndicator size="small" color={showUsfsOverlay ? "#fff" : "#5A9A5A"} /> : <MaterialIcons name={showUsfsOverlay ? "toggle-on" : "toggle-off"} size={28} color={showUsfsOverlay ? "#fff" : "#A8A89A"} />}
            </TouchableOpacity>

            {/* OSM toggle */}
            <TouchableOpacity
              style={[styles.overlayToggle, showOsmOverlay ? styles.overlayToggleOsmActive : styles.overlayToggleInactive, { borderColor: showOsmOverlay ? "#3DAA5C" : "#C8C2B8", marginTop: 8 }]}
              onPress={() => setShowOsmOverlay((v) => !v)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="terrain" size={20} color={showOsmOverlay ? "#fff" : "#6B6B5A"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.overlayLabel, { color: showOsmOverlay ? "#fff" : "#2A2A1E" }]}>
                  OSM TRAILS{osmLoading ? "" : osmError ? "  ✕" : osmGeoJSON ? `  (${osmGeoJSON.features.length})` : ""}
                </Text>
                <Text style={[styles.overlaySubLabel, { color: showOsmOverlay ? "rgba(255,255,255,0.8)" : "#7A7A6A" }]}>
                  {osmError ? "Tap to retry — server unavailable" : "Community 4x4 tracks, dirt roads, OHV paths (green)"}
                </Text>
              </View>
              {osmLoading
                ? <ActivityIndicator size="small" color={showOsmOverlay ? "#fff" : "#3DAA5C"} />
                : osmError
                  ? <MaterialIcons name="refresh" size={24} color={showOsmOverlay ? "#fff" : "#E57373"} />
                  : <MaterialIcons name={showOsmOverlay ? "toggle-on" : "toggle-off"} size={28} color={showOsmOverlay ? "#fff" : "#A8A89A"} />
              }
            </TouchableOpacity>

            {/* BLM toggle */}
            <TouchableOpacity
              style={[styles.overlayToggle, showBlmOverlay ? styles.overlayToggleBlmActive : styles.overlayToggleInactive, { borderColor: showBlmOverlay ? "#D4860A" : "#C8C2B8", marginTop: 8 }]}
              onPress={() => setShowBlmOverlay((v) => !v)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="map" size={20} color={showBlmOverlay ? "#fff" : "#6B6B5A"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.overlayLabel, { color: showBlmOverlay ? "#fff" : "#2A2A1E" }]}>
                  BLM LAND STATUS{blmLoading ? "  ⏳" : blmOhvData ? `  (${blmOhvData.features.length} areas)` : ""}
                </Text>
                <Text style={[styles.overlaySubLabel, { color: showBlmOverlay ? "rgba(255,255,255,0.8)" : "#7A7A6A" }]}>
                  Public land boundaries + designated OHV areas (orange)
                </Text>
              </View>
              {blmLoading ? <ActivityIndicator size="small" color={showBlmOverlay ? "#fff" : "#D4860A"} /> : <MaterialIcons name={showBlmOverlay ? "toggle-on" : "toggle-off"} size={28} color={showBlmOverlay ? "#fff" : "#A8A89A"} />}
            </TouchableOpacity>

            {/* NFS Trail System toggle */}
            <TouchableOpacity
              style={[styles.overlayToggle, showNfsOverlay ? styles.overlayToggleNfsActive : styles.overlayToggleInactive, { borderColor: showNfsOverlay ? "#2D6A4F" : "#C8C2B8", marginTop: 8 }]}
              onPress={() => setShowNfsOverlay((v) => !v)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="hiking" size={20} color={showNfsOverlay ? "#fff" : "#6B6B5A"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.overlayLabel, { color: showNfsOverlay ? "#fff" : "#2A2A1E" }]}>
                  USFS NFS TRAILS{nfsLoading ? "  ⏳" : nfsGeoJSON ? `  (${nfsGeoJSON.features.length} trails)` : ""}
                </Text>
                <Text style={[styles.overlaySubLabel, { color: showNfsOverlay ? "rgba(255,255,255,0.8)" : "#7A7A6A" }]}>
                  National Forest System — 158k mi of classified trails (dark green)
                </Text>
              </View>
              {nfsLoading ? <ActivityIndicator size="small" color={showNfsOverlay ? "#fff" : "#2D6A4F"} /> : <MaterialIcons name={showNfsOverlay ? "toggle-on" : "toggle-off"} size={28} color={showNfsOverlay ? "#fff" : "#A8A89A"} />}
            </TouchableOpacity>

            {/* Recreation.gov (RIDB) toggle */}
            <TouchableOpacity
              style={[styles.overlayToggle, showRidbOverlay ? styles.overlayToggleRidbActive : styles.overlayToggleInactive, { borderColor: showRidbOverlay ? "#7B3F9E" : "#C8C2B8", marginTop: 8 }]}
              onPress={() => setShowRidbOverlay((v) => !v)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="place" size={20} color={showRidbOverlay ? "#fff" : "#6B6B5A"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.overlayLabel, { color: showRidbOverlay ? "#fff" : "#2A2A1E" }]}>
                  RECREATION.GOV TRAILHEADS{ridbFacilities.length > 0 ? `  (${ridbFacilities.length})` : ""}
                </Text>
                <Text style={[styles.overlaySubLabel, { color: showRidbOverlay ? "rgba(255,255,255,0.8)" : "#7A7A6A" }]}>
                  {ridbHasApiKey() ? "Official federal trailheads + OHV facilities (purple)" : "Add EXPO_PUBLIC_RIDB_API_KEY to enable"}
                </Text>
              </View>
              <MaterialIcons name={showRidbOverlay ? "toggle-on" : "toggle-off"} size={28} color={showRidbOverlay ? "#fff" : "#A8A89A"} />
            </TouchableOpacity>

            {/* National Park Service toggle */}
            <TouchableOpacity
              style={[styles.overlayToggle, showNpsOverlay ? styles.overlayToggleNpsActive : styles.overlayToggleInactive, { borderColor: showNpsOverlay ? "#1B5E20" : "#C8C2B8", marginTop: 8 }]}
              onPress={() => setShowNpsOverlay((v) => !v)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="account-balance" size={20} color={showNpsOverlay ? "#fff" : "#6B6B5A"} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.overlayLabel, { color: showNpsOverlay ? "#fff" : "#2A2A1E" }]}>
                  NAT'L PARK SERVICE{npsLoading ? "  ⏳" : npsParks.length > 0 ? `  (${npsParks.length} parks)` : ""}
                </Text>
                <Text style={[styles.overlaySubLabel, { color: showNpsOverlay ? "rgba(255,255,255,0.8)" : "#7A7A6A" }]}>
                  {npsHasApiKey() ? "OHV/4WD national parks within 150 mi (forest green)" : "Add EXPO_PUBLIC_NPS_API_KEY to enable"}
                </Text>
              </View>
              {npsLoading ? <ActivityIndicator size="small" color={showNpsOverlay ? "#fff" : "#1B5E20"} /> : <MaterialIcons name={showNpsOverlay ? "toggle-on" : "toggle-off"} size={28} color={showNpsOverlay ? "#fff" : "#A8A89A"} />}
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
          <TouchableOpacity
            onPress={() => setShowNoteModal(true)}
            style={[styles.navNoteBtn, { backgroundColor: "#E65100" }]}
            activeOpacity={0.8}
          >
            <MaterialIcons name="add-alert" size={18} color="#fff" />
          </TouchableOpacity>
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
                  setTrailKeypoints([]);
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
      {/* KEYPOINT TAGGING MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={showKeypointModal}
        onRequestClose={() => {
          setShowKeypointModal(false);
          setKeypointSelectedType(null);
          setKeypointCustomText("");
        }}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => {}}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: "#E65100", borderTopWidth: 2 }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={[styles.layerTitle, { color: colors.foreground, marginBottom: 4 }]}>
                TAG KEYPOINT
              </Text>
              <Text style={[styles.trailRegion, { color: colors.mutedForeground, marginBottom: 16 }]}>
                Mark your current position with a hazard or note
              </Text>

              {KEYPOINT_CONFIGS.map((kp) => {
                const isActive = keypointSelectedType === kp.id;
                return (
                  <TouchableOpacity
                    key={kp.id}
                    style={[
                      styles.keypointTypeBtn,
                      {
                        backgroundColor: isActive ? kp.color : "rgba(0,0,0,0.04)",
                        borderColor: isActive ? kp.color : colors.border,
                        marginBottom: 8,
                      },
                    ]}
                    onPress={() => {
                      setKeypointSelectedType(kp.id);
                      if (kp.id !== "custom") setKeypointCustomText("");
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name={kp.icon as never}
                      size={20}
                      color={isActive ? "#fff" : colors.mutedForeground}
                    />
                    <Text style={[styles.keypointTypeBtnText, { color: isActive ? "#fff" : colors.foreground }]}>
                      {kp.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {keypointSelectedType === "custom" && (
                <TextInput
                  style={[
                    styles.trailNameInput,
                    { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, marginBottom: 4 },
                  ]}
                  placeholder="Describe the condition..."
                  placeholderTextColor={colors.mutedForeground}
                  value={keypointCustomText}
                  onChangeText={setKeypointCustomText}
                  maxLength={120}
                />
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.downloadBtn, { flex: 1, borderColor: colors.border, marginBottom: 0 }]}
                  onPress={() => {
                    setShowKeypointModal(false);
                    setKeypointSelectedType(null);
                    setKeypointCustomText("");
                  }}
                >
                  <Text style={[styles.downloadBtnText, { color: colors.mutedForeground }]}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.completeBtn,
                    {
                      flex: 1,
                      marginTop: 0,
                      backgroundColor: keypointSelectedType
                        ? (KEYPOINT_CONFIGS.find(k => k.id === keypointSelectedType)?.color ?? colors.success)
                        : colors.border,
                      opacity: keypointSelectedType ? 1 : 0.5,
                    },
                  ]}
                  onPress={addKeypoint}
                  disabled={!keypointSelectedType}
                >
                  <Text style={[styles.completeBtnText, { color: "#fff" }]}>ADD TAG</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ADD COMMUNITY NOTE MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={showNoteModal}
        onRequestClose={() => {
          setShowNoteModal(false);
          setNoteSelectedType(null);
          setNoteCustomText("");
        }}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => {}}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: "#E65100", borderTopWidth: 2 }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={[styles.layerTitle, { color: colors.foreground, marginBottom: 4 }]}>
                POST A NOTE
              </Text>
              <Text style={[styles.trailRegion, { color: colors.mutedForeground, marginBottom: 16 }]}>
                Let other riders on this trail know what's ahead. Visible for 48 hours.
              </Text>

              {NOTE_TYPE_CONFIGS.map((nt) => {
                const isActive = noteSelectedType === nt.id;
                return (
                  <TouchableOpacity
                    key={nt.id}
                    style={[
                      styles.keypointTypeBtn,
                      {
                        backgroundColor: isActive ? nt.color : "rgba(0,0,0,0.04)",
                        borderColor: isActive ? nt.color : colors.border,
                        marginBottom: 8,
                      },
                    ]}
                    onPress={() => {
                      setNoteSelectedType(nt.id);
                      if (nt.id !== "custom") setNoteCustomText("");
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name={nt.icon as never}
                      size={20}
                      color={isActive ? "#fff" : colors.mutedForeground}
                    />
                    <Text style={[styles.keypointTypeBtnText, { color: isActive ? "#fff" : colors.foreground }]}>
                      {nt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {noteSelectedType === "custom" && (
                <TextInput
                  style={[
                    styles.trailNameInput,
                    { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, marginBottom: 4 },
                  ]}
                  placeholder="Describe what's happening..."
                  placeholderTextColor={colors.mutedForeground}
                  value={noteCustomText}
                  onChangeText={setNoteCustomText}
                  maxLength={120}
                />
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.downloadBtn, { flex: 1, borderColor: colors.border, marginBottom: 0 }]}
                  onPress={() => {
                    setShowNoteModal(false);
                    setNoteSelectedType(null);
                    setNoteCustomText("");
                  }}
                >
                  <Text style={[styles.downloadBtnText, { color: colors.mutedForeground }]}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.completeBtn,
                    {
                      flex: 1,
                      marginTop: 0,
                      backgroundColor: noteSelectedType
                        ? (NOTE_TYPE_CONFIGS.find(n => n.id === noteSelectedType)?.color ?? colors.success)
                        : colors.border,
                      opacity: noteSelectedType ? 1 : 0.5,
                    },
                  ]}
                  onPress={addCommunityNote}
                  disabled={!noteSelectedType || submittingNote}
                >
                  {submittingNote ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.completeBtnText, { color: "#fff" }]}>POST NOTE</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* COMMUNITY NOTE DETAIL MODAL */}
      <Modal
        animationType="slide"
        transparent
        visible={!!selectedNote}
        onRequestClose={() => setSelectedNote(null)}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectedNote(null)}>
          {selectedNote && (() => {
            const noteConfig = NOTE_TYPE_CONFIGS.find(n => n.id === selectedNote.type);
            const isAuthor = user?.uid === selectedNote.createdBy;
            const alreadyConfirmed = !!user && selectedNote.confirmedBy.includes(user.uid);
            const ageMs = Date.now() - selectedNote.createdAtMs;
            const ageMins = Math.max(0, Math.floor(ageMs / 60000));
            const ageLabel = ageMins < 60 ? `${ageMins}m ago` : `${Math.floor(ageMins / 60)}h ago`;
            return (
              <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: noteConfig?.color ?? colors.accent, borderTopWidth: 2 }]}>
                <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                  <View style={styles.modalHandle} />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <View style={[styles.noteMarker, { backgroundColor: noteConfig?.color ?? "#999", width: 26, height: 26, borderRadius: 13 }]}>
                      <MaterialIcons name={(noteConfig?.icon ?? "place") as never} size={14} color="#fff" />
                    </View>
                    <Text style={[styles.layerTitle, { color: colors.foreground }]}>
                      {noteConfig?.label.toUpperCase() ?? "NOTE"}
                    </Text>
                  </View>
                  <Text style={[styles.trailRegion, { color: colors.mutedForeground, marginBottom: 12 }]}>
                    Posted by {selectedNote.createdByName} · {ageLabel}
                  </Text>
                  {!!selectedNote.message && (
                    <Text style={[styles.noteMessage, { color: colors.foreground }]}>
                      {selectedNote.message}
                    </Text>
                  )}

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                    <TouchableOpacity
                      style={[styles.downloadBtn, { flex: 1, borderColor: colors.border, marginBottom: 0 }]}
                      onPress={() => setSelectedNote(null)}
                    >
                      <Text style={[styles.downloadBtnText, { color: colors.mutedForeground }]}>CLOSE</Text>
                    </TouchableOpacity>
                    {isAuthor ? (
                      <TouchableOpacity
                        style={[styles.completeBtn, { flex: 1, marginTop: 0, backgroundColor: colors.destructive }]}
                        onPress={() => deleteNote(selectedNote)}
                      >
                        <Text style={[styles.completeBtnText, { color: "#fff" }]}>DELETE</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.completeBtn,
                          { flex: 1, marginTop: 0, backgroundColor: alreadyConfirmed ? colors.border : colors.success, opacity: alreadyConfirmed || confirmingNote ? 0.6 : 1 },
                        ]}
                        onPress={() => confirmNote(selectedNote)}
                        disabled={alreadyConfirmed || confirmingNote}
                      >
                        {confirmingNote ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <Text style={[styles.completeBtnText, { color: alreadyConfirmed ? colors.mutedForeground : "#000" }]}>
                            {alreadyConfirmed ? "CONFIRMED" : "STILL ACCURATE"}
                            {selectedNote.confirmedBy.length > 0 ? ` (${selectedNote.confirmedBy.length})` : ""}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })()}
        </TouchableOpacity>
      </Modal>

      {/* OTA update badge — confirms which bundle is running */}
      <View style={styles.updateBadge} pointerEvents="none">
        <Text style={styles.updateBadgeText}>
          {Updates.isEmbeddedLaunch ? "APK build" : "OTA: CA-map-fix"}
        </Text>
      </View>
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
  navNoteBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  updateBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  updateBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  osmFlagMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  osmFlagMarkerStart: {
    borderColor: "#1B5E20",
  },
  osmFlagMarkerEnd: {
    borderColor: "#B71C1C",
  },
  usfsMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#1A6B9E",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  usfsPopup: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
  },
  usfsPopupHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  usfsPopupTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  usfsPopupSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  usfsNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    paddingVertical: 10,
  },
  usfsNavBtnText: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
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
  userLocationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#33B5E5",
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  userTrailMarker: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 2,
    backgroundColor: "transparent",
    transform: [{ rotate: "45deg" }],
  },
  nfsMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2D6A4F",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  ridbMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#7B3F9E",
    borderWidth: 2,
    borderColor: "#fff",
  },
  npsMarker: {
    width: 13,
    height: 13,
    borderRadius: 3,
    backgroundColor: "#1B5E20",
    borderWidth: 2,
    borderColor: "#fff",
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
  overlayDividerLight: { borderTopWidth: 1, borderColor: "#D0C9BC", marginVertical: 14 },
  overlayToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  overlayToggleInactive: { backgroundColor: "#F5F0E6" },
  overlayToggleActive:     { backgroundColor: "#5A9A5A" },
  overlayToggleOsmActive:  { backgroundColor: "#3DAA5C" },
  overlayToggleBlmActive:  { backgroundColor: "#D4860A" },
  overlayToggleNfsActive:  { backgroundColor: "#2D6A4F" },
  overlayToggleRidbActive: { backgroundColor: "#7B3F9E" },
  overlayToggleNpsActive:  { backgroundColor: "#1B5E20" },
  overlayLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  overlaySubLabel: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  overlaysSectionTitle: {
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 10,
    color: "#8A8478",
  },
  layerSheetLight: {
    backgroundColor: "#F5F0E6",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#D0C9BC",
  },
  modalHandleLight: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C0BAB0",
    alignSelf: "center",
    marginBottom: 16,
  },
  layerTitleLight: {
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 16,
    color: "#2A2A1E",
  },
  layerCardActive: { backgroundColor: "#5A9A5A", borderColor: "#5A9A5A" },
  layerCardInactive: { backgroundColor: "#EDE7DC", borderColor: "#D0C9BC" },
  layerHintLight: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 14,
    fontStyle: "italic",
    color: "#8A8478",
  },
  keypointMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
  noteMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
  noteMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  keypointTypeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  keypointTypeBtnText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tagKeypointBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagKeypointText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
