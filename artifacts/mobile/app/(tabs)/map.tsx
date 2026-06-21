import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Platform,
  FlatList,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
// react-native-maps is native-only; web preview shows a fallback
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

interface Trail {
  id: string;
  title: string;
  coords: { latitude: number; longitude: number };
  difficulty: string;
  difficultyRating: number;
  size: string;
  suspension: string;
  region: string;
}

interface TrailPhoto {
  url: string;
  uploadedBy: string;
  createdAt: unknown;
}

const CA_TRAILS: Trail[] = [
  {
    id: "1",
    title: "Rubicon Trail",
    coords: { latitude: 39.0041, longitude: -120.3122 },
    difficulty: "10/10 Hardcore",
    difficultyRating: 10,
    size: "Jeep / Short Wheelbase",
    suspension: "3-4\" Lift + Lockers",
    region: "El Dorado County",
  },
  {
    id: "2",
    title: "Hungry Valley SVRA",
    coords: { latitude: 34.7578, longitude: -118.8788 },
    difficulty: "4/10 Moderate",
    difficultyRating: 4,
    size: "All Sizes / Side-by-Side",
    suspension: "Stock Friendly",
    region: "Los Angeles County",
  },
  {
    id: "3",
    title: "Johnson Valley (Hammertown)",
    coords: { latitude: 34.4214, longitude: -116.6833 },
    difficulty: "9/10 Extreme",
    difficultyRating: 9,
    size: "Full Size / Rock Crawlers",
    suspension: "Long Travel Required",
    region: "San Bernardino County",
  },
  {
    id: "4",
    title: "Big Bear OHV Trails",
    coords: { latitude: 34.2439, longitude: -116.8824 },
    difficulty: "6/10 Challenging",
    difficultyRating: 6,
    size: "Mid-Size & Larger",
    suspension: "2\" Lift Recommended",
    region: "San Bernardino County",
  },
  {
    id: "5",
    title: "Ocotillo Wells SVRA",
    coords: { latitude: 33.1536, longitude: -116.1334 },
    difficulty: "5/10 Moderate",
    difficultyRating: 5,
    size: "All Sizes",
    suspension: "Stock OK",
    region: "San Diego County",
  },
  {
    id: "6",
    title: "Fordyce Lake Trail",
    coords: { latitude: 39.3697, longitude: -120.5125 },
    difficulty: "8/10 Very Hard",
    difficultyRating: 8,
    size: "Jeep / Short Wheelbase",
    suspension: "3\" Lift + Skid Plates",
    region: "Nevada County",
  },
];

