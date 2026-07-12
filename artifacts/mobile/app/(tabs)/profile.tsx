"use no memo";
import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  Dimensions,
  Switch,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import TrailSearchModal from "@/components/TrailSearchModal";
import { OfflineManager } from "@maplibre/maplibre-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  ref,
  getDownloadURL,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { grantBadge } from "@/lib/achievements";
import { ALL_ACHIEVEMENTS } from "@/lib/achievements-catalog";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_SIZE = (SCREEN_WIDTH - 4) / 3;

interface VehicleSpecs {
  make: string;
  model: string;
  year: string;
  tireSize: string;
  suspension: string;
  mods: string;
  liftIn: number;
  tireDiameterIn: number;
  hasLockers: boolean;
  hasLowRange: boolean;
}

interface MediaItem {
  url: string;
  type: "photo" | "video";
  uploadedAt: number;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: number;
  unlocked: boolean;
}

interface RideRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSecs: number;
  distanceMiles: number;
  topSpeedMph: number;
  avgSpeedMph: number;
  elevationGainFt: number;
  name?: string | null;
  segments?: { id: string; name: string; trailId?: string }[];
  points?: unknown[];
}

interface OfflineMapPack {
  id: string;
  trailId?: string;
  trailTitle: string;
  lat?: number;
  lng?: number;
  sizeMB: number;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const SECTIONS = ["gallery", "specs", "achievements", "rides", "maps"] as const;
type Section = typeof SECTIONS[number];

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();

