"use no memo";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
  Modal,
  Image,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import TerraPulseLogo from "@/components/TerraPulseLogo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  getDocs,
} from "firebase/firestore";
import { OfflineManager } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// ── Types ─────────────────────────────────────────────────────────────────────

type VehicleType = "truck" | "sxs" | "dirtbike" | "quad" | "other";

interface Vehicle {
  id: string;
  type: VehicleType;
  make: string;
  model: string;
  year: string;
  nickname: string;
  isFavorite: boolean;
  createdAt?: number;
}

interface OfflineMapPack {
  id: string;
  trailId?: string;
  trailTitle: string;
  lat?: number;
  lng?: number;
  sizeMB: number;
}

interface CrewMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  wingmanEnabled: boolean;
  location?: { lat: number; lng: number; updatedAt: number; active: boolean };
}

type GarageSection = "rides" | "maps" | "crew";

const VEHICLE_TYPES: { type: VehicleType; label: string; icon: string }[] = [
  { type: "truck",    label: "Truck / 4x4",  icon: "truck" },
  { type: "sxs",     label: "SXS / UTV",    icon: "car-side" },
  { type: "dirtbike",label: "Dirt Bike",     icon: "motorbike" },
  { type: "quad",    label: "Quad / ATV",    icon: "all-terrain-vehicle" },
  { type: "other",   label: "Other",         icon: "car" },
];

function vehicleIcon(type: VehicleType) {
  return (VEHICLE_TYPES.find((v) => v.type === type)?.icon ?? "car") as never;
}

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Add Vehicle Modal ─────────────────────────────────────────────────────────

function AddVehicleModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (v: Omit<Vehicle, "id" | "isFavorite" | "createdAt">) => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<VehicleType>("truck");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType("truck"); setMake(""); setModel(""); setYear(""); setNickname("");
  };

  const handleSave = async () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert("Missing Info", "Please enter at least a make and model.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ type, make: make.trim(), model: model.trim(), year: year.trim(), nickname: nickname.trim() });
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { reset(); onClose(); }}>
      <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => {}}>
        <View style={[styles.modal, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>ADD VEHICLE</Text>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>VEHICLE TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {VEHICLE_TYPES.map((v) => (
                <TouchableOpacity
                  key={v.type}
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: type === v.type ? colors.accent : colors.secondary,
                      borderColor: type === v.type ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setType(v.type)}
                >
                  <MaterialCommunityIcons
                    name={v.icon as never}
                    size={16}
                    color={type === v.type ? "#fff" : colors.mutedForeground}
                  />
                  <Text style={{ color: type === v.type ? "#fff" : colors.mutedForeground, fontWeight: "700", fontSize: 11 }}>
                    {v.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {(
            [
              { label: "YEAR", value: year, onChange: setYear, placeholder: "e.g. 2022", numeric: true },
              { label: "MAKE", value: make, onChange: setMake, placeholder: "e.g. Toyota", numeric: false },
              { label: "MODEL", value: model, onChange: setModel, placeholder: "e.g. Tacoma TRD Pro", numeric: false },
              { label: "NICKNAME (OPTIONAL)", value: nickname, onChange: setNickname, placeholder: 'e.g. "The Beast"', numeric: false },
            ] as { label: string; value: string; onChange: (t: string) => void; placeholder: string; numeric: boolean }[]
          ).map(({ label, value, onChange, placeholder, numeric }) => (
            <View key={label} style={{ marginBottom: 12 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 4 }]}>{label}</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={colors.mutedForeground}
                keyboardType={numeric ? "numeric" : "default"}
              />
            </View>
          ))}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            <TouchableOpacity
              style={[styles.btn, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 }]}
              onPress={() => { reset(); onClose(); }}
              disabled={saving}
            >
              <Text style={[styles.btnText, { color: colors.mutedForeground }]}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { flex: 1, backgroundColor: colors.accent }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={[styles.btnText, { color: "#fff" }]}>ADD VEHICLE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function GarageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [section, setSection] = useState<GarageSection>("rides");

  // ── Vehicles ──────────────────────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "vehicles"), orderBy("createdAt", "desc")),
      (snap) => setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle))),
      () => setVehicles([])
    );
    return unsub;
  }, [user]);

  const addVehicle = useCallback(async (v: Omit<Vehicle, "id" | "isFavorite" | "createdAt">) => {
    if (!user) return;
    const isFirst = vehicles.length === 0;
    await addDoc(collection(db, "users", user.uid, "vehicles"), {
      ...v,
      isFavorite: isFirst,
      createdAt: serverTimestamp(),
    });
    if (isFirst) {
      await setDoc(doc(db, "users", user.uid), {
        vehicleSpecs: { make: v.make, model: v.model, year: v.year },
      }, { merge: true });
    }
    setShowAddVehicle(false);
  }, [user, vehicles]);

  const setFavorite = useCallback(async (vehicle: Vehicle) => {
    if (!user) return;
    try {
      const prev = vehicles.find((v) => v.isFavorite && v.id !== vehicle.id);
      if (prev) await updateDoc(doc(db, "users", user.uid, "vehicles", prev.id), { isFavorite: false });
      await updateDoc(doc(db, "users", user.uid, "vehicles", vehicle.id), { isFavorite: true });
      await setDoc(doc(db, "users", user.uid), {
        vehicleSpecs: { make: vehicle.make, model: vehicle.model, year: vehicle.year },
      }, { merge: true });
    } catch {
      Alert.alert("Error", "Could not update favorite.");
    }
  }, [user, vehicles]);

  const deleteVehicle = useCallback((vehicle: Vehicle) => {
    Alert.alert(
      "Remove Vehicle?",
      `Remove "${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")} " from your garage?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "users", user!.uid, "vehicles", vehicle.id));
            } catch {
              Alert.alert("Error", "Could not remove vehicle.");
            }
          },
        },
      ]
    );
  }, [user]);

  // ── Offline Maps ──────────────────────────────────────────────────────────
  const [offlinePacks, setOfflinePacks] = useState<OfflineMapPack[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);

  const loadOfflinePacks = useCallback(async () => {
    setLoadingPacks(true);
    try {
      const packs = await OfflineManager.getPacks();
      const items: OfflineMapPack[] = await Promise.all(
        packs.map(async (p) => {
          const meta = (p.metadata ?? {}) as Record<string, unknown>;
          let sizeMB = 0;
          try { const s = await p.status(); sizeMB = s.completedResourceSize / (1024 * 1024); } catch {}
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
    if (section === "maps") loadOfflinePacks();
  }, [section, loadOfflinePacks]);

  const viewPackOnMap = useCallback((pack: OfflineMapPack) => {
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
  }, []);

  const deletePack = useCallback((pack: OfflineMapPack) => {
    Alert.alert("Remove offline map?", `Delete saved tiles for "${pack.trailTitle}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await OfflineManager.deletePack(pack.id);
            setOfflinePacks((prev) => prev.filter((p) => p.id !== pack.id));
          } catch {
            Alert.alert("Error", "Could not delete offline map.");
          }
        },
      },
    ]);
  }, []);

  // ── My Crew ───────────────────────────────────────────────────────────────
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [wingmanActive, setWingmanActive] = useState(false);
  const [wingmanLoading, setWingmanLoading] = useState(false);
  const wingmanWatchRef = useRef<Location.LocationSubscription | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      collection(db, "users", user.uid, "crew"),
      (snap) => setCrew(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as CrewMember))),
      () => setCrew([])
    );
    return unsub;
  }, [user]);

  // Subscribe to wingman locations for crew members that have it enabled
  useEffect(() => {
    if (!user || crew.length === 0) return;
    const tracked = crew.filter((m) => m.wingmanEnabled);
    if (tracked.length === 0) return;
    const unsubs = tracked.map((m) =>
      onSnapshot(doc(db, "users", m.uid), (snap) => {
        const data = snap.data();
        const loc = data?.wingmanLocation as CrewMember["location"] | undefined;
        setCrew((prev) => prev.map((c) => (c.uid === m.uid ? { ...c, location: loc } : c)));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, crew.filter((c) => c.wingmanEnabled).map((c) => c.uid).join(",")]);

  const toggleWingman = useCallback(async (active: boolean) => {
    if (!user) return;
    setWingmanLoading(true);
    try {
      if (active) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Location needed", "Enable location access to use Wingman Mode.");
          return;
        }
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 30000 },
          async (loc) => {
            setMyLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            await setDoc(doc(db, "users", user.uid), {
              wingmanLocation: {
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                updatedAt: Date.now(),
                active: true,
              },
            }, { merge: true }).catch(() => {});
          }
        );
        wingmanWatchRef.current = sub;
        setWingmanActive(true);
      } else {
        wingmanWatchRef.current?.remove();
        wingmanWatchRef.current = null;
        await setDoc(doc(db, "users", user.uid), {
          wingmanLocation: { active: false, updatedAt: Date.now() },
        }, { merge: true }).catch(() => {});
        setWingmanActive(false);
        setMyLocation(null);
      }
    } catch {
      Alert.alert("Error", "Could not toggle Wingman Mode.");
    } finally {
      setWingmanLoading(false);
    }
  }, [user]);

  useEffect(() => {
    return () => {
      wingmanWatchRef.current?.remove();
      wingmanWatchRef.current = null;
    };
  }, []);

  const toggleCrewWingman = useCallback(async (member: CrewMember, enabled: boolean) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "crew", member.uid), { wingmanEnabled: enabled });
    } catch {
      Alert.alert("Error", "Could not update Wingman setting.");
    }
  }, [user]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TerraPulseLogo color={colors.primary} size="md" />
        <Text style={[styles.headerTitle, { color: colors.accent }]}>MY GARAGE</Text>
      </View>

      {/* SECTION TABS */}
      <View style={[styles.sectionTabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["rides", "maps", "crew"] as GarageSection[]).map((s) => {
          const active = section === s;
          const cfg = {
            rides: { icon: "truck" as const, label: "MY RIDES" },
            maps:  { icon: "map" as const,   label: "OFFLINE MAPS" },
            crew:  { icon: "users" as const,  label: "MY CREW" },
          };
          return (
            <TouchableOpacity
              key={s}
              style={[styles.sectionTab, active && { borderBottomWidth: 2, borderBottomColor: colors.accent }]}
              onPress={() => setSection(s)}
            >
              <Feather name={cfg[s].icon} size={16} color={active ? colors.accent : colors.mutedForeground} />
              <Text style={[styles.sectionTabText, { color: active ? colors.accent : colors.mutedForeground }]}>
                {cfg[s].label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── MY RIDES ────────────────────────────────────────────────────── */}
      {section === "rides" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 90, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowAddVehicle(true)}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.addBtnText}>ADD VEHICLE</Text>
          </TouchableOpacity>

          {vehicles.length === 0 ? (
            <View style={styles.emptyCenter}>
              <MaterialCommunityIcons name="truck-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No vehicles yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Add your truck, SXS, dirt bike, or quad. Star a vehicle to show it to other riders.
              </Text>
            </View>
          ) : (
            vehicles.map((v) => (
              <View
                key={v.id}
                style={[styles.vehicleCard, { backgroundColor: colors.card, borderColor: v.isFavorite ? colors.accent : colors.border }]}
              >
                <View style={[styles.vehicleIconWrap, { backgroundColor: v.isFavorite ? colors.accent : colors.secondary }]}>
                  <MaterialCommunityIcons
                    name={vehicleIcon(v.type)}
                    size={22}
                    color={v.isFavorite ? "#fff" : colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={[styles.vehicleName, { color: colors.foreground }]} numberOfLines={1}>
                      {v.nickname || [v.year, v.make, v.model].filter(Boolean).join(" ")}
                    </Text>
                    {v.isFavorite && (
                      <View style={[styles.favBadge, { backgroundColor: colors.accent }]}>
                        <Text style={styles.favBadgeText}>FAVORITE RIG</Text>
                      </View>
                    )}
                  </View>
                  {v.nickname ? (
                    <Text style={[styles.vehicleSub, { color: colors.mutedForeground }]}>
                      {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                    </Text>
                  ) : null}
                  <Text style={[styles.vehicleType, { color: colors.mutedForeground }]}>
                    {VEHICLE_TYPES.find((t) => t.type === v.type)?.label ?? v.type}
                  </Text>
                </View>
                <View style={{ flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => !v.isFavorite && setFavorite(v)}
                    style={{ opacity: v.isFavorite ? 0.35 : 1 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="star" size={20} color={v.isFavorite ? colors.accent : colors.mutedForeground} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteVehicle(v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── OFFLINE MAPS ─────────────────────────────────────────────────── */}
      {section === "maps" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 90, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {loadingPacks ? (
            <View style={styles.emptyCenter}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : offlinePacks.length === 0 ? (
            <View style={styles.emptyCenter}>
              <Feather name="map" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No saved maps yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Open a trail on the map and tap Download to save it for offline use
              </Text>
            </View>
          ) : (
            offlinePacks.map((pack) => (
              <View key={pack.id} style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity style={styles.mapCardHeader} onPress={() => viewPackOnMap(pack)} activeOpacity={0.7}>
                  <View style={[styles.vehicleIconWrap, { backgroundColor: colors.accent + "22" }]}>
                    <Feather name="map" size={18} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.vehicleName, { color: colors.foreground }]} numberOfLines={1}>
                      {pack.trailTitle}
                    </Text>
                    <Text style={[styles.vehicleSub, { color: colors.mutedForeground }]}>
                      {pack.sizeMB > 0 ? `${pack.sizeMB.toFixed(1)} MB saved` : "Saved offline"}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
                <View style={[styles.mapActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={styles.mapAction} onPress={() => viewPackOnMap(pack)} activeOpacity={0.7}>
                    <Feather name="navigation" size={14} color={colors.accent} />
                    <Text style={[styles.mapActionText, { color: colors.accent }]}>VIEW ON MAP</Text>
                  </TouchableOpacity>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <TouchableOpacity style={styles.mapAction} onPress={() => deletePack(pack)} activeOpacity={0.7}>
                    <Feather name="trash-2" size={14} color={colors.destructive} />
                    <Text style={[styles.mapActionText, { color: colors.destructive }]}>DELETE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── MY CREW ──────────────────────────────────────────────────────── */}
      {section === "crew" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Wingman Mode banner */}
          <View style={[styles.wingmanBanner, { backgroundColor: wingmanActive ? colors.accent + "18" : colors.secondary, borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="radio" size={14} color={wingmanActive ? colors.accent : colors.mutedForeground} />
                <Text style={[styles.wingmanTitle, { color: colors.foreground }]}>WINGMAN MODE</Text>
                {wingmanActive && (
                  <View style={[styles.liveChip, { backgroundColor: colors.accent }]}>
                    <Text style={styles.liveChipText}>LIVE</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.wingmanSub, { color: colors.mutedForeground }]}>
                {wingmanActive
                  ? "Your location is live — crew can see you riding"
                  : "Share your live location with crew while riding"}
              </Text>
            </View>
            {wingmanLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Switch
                value={wingmanActive}
                onValueChange={toggleWingman}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            )}
          </View>

          {crew.length === 0 ? (
            <View style={[styles.emptyCenter, { marginTop: 40 }]}>
              <Feather name="users" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No crew yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Send friend requests in the Riders tab to build your crew
              </Text>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.accent, marginTop: 16, paddingHorizontal: 24 }]}
                onPress={() => router.push("/(tabs)/community")}
              >
                <Feather name="users" size={16} color="#fff" />
                <Text style={styles.addBtnText}>FIND RIDERS</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ padding: 14, gap: 10 }}>
              <Text style={[styles.crewCount, { color: colors.mutedForeground }]}>
                {crew.length} CREW MEMBER{crew.length !== 1 ? "S" : ""}
              </Text>
              {crew.map((member) => {
                const lastSeen = member.location?.updatedAt
                  ? Math.round((Date.now() - member.location.updatedAt) / 60000)
                  : null;
                const dist = myLocation && member.location?.active && member.location.lat != null
                  ? distanceMiles(myLocation.lat, myLocation.lng, member.location.lat, member.location.lng)
                  : null;
                return (
                  <View key={member.uid} style={[styles.crewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                      {member.photoURL ? (
                        <Image source={{ uri: member.photoURL }} style={styles.crewAvatar} />
                      ) : (
                        <View style={[styles.crewAvatar, { backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }]}>
                          <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 16 }}>
                            {(member.displayName || "?")[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.crewName, { color: colors.foreground }]} numberOfLines={1}>
                          {member.displayName}
                        </Text>
                        {member.wingmanEnabled && member.location?.active && lastSeen !== null ? (
                          <Text style={[styles.crewSub, { color: colors.success }]}>
                            🟢 {lastSeen === 0 ? "Just now" : `${lastSeen}m ago`}
                            {dist != null ? `  ·  ${dist < 1 ? `${Math.round(dist * 5280)} ft` : `${dist.toFixed(1)} mi`} away` : ""}
                          </Text>
                        ) : member.wingmanEnabled ? (
                          <Text style={[styles.crewSub, { color: colors.mutedForeground }]}>Location inactive</Text>
                        ) : (
                          <Text style={[styles.crewSub, { color: colors.mutedForeground }]}>Wingman off</Text>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: "center", gap: 4 }}>
                      <Text style={[styles.wingmanLabel, { color: colors.mutedForeground }]}>WINGMAN</Text>
                      <Switch
                        value={member.wingmanEnabled}
                        onValueChange={(v) => toggleCrewWingman(member, v)}
                        trackColor={{ false: colors.border, true: colors.accent }}
                        thumbColor="#fff"
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <AddVehicleModal
        visible={showAddVehicle}
        onClose={() => setShowAddVehicle(false)}
        onSave={addVehicle}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  sectionTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  sectionTab: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
  },
  sectionTabText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  emptyCenter: {
    marginTop: 60,
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: { fontWeight: "900", fontSize: 16 },
  emptySub: { fontSize: 12, textAlign: "center", lineHeight: 18 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 6,
  },
  addBtnText: { fontWeight: "900", fontSize: 13, letterSpacing: 1.5, color: "#fff" },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleName: { fontWeight: "900", fontSize: 13 },
  vehicleSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  vehicleType: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  favBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  favBadgeText: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  mapCard: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  mapCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  mapActions: { flexDirection: "row", borderTopWidth: 1 },
  mapAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  mapActionText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  wingmanBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  wingmanTitle: { fontWeight: "900", fontSize: 13, letterSpacing: 1 },
  wingmanSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  liveChip: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveChipText: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  crewCount: { fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 2 },
  crewCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  crewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  crewName: { fontWeight: "900", fontSize: 13 },
  crewSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  wingmanLabel: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#444",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 2,
    marginBottom: 16,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fieldLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 13,
    fontWeight: "600",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 6,
    gap: 6,
  },
  btnText: { fontWeight: "900", fontSize: 13, letterSpacing: 1 },
});