function DifficultyBar({ rating }: { rating: number }) {
  const colors = useColors();
  const color =
    rating <= 3
      ? colors.success
      : rating <= 6
      ? "#FFC107"
      : colors.destructive;

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

export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [selectedTrail, setSelectedTrail] = useState<Trail | null>(null);
  const [photos, setPhotos] = useState<TrailPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completedTrails, setCompletedTrails] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Load user's completed trails from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        setCompletedTrails(snap.data().completedTrails ?? []);
      }
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

  const uploadPhoto = useCallback(async () => {
    if (!selectedTrail || !user) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
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

      const response = await fetch(uri);
      const blob = await response.blob();
      await uploadBytesResumable(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      await addDoc(collection(db, "trails", selectedTrail.id, "photos"), {
        url: downloadURL,
        uploadedBy: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Upload failed", "Could not upload photo. Try again.");
    } finally {
      setUploading(false);
    }
  }, [selectedTrail, user]);

  const completeTrail = useCallback(async () => {
    if (!user || !selectedTrail) return;
    setCompleting(true);
    try {
      const newAchievements = await markTrailComplete(user.uid, selectedTrail.id);
      setCompletedTrails((prev) =>
        prev.includes(selectedTrail.id) ? prev : [...prev, selectedTrail.id]
      );
      if (newAchievements.length > 0) {
        Alert.alert(
          "🏆 Achievement Unlocked!",
          `You earned ${newAchievements.length} badge${newAchievements.length > 1 ? "s" : ""}! Check your profile to see them.`,
          [{ text: "NICE!", style: "default" }]
        );
      } else {
        Alert.alert("Trail Logged!", "This trail is already marked complete.", [{ text: "OK" }]);
      }
    } catch {
      Alert.alert("Error", "Could not log trail. Try again.");
    } finally {
      setCompleting(false);
    }
  }, [user, selectedTrail]);

  const locateMe = useCallback(async () => {
    if (userLocation) {
      mapRef.current?.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 600);
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
        mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600);
      }
    }
  }, [userLocation]);

  const markerColor = (rating: number) => {
    if (rating <= 3) return "#00E676";
    if (rating <= 6) return "#FFC107";
    return "#FF5500";
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={{
          latitude: 36.7783,
          longitude: -119.4179,
          latitudeDelta: 6.0,
          longitudeDelta: 6.0,
        }}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        customMapStyle={darkMapStyle}
      >
        {CA_TRAILS.map((trail) => (
          <Marker
            key={trail.id}
            coordinate={trail.coords}
            pinColor={markerColor(trail.difficultyRating)}
            onPress={() => setSelectedTrail(trail)}
            title={trail.title}
          />
        ))}
      </MapView>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.topBarInner, { backgroundColor: "rgba(18,18,18,0.92)" }]}>
          <View>
            <Text style={[styles.topTitle, { color: colors.foreground }]}>CA OFFROAD HQ</Text>
            <Text style={[styles.topSub, { color: colors.mutedForeground }]}>
              {CA_TRAILS.length} TRAILS
            </Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Feather name="log-out" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Custom locate button — bottom-right, above safe area */}
      <TouchableOpacity
        style={[styles.locateBtn, {
          bottom: insets.bottom + 100,
          backgroundColor: colors.card,
          borderColor: colors.border,
        }]}
        onPress={locateMe}
        activeOpacity={0.8}
      >
        <Feather name="navigation" size={18} color={userLocation ? colors.accent : colors.mutedForeground} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.liveBtn, { backgroundColor: colors.accent }]}
        onPress={() => router.push("/(tabs)/stream")}
        activeOpacity={0.85}
      >
        <Feather name="radio" size={16} color="#000" />
        <Text style={styles.liveBtnText}>GO LIVE</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent
        visible={!!selectedTrail}
        onRequestClose={() => setSelectedTrail(null)}
      >
        {selectedTrail && (
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.accent }]}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trailTitle, { color: colors.foreground }]}>
                    {selectedTrail.title.toUpperCase()}
                  </Text>
                  <Text style={[styles.trailRegion, { color: colors.mutedForeground }]}>
                    {selectedTrail.region}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedTrail(null)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              <View style={[styles.diffRow, { backgroundColor: colors.secondary }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.specLabel, { color: colors.mutedForeground }]}>DIFFICULTY</Text>
                  <Text style={[styles.specValue, { color: colors.foreground }]}>
                    {selectedTrail.difficulty}
                  </Text>
                  <DifficultyBar rating={selectedTrail.difficultyRating} />
                </View>
              </View>

              <View style={styles.specsGrid}>
                <View style={[styles.specCard, { backgroundColor: colors.secondary }]}>
                  <Feather name="truck" size={16} color={colors.accent} />
                  <Text style={[styles.specLabel, { color: colors.mutedForeground }]}>VEHICLE SIZE</Text>
                  <Text style={[styles.specValue, { color: colors.foreground }]}>
                    {selectedTrail.size}
                  </Text>
                </View>
                <View style={[styles.specCard, { backgroundColor: colors.secondary }]}>
                  <Feather name="settings" size={16} color={colors.accent} />
                  <Text style={[styles.specLabel, { color: colors.mutedForeground }]}>SUSPENSION</Text>
                  <Text style={[styles.specValue, { color: colors.foreground }]}>
                    {selectedTrail.suspension}
                  </Text>
                </View>
              </View>

              <View style={styles.photosSection}>
                <View style={styles.photosHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>COMMUNITY PICS</Text>
                  <TouchableOpacity
                    onPress={uploadPhoto}
                    disabled={uploading}
                    style={[styles.addPicBtn, { borderColor: colors.accent }]}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <Feather name="camera" size={14} color={colors.accent} />
                        <Text style={[styles.addPicText, { color: colors.accent }]}>ADD PIC</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {photos.length === 0 ? (
                  <View style={styles.noPhotos}>
                    <Feather name="image" size={24} color={colors.border} />
                    <Text style={[styles.noPhotosText, { color: colors.mutedForeground }]}>
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
                        style={[styles.photo, { borderColor: colors.border }]}
                      />
                    )}
                  />
                )}
              </View>

              {/* MARK COMPLETE */}
              {(() => {
                const done = completedTrails.includes(selectedTrail.id);
                return (
                  <TouchableOpacity
                    style={[
                      styles.completeBtn,
                      { backgroundColor: done ? colors.secondary : colors.success, borderColor: done ? colors.success : "transparent", borderWidth: done ? 1 : 0 },
                      completing && { opacity: 0.6 },
                    ]}
                    onPress={completeTrail}
                    disabled={completing}
                    activeOpacity={0.85}
                  >
                    {completing ? (
                      <ActivityIndicator color={done ? colors.success : "#000"} />
                    ) : (
                      <>
                        <Feather name={done ? "check-circle" : "flag"} size={16} color={done ? colors.success : "#000"} />
                        <Text style={[styles.completeBtnText, { color: done ? colors.success : "#000" }]}>
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
  topBar: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  topBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  topTitle: { fontWeight: "900", fontSize: 15, letterSpacing: 2 },
  topSub: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 1 },
  logoutBtn: { padding: 6 },
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
  liveBtn: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 4,
    elevation: 8,
    shadowColor: "#FF5500",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  liveBtnText: { fontWeight: "900", letterSpacing: 2, color: "#000", fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
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
  modalHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  trailTitle: { fontSize: 20, fontWeight: "900", letterSpacing: 1.5 },
  trailRegion: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 3 },
  diffRow: { padding: 14, borderRadius: 8, marginBottom: 12 },
  specsGrid: { flexDirection: "row", gap: 10, marginBottom: 16 },
  specCard: { flex: 1, padding: 12, borderRadius: 8, gap: 4 },
  specLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1, marginTop: 6 },
  specValue: { fontSize: 12, fontWeight: "700", lineHeight: 16 },
  photosSection: { gap: 10 },
  photosHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  photo: { width: 100, height: 100, borderRadius: 4, marginRight: 8, borderWidth: 1 },
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
});

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#555" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