  const [activeSection, setActiveSection] = useState<Section>("gallery");
  const [showSearch, setShowSearch] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [specs, setSpecs] = useState<VehicleSpecs>({
    make: "",
    model: "",
    year: "",
    tireSize: "",
    suspension: "",
    mods: "",
    liftIn: 0,
    tireDiameterIn: 0,
    hasLockers: false,
    hasLowRange: false
  });
  const [savingSpecs, setSavingSpecs] = useState(false);
  const [specsSaved, setSpecsSaved] = useState(false);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [rides, setRides] = useState<RideRecord[]>([]);
  const [offlinePacks, setOfflinePacks] = useState<OfflineMapPack[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      if (data.vehicleSpecs) setSpecs(data.vehicleSpecs);
      if (typeof data.isPublic === "boolean") setIsPublic(data.isPublic);
      if (data.displayName) setDisplayName(data.displayName as string);
      if (data.photoURL) setAvatarUrl(data.photoURL as string);

      const earned: string[] = data.achievements || [];

      // Auto-grant beta_explorer to every signed-in user on each profile load.
      // Runs even when the doc doesn't exist yet (new users) — grantBadge
      // creates the doc, which triggers a second snapshot with the badge included.
      if (!earned.includes("beta_explorer")) {
        grantBadge(user.uid, "beta_explorer").catch(console.warn);
      }

      const mapped: Achievement[] = ALL_ACHIEVEMENTS.map((a) => ({
        ...a,
        unlocked: earned.includes(a.id),
        unlockedAt: data.achievementDates?.[a.id],
      }));
      setAchievements(mapped);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ridesQuery = query(
      collection(db, "users", user.uid, "rides"),
      orderBy("startedAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(ridesQuery, (snap) => {
      const items: RideRecord[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() } as RideRecord));
      setRides(items);
    });
    return unsub;
  }, [user]);

  const loadOfflinePacks = useCallback(async () => {
    setLoadingPacks(true);
    try {
      const packs = await OfflineManager.getPacks();
      const items: OfflineMapPack[] = await Promise.all(
        packs.map(async (p) => {
          const meta = (p.metadata ?? {}) as Record<string, unknown>;
          let sizeMB = 0;
          try {
            const status = await p.status();
            sizeMB = status.completedResourceSize / (1024 * 1024);
          } catch {
            // size unavailable — still show the pack
          }
          return {
            id: p.id,
            trailId: typeof meta.trailId === "string" ? meta.trailId : undefined,
            trailTitle: typeof meta.trailTitle === "string" ? meta.trailTitle : "Saved Map Area",
            lat: typeof meta.lat === "number" ? meta.lat : undefined,
            lng: typeof meta.lng === "number" ? meta.lng : undefined,
            sizeMB,
          };
        })
      );
      setOfflinePacks(items);
    } catch {
      setOfflinePacks([]);
    } finally {
      setLoadingPacks(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === "maps") loadOfflinePacks();
  }, [activeSection, loadOfflinePacks]);

  const viewOfflinePackOnMap = useCallback((pack: OfflineMapPack) => {
    if (pack.lat == null || pack.lng == null) {
      Alert.alert("Unavailable", "This saved map doesn't have location data.");
      return;
    }
    router.push({
      pathname: "/(tabs)/map",
      params: {
        focusLat: String(pack.lat),
        focusLng: String(pack.lng),
        ...(pack.trailId ? { focusTrailId: pack.trailId } : {}),
      },
    });
  }, [router]);

  const deleteOfflinePack = useCallback((pack: OfflineMapPack) => {
    Alert.alert(
      "Remove offline map?",
      `This deletes the downloaded map tiles for "${pack.trailTitle}". You can download it again anytime.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await OfflineManager.deletePack(pack.id);
              setOfflinePacks((prev) => prev.filter((p) => p.id !== pack.id));
            } catch {
              Alert.alert("Error", "Could not delete offline map. Try again.");
            }
          },
        },
      ]
    );
  }, []);

  const togglePrivacy = useCallback(async (value: boolean) => {
    if (!user) return;
    setTogglingPrivacy(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          isPublic: value,
          email: user.email,
          uid: user.uid,
        },
        { merge: true }
      );
      setIsPublic(value);
    } catch {
      Alert.alert("Error", "Could not update privacy. Try again.");
    } finally {
      setTogglingPrivacy(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, "users", user.uid, "gallery"),
      (snap) => {
        const items: MediaItem[] = [];
        snap.forEach((d) => items.push(d.data() as MediaItem));
        items.sort((a, b) => b.uploadedAt - a.uploadedAt);
        setMedia(items);
      }
    );
    return unsub;
  }, [user]);

  const pickAvatar = useCallback(async () => {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to set a profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const storageRef = ref(storage, `users/${user.uid}/avatar.jpg`);
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response as Blob);
        xhr.onerror = () => reject(new Error("Failed to read image"));
        xhr.responseType = "blob";
        xhr.open("GET", asset.uri, true);
        xhr.send(null);
      });
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(db, "users", user.uid), { photoURL: url }, { merge: true });
      setAvatarUrl(url);
    } catch {
      Alert.alert("Error", "Could not upload profile photo. Try again.");
    } finally {
      setUploadingAvatar(false);
    }
  }, [user]);

  const saveDisplayName = useCallback(async () => {
    if (!user || !nameInput.trim()) return;
    try {
      await setDoc(doc(db, "users", user.uid), { displayName: nameInput.trim() }, { merge: true });
      setDisplayName(nameInput.trim());
      setEditingName(false);
    } catch {
      Alert.alert("Error", "Could not save name. Try again.");
    }
  }, [user, nameInput]);

  const pickAndUpload = useCallback(async () => {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to upload media.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 10,
      base64: true,
    });
    if (result.canceled || !result.assets.length) return;

    setUploading(true);
    setUploadProgress(0);
    const total = result.assets.length;
    let done = 0;

    const errors: string[] = [];

    for (const asset of result.assets) {
      try {
        const isVideo = asset.type === "video";
        const ext = isVideo ? "mp4" : "jpg";
        const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const storageRef = ref(storage, `users/${user.uid}/gallery/${filename}`);

        // XHR blob approach — only method proven to work with Firebase Storage
        // in both React Native (Hermes/JSC) and browser environments.
        // fetch().blob() and uploadString() both fail on RN due to Blob constructor limits.
        const blob = await new Promise<Blob>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = () => resolve(xhr.response as Blob);
          xhr.onerror = () => reject(new Error("Failed to read image file"));
          xhr.responseType = "blob";
          xhr.open("GET", asset.uri, true);
          xhr.send(null);
        });
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);

        await setDoc(doc(db, "users", user.uid, "gallery", filename), {
          url,
          type: isVideo ? "video" : "photo",
          uploadedAt: Date.now(),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
      }
      done++;
      setUploadProgress(Math.round((done / total) * 100));
    }
    setUploading(false);
    if (errors.length) {
      Alert.alert(
        "Upload failed",
        `${errors.length} file(s) failed to upload.\n\n${errors[0]}${errors.length > 1 ? `\n…and ${errors.length - 1} more.` : ""}`
      );
    }
  }, [user]);

  const saveSpecs = useCallback(async () => {
    if (!user) return;
    setSavingSpecs(true);
    try {
      await setDoc(doc(db, "users", user.uid), { vehicleSpecs: specs }, { merge: true });
      setSpecsSaved(true);
      setTimeout(() => setSpecsSaved(false), 2000);
    } catch {
      Alert.alert("Error", "Could not save specs. Try again.");
    } finally {
      setSavingSpecs(false);
    }
  }, [user, specs]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrap} disabled={uploadingAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={[styles.avatar, { borderColor: colors.accent }]} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.secondary, borderColor: colors.accent }]}>
              <Text style={[styles.avatarText, { color: colors.accent }]}>
                {(displayName || user?.email || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.cameraOverlay, { backgroundColor: colors.accent }]}>
            {uploadingAvatar
              ? <ActivityIndicator size={10} color="#fff" />
              : <Feather name="camera" size={10} color="#fff" />}
          </View>
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveDisplayName}
                maxLength={30}
                placeholder="Your name"
                placeholderTextColor={colors.mutedForeground}
              />
              <TouchableOpacity onPress={saveDisplayName} style={styles.nameEditBtn}>
                <Feather name="check" size={16} color={colors.success} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingName(false)} style={styles.nameEditBtn}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { setNameInput(displayName); setEditingName(true); }}
              style={styles.nameRow}
            >
              <Text style={[styles.nameText, { color: colors.foreground }]} numberOfLines={1}>
                {displayName || user?.email?.split("@")[0] || "Rider"}
              </Text>
              <Feather name="edit-2" size={11} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          <Text style={[styles.emailText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {user?.email ?? ""}
          </Text>
          <Text style={[styles.statsText, { color: colors.mutedForeground }]}>
            {media.length} PHOTOS · {unlockedCount}/{ALL_ACHIEVEMENTS.length} BADGES · {rides.length} RIDES
          </Text>
        </View>

        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Feather name="log-out" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* SEARCH TRAILS */}
      <TouchableOpacity
        style={[styles.privacyRow, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}
        onPress={() => setShowSearch(true)}
        activeOpacity={0.75}
      >
        <View style={styles.privacyLeft}>
          <Feather name="search" size={15} color={colors.accent} />
          <View>
            <Text style={[styles.privacyLabel, { color: colors.foreground }]}>SEARCH TRAILS</Text>
            <Text style={[styles.privacySub, { color: colors.mutedForeground }]}>Find any of 402 trails nationwide</Text>
          </View>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>

      {/* PRIVACY TOGGLE */}
      <View style={[styles.privacyRow, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
        <View style={styles.privacyLeft}>
          <Feather
            name={isPublic ? "globe" : "lock"}
            size={15}
            color={isPublic ? colors.success : colors.mutedForeground}
          />
          <View>
            <Text style={[styles.privacyLabel, { color: colors.foreground }]}>
              {isPublic ? "PUBLIC PROFILE" : "PRIVATE PROFILE"}
            </Text>
            <Text style={[styles.privacySub, { color: colors.mutedForeground }]}>
              {isPublic
                ? "Visible in the Riders tab"
                : "Only you can see your profile"}
            </Text>
          </View>
        </View>
        {togglingPrivacy ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Switch
            value={isPublic}
            onValueChange={togglePrivacy}
            thumbColor={isPublic ? colors.success : colors.mutedForeground}
            trackColor={{ false: colors.border, true: "#004D26" }}
          />
        )}
      </View>

      {/* SECTION TABS */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.tab, activeSection === s && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveSection(s)}
          >
            <Feather
              name={s === "gallery" ? "image" : s === "specs" ? "truck" : s === "rides" ? "activity" : s === "maps" ? "map" : "award"}
              size={16}
              color={activeSection === s ? colors.accent : colors.mutedForeground}
            />
            <Text
              numberOfLines={1}
              style={[styles.tabText, { color: activeSection === s ? colors.accent : colors.mutedForeground }]}
            >
              {s === "achievements" ? "BADGES" : s.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* GALLERY */}
      {activeSection === "gallery" && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={[styles.uploadBtn, { backgroundColor: "#74C274" }, uploading && { opacity: 0.6 }]}
            onPress={pickAndUpload}
            disabled={uploading}
          >
            {uploading ? (
              <Text style={[styles.uploadBtnText, { color: "#fff" }]}>UPLOADING... {uploadProgress}%</Text>
            ) : (
              <>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={[styles.uploadBtnText, { color: "#fff" }]}>ADD PHOTOS / VIDEOS</Text>
              </>
            )}
          </TouchableOpacity>

          {media.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="camera" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No media yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Upload your trail photos and videos
              </Text>
            </View>
          ) : (
            <FlatList
              data={media}
              keyExtractor={(_, i) => String(i)}
              numColumns={3}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => setLightboxUri(item.url)}>
                  <Image
                    source={{ uri: item.url }}
                    style={{ width: GRID_SIZE, height: GRID_SIZE, margin: 1 }}
                  />
                  {item.type === "video" && (
                    <View style={styles.videoOverlay}>
                      <Feather name="play" size={20} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* VEHICLE SPECS */}
      {activeSection === "specs" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.specsContainer, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.specsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.specsCardHeader}>
              <Feather name="truck" size={18} color={colors.accent} />
              <Text style={[styles.specsCardTitle, { color: colors.foreground }]}>MY RIG</Text>
            </View>

            {([
              { key: "year", label: "YEAR", placeholder: "e.g. 2022", icon: "calendar" },
              { key: "make", label: "MAKE", placeholder: "e.g. Toyota", icon: "truck" },
              { key: "model", label: "MODEL", placeholder: "e.g. Tacoma TRD Pro", icon: "tag" },
              { key: "tireSize", label: "TIRE SIZE", placeholder: 'e.g. 35x12.5R17', icon: "circle" },
              { key: "suspension", label: "SUSPENSION", placeholder: "e.g. Icon Stage 8, 3in lift", icon: "settings" },
            ] as { key: keyof VehicleSpecs; label: string; placeholder: string; icon: string }[]).map(({ key, label, placeholder, icon }) => (
              <View key={key} style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: colors.accent }]}>{label}</Text>
                <View style={[styles.fieldRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <Feather name={icon as keyof typeof Feather.glyphMap} size={14} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.fieldInput, { color: colors.foreground }]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    value={String(specs[key] ?? "")}
                    onChangeText={(t) => setSpecs((s) => ({ ...s, [key]: t }))}
                  />
                </View>
              </View>
            ))}

            <View style={styles.specsDivider} />
            <View style={styles.specsCardHeader}>
              <Feather name="bar-chart-2" size={18} color={colors.accent} />
              <Text style={[styles.specsCardTitle, { color: colors.foreground }]}>DETERMINISTIC SPECS (FOR ASSISTANT)</Text>
            </View>
            <Text style={[styles.specsSub, { color: colors.mutedForeground, marginBottom: 12 }]}>
              These help the AI Trip Assistant check if your vehicle fits specific trails.
            </Text>

            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: colors.accent }]}>LIFT (INCHES)</Text>
              <View style={[styles.fieldRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="arrow-up" size={14} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground }]}
                  placeholder="e.g. 2.5"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={String(specs.liftIn || "")}
                  onChangeText={(t) => setSpecs((s) => ({ ...s, liftIn: parseFloat(t) || 0 }))}
                />
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: colors.accent }]}>TIRE DIAMETER (INCHES)</Text>
              <View style={[styles.fieldRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="circle" size={14} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.fieldInput, { color: colors.foreground }]}
                  placeholder="e.g. 33"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={String(specs.tireDiameterIn || "")}
                  onChangeText={(t) => setSpecs((s) => ({ ...s, tireDiameterIn: parseFloat(t) || 0 }))}
                />
              </View>
            </View>

            <View style={[styles.switchField, { marginVertical: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.accent, marginBottom: 2 }]}>HAS LOCKERS</Text>
                <Text style={[styles.privacySub, { color: colors.mutedForeground }]}>Front or rear locking differentials</Text>
              </View>
              <Switch
                value={specs.hasLockers}
                onValueChange={(v) => setSpecs((s) => ({ ...s, hasLockers: v }))}
                thumbColor={specs.hasLockers ? colors.success : colors.mutedForeground}
                trackColor={{ false: colors.border, true: "#004D26" }}
              />
            </View>

            <View style={[styles.switchField, { marginVertical: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.accent, marginBottom: 2 }]}>HAS LOW RANGE</Text>
                <Text style={[styles.privacySub, { color: colors.mutedForeground }]}>2-speed transfer case (4LO)</Text>
              </View>
              <Switch
                value={specs.hasLowRange}
                onValueChange={(v) => setSpecs((s) => ({ ...s, hasLowRange: v }))}
                thumbColor={specs.hasLowRange ? colors.success : colors.mutedForeground}
                trackColor={{ false: colors.border, true: "#004D26" }}
              />
            </View>

            <View style={styles.specsDivider} />
            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: colors.accent }]}>MODS & BUILD NOTES</Text>
              <TextInput
                style={[styles.modsInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. ARB bumper, snorkel, roof rack, onboard air..."
                placeholderTextColor={colors.mutedForeground}
                value={specs.mods}
                onChangeText={(t) => setSpecs((s) => ({ ...s, mods: t }))}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: "#74C274" }, savingSpecs && { opacity: 0.6 }]}
              onPress={saveSpecs}
              disabled={savingSpecs}
            >
              {savingSpecs ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name={specsSaved ? "check" : "save"} size={16} color="#fff" />
                  <Text style={[styles.saveBtnText, { color: "#fff" }]}>{specsSaved ? "SAVED!" : "SAVE RIG SPECS"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ACHIEVEMENTS */}
      {activeSection === "achievements" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.achContainer, { paddingBottom: insets.bottom + 20 }]}
        >
          <View style={styles.achProgress}>
            <Text style={[styles.achProgressText, { color: colors.foreground }]}>
              {unlockedCount}
              <Text style={{ color: colors.mutedForeground }}>/{ALL_ACHIEVEMENTS.length} UNLOCKED</Text>
            </Text>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.accent, width: `${(unlockedCount / ALL_ACHIEVEMENTS.length) * 100}%` },
                ]}
              />
            </View>
          </View>

          {achievements.map((ach) => (
            <View
              key={ach.id}
              style={[
                styles.achCard,
                {
                  backgroundColor: ach.unlocked ? colors.card : colors.secondary,
                  borderColor: ach.unlocked ? colors.accent : colors.border,
                  opacity: ach.unlocked ? 1 : 0.5,
                },
              ]}
            >
              <View style={[styles.achIcon, { backgroundColor: ach.unlocked ? colors.accent : colors.border }]}>
                <Feather name={ach.icon as keyof typeof Feather.glyphMap} size={18} color={ach.unlocked ? "#fff" : "#555"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.achTitle, { color: ach.unlocked ? colors.foreground : colors.mutedForeground }]}>
                  {ach.title}
                </Text>
                <Text style={[styles.achDesc, { color: colors.mutedForeground }]}>{ach.description}</Text>
                {ach.unlocked && ach.unlockedAt && (
                  <Text style={[styles.achDate, { color: colors.accent }]}>
                    ✓ {new Date(ach.unlockedAt).toLocaleDateString()}
                  </Text>
                )}
              </View>
              {ach.unlocked && (
                <Feather name="check-circle" size={20} color={colors.accent} />
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* MY RIDES */}
      {activeSection === "rides" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.ridesContainer, { paddingBottom: insets.bottom + 20 }]}
        >
          {rides.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="activity" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No rides yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Tap RECORD on the map to log your first ride
              </Text>
            </View>
          ) : (
            rides.map((ride) => (
              <TouchableOpacity
                key={ride.id}
                style={[styles.rideCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/ride/${ride.id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.rideCardHeader}>
                  <View style={[styles.rideIconWrap, { backgroundColor: colors.accent + "22" }]}>
                    <Feather name="activity" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rideDate, { color: colors.foreground }]} numberOfLines={1}>
                      {ride.name || new Date(ride.startedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                    <Text style={[styles.rideTime, { color: colors.mutedForeground }]}>
                      {ride.name
                        ? new Date(ride.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : new Date(ride.startedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      {ride.segments && ride.segments.length > 0 ? ` · ${ride.segments.length} segment${ride.segments.length > 1 ? "s" : ""}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.rideDurationBadge, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.rideDurationText, { color: colors.mutedForeground }]}>
                      {formatDuration(ride.durationSecs)}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
                </View>

                <View style={[styles.rideStatsRow, { borderTopColor: colors.border }]}>
                  <View style={styles.rideStat}>
                    <Text style={[styles.rideStatValue, { color: colors.foreground }]}>
                      {ride.distanceMiles.toFixed(2)}
                    </Text>
                    <Text style={[styles.rideStatLabel, { color: colors.mutedForeground }]}>MILES</Text>
                  </View>
                  <View style={[styles.rideStatDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.rideStat}>
                    <Text style={[styles.rideStatValue, { color: colors.foreground }]}>
                      {ride.topSpeedMph.toFixed(1)}
                    </Text>
                    <Text style={[styles.rideStatLabel, { color: colors.mutedForeground }]}>TOP MPH</Text>
                  </View>
                  <View style={[styles.rideStatDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.rideStat}>
                    <Text style={[styles.rideStatValue, { color: colors.foreground }]}>
                      {ride.avgSpeedMph.toFixed(1)}
                    </Text>
                    <Text style={[styles.rideStatLabel, { color: colors.mutedForeground }]}>AVG MPH</Text>
                  </View>
                  <View style={[styles.rideStatDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.rideStat}>
                    <Text style={[styles.rideStatValue, { color: colors.foreground }]}>
                      +{ride.elevationGainFt}
                    </Text>
                    <Text style={[styles.rideStatLabel, { color: colors.mutedForeground }]}>ELEV FT</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* OFFLINE MAPS */}
      {activeSection === "maps" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.ridesContainer, { paddingBottom: insets.bottom + 20 }]}
        >
          {loadingPacks ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : offlinePacks.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="map" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No saved maps yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Open a trail on the map and tap Download to save it for offline use
              </Text>
            </View>
          ) : (
            offlinePacks.map((pack) => (
              <View key={pack.id} style={[styles.rideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.rideCardHeader}
                  activeOpacity={0.7}
                  onPress={() => viewOfflinePackOnMap(pack)}
                >
                  <View style={[styles.rideIconWrap, { backgroundColor: colors.accent + "22" }]}>
                    <Feather name="map" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rideDate, { color: colors.foreground }]} numberOfLines={1}>
                      {pack.trailTitle}
                    </Text>
                    <Text style={[styles.rideTime, { color: colors.mutedForeground }]}>
                      {pack.sizeMB > 0 ? `${pack.sizeMB.toFixed(1)} MB saved` : "Saved offline"}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>

                <View style={[styles.mapCardActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.mapActionBtn}
                    onPress={() => viewOfflinePackOnMap(pack)}
                    activeOpacity={0.7}
                  >
                    <Feather name="navigation" size={14} color={colors.accent} />
                    <Text style={[styles.mapActionText, { color: colors.accent }]}>VIEW ON MAP</Text>
                  </TouchableOpacity>
                  <View style={[styles.rideStatDivider, { backgroundColor: colors.border }]} />
                  <TouchableOpacity
                    style={styles.mapActionBtn}
                    onPress={() => deleteOfflinePack(pack)}
                    activeOpacity={0.7}
                  >
                    <Feather name="trash-2" size={14} color={colors.destructive} />
                    <Text style={[styles.mapActionText, { color: colors.destructive }]}>DELETE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* FOOTER */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.push("/privacy")} activeOpacity={0.7}>
          <Text style={[styles.footerLink, { color: colors.mutedForeground }]}>Privacy Policy</Text>
        </TouchableOpacity>
        <Text style={[styles.footerVersion, { color: colors.border }]}>TerraPulse v1.0.0</Text>
      </View>

      <TrailSearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onSelectTrail={(trail) => {
          setShowSearch(false);
          router.push({
            pathname: "/(tabs)/map",
            params: {
              focusTrailId: trail.id,
              focusLat: String(trail.coords.latitude),
              focusLng: String(trail.coords.longitude),
            },
          });
        }}
      />

      {/* LIGHTBOX */}
      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <View style={styles.lightbox}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
            <Feather name="x" size={26} color="#FFF" />
          </TouchableOpacity>
          {lightboxUri && (
            <Image source={{ uri: lightboxUri }} style={styles.lightboxImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "900" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  nameText: { fontWeight: "900", fontSize: 14, flex: 1 },
  nameEditRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 13,
    fontWeight: "700",
  },
  nameEditBtn: { padding: 4 },
  emailText: { fontSize: 11, fontWeight: "600", marginTop: 2, opacity: 0.6 },
  statsText: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 3 },
  logoutBtn: { padding: 6 },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  privacyLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  privacyLabel: { fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  privacySub: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 6,
  },
  tab: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  tabText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 12,
    padding: 12,
    borderRadius: 4,
  },
  uploadBtnText: { fontWeight: "900", fontSize: 12, letterSpacing: 1.5, color: "#000" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontWeight: "900", fontSize: 16 },
  emptySub: { fontSize: 12, textAlign: "center", paddingHorizontal: 40 },
  videoOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    margin: 1,
  },
  specsContainer: { padding: 16, gap: 16 },
  specsCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  specsCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  specsCardTitle: { fontWeight: "900", fontSize: 14, letterSpacing: 2 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    height: 46,
  },
  fieldInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  switchField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  specsDivider: { height: 1, marginVertical: 8, opacity: 0.1, backgroundColor: "#fff" },
  specsSub: { fontSize: 11, fontWeight: "500", lineHeight: 16 },
  modsInput: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    fontSize: 13,
    fontWeight: "600",
    minHeight: 100,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 4,
    marginTop: 4,
  },
  saveBtnText: { fontWeight: "900", fontSize: 13, letterSpacing: 2, color: "#000" },
  achContainer: { padding: 16, gap: 10 },
  achProgress: { marginBottom: 8, gap: 8 },
  achProgressText: { fontWeight: "900", fontSize: 16 },
  progressBar: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  achCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  achIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  achTitle: { fontWeight: "900", fontSize: 13 },
  achDesc: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  achDate: { fontSize: 10, fontWeight: "700", marginTop: 4 },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxClose: { position: "absolute", top: 50, right: 20, zIndex: 10 },
  lightboxImg: { width: "100%", height: "80%" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1 },
  footerLink: { fontSize: 11, fontWeight: "600" },
  footerVersion: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  // ── Rides ──────────────────────────────────────────────────────────────────
  ridesContainer: { padding: 14, gap: 12 },
  rideCard: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  rideCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  rideIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rideDate: { fontWeight: "900", fontSize: 13 },
  rideTime: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  rideDurationBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  rideDurationText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  rideStatsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  rideStat: { flex: 1, alignItems: "center" },
  rideStatValue: { fontSize: 17, fontWeight: "900" },
  rideStatLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1, marginTop: 3 },
  rideStatDivider: { width: 1 },
  mapCardActions: { flexDirection: "row", borderTopWidth: 1 },
  mapActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  mapActionText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
});
