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
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
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

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const SECTIONS = ["gallery", "achievements", "rides", "settings", "notifications"] as const;

interface AppNotification {
  id: string;
  type: "friend_request" | "friend_accepted" | "system";
  title: string;
  body: string;
  read: boolean;
  status?: string;
  fromUid?: string;
  fromName?: string;
  fromPhoto?: string;
  requestId?: string;
  createdAt?: number;
}
type Section = typeof SECTIONS[number];

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();

  const [activeSection, setActiveSection] = useState<Section>("gallery");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [rides, setRides] = useState<RideRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
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

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "notifications"), orderBy("createdAt", "desc"), limit(50)),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification))),
      () => {}
    );
    return unsub;
  }, [user]);

  const markNotifRead = useCallback(async (notifId: string) => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid, "notifications", notifId), { read: true }).catch(() => {});
  }, [user]);

  const acceptFriendRequest = useCallback(async (notif: AppNotification) => {
    if (!user || !notif.fromUid || !notif.requestId) return;
    try {
      await updateDoc(doc(db, "friendRequests", notif.requestId), { status: "accepted" }).catch(() => {});
      await setDoc(doc(db, "users", user.uid, "crew", notif.fromUid), {
        displayName: notif.fromName ?? "Rider",
        photoURL: notif.fromPhoto ?? null,
        wingmanEnabled: false,
        addedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "users", notif.fromUid, "crew", user.uid), {
        displayName: displayName || user.email?.split("@")[0] || "Rider",
        photoURL: avatarUrl ?? null,
        wingmanEnabled: false,
        addedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "users", notif.fromUid, "notifications"), {
        type: "friend_accepted",
        title: "Friend Request Accepted",
        body: `${displayName || "A rider"} accepted your friend request.`,
        fromUid: user.uid,
        fromName: displayName || user.email?.split("@")[0] || "Rider",
        fromPhoto: avatarUrl ?? null,
        read: false,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "users", user.uid, "notifications", notif.id), { read: true, status: "accepted" }).catch(() => {});
    } catch {
      Alert.alert("Error", "Could not accept friend request. Try again.");
    }
  }, [user, displayName, avatarUrl]);

  const declineFriendRequest = useCallback(async (notif: AppNotification) => {
    if (!user || !notif.requestId) return;
    try {
      await updateDoc(doc(db, "friendRequests", notif.requestId), { status: "rejected" }).catch(() => {});
      await updateDoc(doc(db, "users", user.uid, "notifications", notif.id), { read: true, status: "declined" }).catch(() => {});
    } catch {
      Alert.alert("Error", "Could not decline request. Try again.");
    }
  }, [user]);

  const deactivateAccount = useCallback(async () => {
    Alert.alert(
      "Deactivate Account?",
      "Your profile will be hidden from other riders. You can reactivate by logging back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            try {
              await setDoc(doc(db, "users", user!.uid), { deactivated: true, isPublic: false }, { merge: true });
              logout();
            } catch {
              Alert.alert("Error", "Could not deactivate account. Try again.");
            }
          },
        },
      ]
    );
  }, [user, logout]);

  const requestAccountDeletion = useCallback(() => {
    Alert.alert(
      "Delete Account",
      "This sends a deletion request to the TerraPulse team. Your account will be permanently removed within 5 business days.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send Request",
          style: "destructive",
          onPress: () => {
            const subject = encodeURIComponent("Account Deletion Request");
            const body = encodeURIComponent(
              `Please delete my TerraPulse account.\n\nUser ID: ${user?.uid ?? ""}\nEmail: ${user?.email ?? ""}`
            );
            Linking.openURL(`mailto:mclaporte@terrapulse.fun?subject=${subject}&body=${body}`).catch(() => {
              Alert.alert(
                "Email not available",
                "Please email mclaporte@terrapulse.fun to request account deletion."
              );
            });
          },
        },
      ]
    );
  }, [user]);

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
              name={s === "gallery" ? "image" : s === "rides" ? "activity" : s === "settings" ? "settings" : s === "notifications" ? "bell" : "award"}
              size={16}
              color={activeSection === s ? colors.accent : colors.mutedForeground}
            />
            <Text
              numberOfLines={1}
              style={[styles.tabText, { color: activeSection === s ? colors.accent : colors.mutedForeground }]}
            >
              {s === "achievements" ? "BADGES" : s === "notifications" ? "ALERTS" : s.toUpperCase()}
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

      {/* SETTINGS */}
      {activeSection === "settings" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
          <View style={{ padding: 16, gap: 14 }}>
            <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.settingsCardTitle, { color: colors.mutedForeground }]}>ACCOUNT</Text>
              <TouchableOpacity style={styles.settingsRow} onPress={deactivateAccount} activeOpacity={0.7}>
                <View style={[styles.settingsIconWrap, { backgroundColor: colors.secondary }]}>
                  <Feather name="pause-circle" size={18} color={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Deactivate Account</Text>
                  <Text style={[styles.settingsSub, { color: colors.mutedForeground }]}>
                    Temporarily hide your profile — reactivate by logging back in
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={[styles.settingsDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={styles.settingsRow} onPress={requestAccountDeletion} activeOpacity={0.7}>
                <View style={[styles.settingsIconWrap, { backgroundColor: colors.destructive + "22" }]}>
                  <Feather name="trash-2" size={18} color={colors.destructive} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsLabel, { color: colors.destructive }]}>Delete Account</Text>
                  <Text style={[styles.settingsSub, { color: colors.mutedForeground }]}>
                    Permanent within 5 business days — sends a request to our team
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.settingsCardTitle, { color: colors.mutedForeground }]}>LEGAL</Text>
              <TouchableOpacity style={styles.settingsRow} onPress={() => router.push("/privacy")} activeOpacity={0.7}>
                <View style={[styles.settingsIconWrap, { backgroundColor: colors.secondary }]}>
                  <Feather name="shield" size={18} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Privacy Policy</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={[styles.settingsDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={styles.settingsRow}
                activeOpacity={0.7}
                onPress={() =>
                  Alert.alert(
                    "Terms & Conditions",
                    "By using TerraPulse you agree to ride responsibly, respect public and private land, and follow all applicable local laws and regulations.\n\nTerraPulse is not responsible for trail conditions, navigation errors, or personal injury. Always carry appropriate safety gear and tell someone your plans before heading out.\n\nFor full terms visit: terrapulse.fun/terms"
                  )
                }
              >
                <View style={[styles.settingsIconWrap, { backgroundColor: colors.secondary }]}>
                  <Feather name="file-text" size={18} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Terms & Conditions</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.settingsVersion, { color: colors.border }]}>TerraPulse v1.0.0</Text>
          </View>
        </ScrollView>
      )}

      {/* NOTIFICATIONS / ALERTS */}
      {activeSection === "notifications" && (() => {
        const unreadCount = notifications.filter((n) => !n.read).length;
        return (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 20, gap: 10 }}
          >
            {unreadCount > 0 && (
              <Text style={[styles.notifHeader, { color: colors.mutedForeground }]}>
                {unreadCount} UNREAD
              </Text>
            )}
            {notifications.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="bell" size={40} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No notifications</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  Friend requests and crew updates will appear here
                </Text>
              </View>
            ) : (
              notifications.map((notif) => {
                const isPendingRequest =
                  notif.type === "friend_request" && notif.status !== "accepted" && notif.status !== "declined";
                return (
                  <View
                    key={notif.id}
                    style={[
                      styles.notifCard,
                      {
                        backgroundColor: notif.read ? colors.card : colors.secondary,
                        borderColor: notif.read ? colors.border : colors.accent,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.notifIconWrap,
                        {
                          backgroundColor:
                            notif.type === "friend_request"
                              ? colors.accent + "22"
                              : notif.type === "friend_accepted"
                              ? colors.success + "22"
                              : colors.secondary,
                        },
                      ]}
                    >
                      <Feather
                        name={
                          notif.type === "friend_request"
                            ? "user-plus"
                            : notif.type === "friend_accepted"
                            ? "users"
                            : "bell"
                        }
                        size={18}
                        color={notif.type === "friend_accepted" ? colors.success : colors.accent}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.notifTitle, { color: colors.foreground }]}>{notif.title}</Text>
                      <Text style={[styles.notifBody, { color: colors.mutedForeground }]}>{notif.body}</Text>
                      {isPendingRequest && (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                          <TouchableOpacity
                            style={[styles.notifBtn, { backgroundColor: colors.accent }]}
                            onPress={() => acceptFriendRequest(notif)}
                          >
                            <Text style={[styles.notifBtnText, { color: "#fff" }]}>ACCEPT</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.notifBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 }]}
                            onPress={() => declineFriendRequest(notif)}
                          >
                            <Text style={[styles.notifBtnText, { color: colors.mutedForeground }]}>DECLINE</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {notif.status === "accepted" && notif.type === "friend_request" && (
                        <Text style={[styles.notifStatus, { color: colors.success }]}>✓ Accepted — they're in your crew</Text>
                      )}
                      {notif.status === "declined" && notif.type === "friend_request" && (
                        <Text style={[styles.notifStatus, { color: colors.mutedForeground }]}>Declined</Text>
                      )}
                    </View>
                    {!notif.read && !isPendingRequest && (
                      <TouchableOpacity
                        onPress={() => markNotifRead(notif.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        );
      })()}

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
  // ── Settings ────────────────────────────────────────────────────────────────
  settingsCard: { borderRadius: 10, borderWidth: 1, overflow: "hidden", marginBottom: 4 },
  settingsCardTitle: { fontWeight: "900", fontSize: 10, letterSpacing: 2, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  settingsRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  settingsIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  settingsLabel: { fontWeight: "700", fontSize: 14, flex: 1 },
  settingsSub: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  settingsDivider: { height: 1, marginHorizontal: 14 },
  settingsVersion: { fontSize: 10, fontWeight: "700", letterSpacing: 1, textAlign: "center", marginTop: 8 },
  // ── Notifications ───────────────────────────────────────────────────────────
  notifHeader: { fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 2 },
  notifCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 10, borderWidth: 1 },
  notifIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notifTitle: { fontWeight: "900", fontSize: 13 },
  notifBody: { fontSize: 11, fontWeight: "600", marginTop: 2, lineHeight: 16 },
  notifBtn: { borderRadius: 6, paddingHorizontal: 16, paddingVertical: 8 },
  notifBtnText: { fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
  notifStatus: { fontSize: 11, fontWeight: "700", marginTop: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});
