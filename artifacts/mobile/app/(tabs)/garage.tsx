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
  Linking,
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
import { router, useFocusEffect } from "expo-router";
import { db } from "@/lib/firebase";
import type { AssistantItinerary } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useActivityMode, type ActivityMode } from "@/context/ActivityModeContext";
import { useColors } from "@/hooks/useColors";
import { apiServerUrl } from "@/lib/api-client";
import { cacheGet, cacheSet } from "@/lib/offline-cache";
import { useOnline } from "@/lib/use-online";
import { alertOffline, withSaveTimeout } from "@/lib/save-guard";
import {
  fetchRegionCatalog,
  deleteRegion,
  listDownloadedRegions,
  regionDownloadBytes,
  pruneStaleRegionDirs,
  type CatalogRegion,
} from "@/lib/regions";
import {
  CAMPGROUND_KIND_COLORS,
  CAMPGROUND_KIND_LABELS,
  campgroundSourceLabel,
  campgroundAmenityChips,
  type Campground,
} from "@/lib/campgrounds";
import {
  HIKING_POI_COLORS,
  HIKING_POI_LABELS,
  HIKING_POI_ICONS,
  hikingPoiSourceLabel,
  hikingPoiChips,
  type HikingPoi,
} from "@/lib/hiking-pois";

// ── Types ─────────────────────────────────────────────────────────────────────

type VehicleType = "truck" | "sxs" | "dirtbike" | "quad" | "other";

type Drivetrain = "2x4" | "4x4";

interface Vehicle {
  id: string;
  type: VehicleType;
  make: string;
  model: string;
  year: string;
  nickname: string;
  isFavorite: boolean;
  tireSize?: string;
  suspension?: string;
  mods?: string;
  liftIn?: number;
  tireDiameterIn?: number;
  hasLockers?: boolean;
  hasLowRange?: boolean;
  drivetrain?: Drivetrain;
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

type GarageSection = "rides" | "maps" | "crew" | "mods" | "campsites" | "spots" | "itineraries";

// A campground saved from the map's detail sheet, stored at
// users/{uid}/campsites/{docId}. `docId` is the sanitized Firestore doc id
// (camp ids like "osm:way/123" have "/" replaced) — needed for deletes.
type SavedCampsite = Campground & { docId: string; savedAt?: { seconds: number } | null };

// A hiking POI saved from the map's detail sheet, stored at
// users/{uid}/hiking_spots/{docId} (same sanitized-doc-id scheme as campsites).
type SavedHikeSpot = HikingPoi & { docId: string; savedAt?: { seconds: number } | null };

// A trip itinerary saved from the AI assistant's itinerary card, stored at
// users/{uid}/itineraries/msg_{messageId}.
type SavedItinerary = AssistantItinerary & {
  docId: string;
  mode?: ActivityMode;
  savedAt?: { seconds: number } | null;
};

// A trip itinerary shared by a crew member, stored at
// users/{uid}/shared_trips/{docId}. Carries who sent it; the recipient can
// copy it into their own MY TRIPS or remove it.
type SharedTrip = SavedItinerary & {
  fromUid: string;
  fromName: string;
  sharedAt?: { seconds: number } | null;
};

const HUB_TITLE: Record<ActivityMode, string> = {
  offroad: "MY GARAGE",
  camping: "MY TENT",
  hiking: "MY RUCKSACK",
};

const HUB_SECTIONS: Record<ActivityMode, GarageSection[]> = {
  offroad: ["rides", "itineraries", "maps", "crew", "mods"],
  camping: ["campsites", "itineraries", "maps", "crew", "mods"],
  hiking: ["spots", "itineraries", "maps", "crew", "mods"],
};

interface ModResult {
  title: string;
  url: string;
  source: string;
  description: string;
}

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
  const [tireSize, setTireSize] = useState("");
  const [suspension, setSuspension] = useState("");
  const [liftIn, setLiftIn] = useState("");
  const [tireDiameterIn, setTireDiameterIn] = useState("");
  const [hasLockers, setHasLockers] = useState(false);
  const [hasLowRange, setHasLowRange] = useState(false);
  // null = not specified — deliberately NOT defaulted, so the AI assistant
  // never assumes 4WD the user didn't actually claim.
  const [drivetrain, setDrivetrain] = useState<Drivetrain | null>(null);
  const [mods, setMods] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType("truck"); setMake(""); setModel(""); setYear(""); setNickname("");
    setTireSize(""); setSuspension(""); setLiftIn(""); setTireDiameterIn("");
    setHasLockers(false); setHasLowRange(false); setDrivetrain(null); setMods("");
  };

  const handleSave = async () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert("Missing Info", "Please enter at least a make and model.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        type,
        make: make.trim(),
        model: model.trim(),
        year: year.trim(),
        nickname: nickname.trim(),
        tireSize: tireSize.trim(),
        suspension: suspension.trim(),
        mods: mods.trim(),
        liftIn: parseFloat(liftIn) || 0,
        tireDiameterIn: parseFloat(tireDiameterIn) || 0,
        hasLockers,
        hasLowRange,
        // Firestore rejects undefined values — only include when chosen
        ...(drivetrain ? { drivetrain } : {}),
      });
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { reset(); onClose(); }}>
      <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => {}}>
        <View style={[styles.modal, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, maxHeight: "90%" }]}>
          <View style={styles.handle} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>ADD VEHICLE</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

            <Text style={[styles.sectionDividerLabel, { color: colors.mutedForeground, borderTopColor: colors.border }]}>
              SPECS — USED BY AI ASSISTANT
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>DRIVETRAIN</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {(["4x4", "2x4"] as Drivetrain[]).map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.typePill,
                    {
                      flex: 1,
                      justifyContent: "center",
                      backgroundColor: drivetrain === d ? colors.accent : colors.secondary,
                      borderColor: drivetrain === d ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setDrivetrain(d)}
                >
                  <Text style={{ color: drivetrain === d ? "#fff" : colors.mutedForeground, fontWeight: "700", fontSize: 11 }}>
                    {d === "4x4" ? "4X4 — FOUR-WHEEL DRIVE" : "2X4 — TWO-WHEEL DRIVE"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {(
              [
                { label: "TIRE SIZE", value: tireSize, onChange: setTireSize, placeholder: "e.g. 35x12.5R17", numeric: false },
                { label: "SUSPENSION", value: suspension, onChange: setSuspension, placeholder: "e.g. Icon Stage 8, 3in lift", numeric: false },
                { label: "LIFT (INCHES)", value: liftIn, onChange: setLiftIn, placeholder: "e.g. 2.5", numeric: true },
                { label: "TIRE DIAMETER (INCHES)", value: tireDiameterIn, onChange: setTireDiameterIn, placeholder: "e.g. 35", numeric: true },
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

            <View style={[styles.switchRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>HAS LOCKERS</Text>
                <Text style={[styles.switchSub, { color: colors.mutedForeground }]}>Front or rear locking differentials</Text>
              </View>
              <Switch
                value={hasLockers}
                onValueChange={setHasLockers}
                thumbColor={hasLockers ? colors.success : colors.mutedForeground}
                trackColor={{ false: colors.border, true: "#004D26" }}
              />
            </View>

            <View style={[styles.switchRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>HAS LOW RANGE</Text>
                <Text style={[styles.switchSub, { color: colors.mutedForeground }]}>2-speed transfer case (4LO)</Text>
              </View>
              <Switch
                value={hasLowRange}
                onValueChange={setHasLowRange}
                thumbColor={hasLowRange ? colors.success : colors.mutedForeground}
                trackColor={{ false: colors.border, true: "#004D26" }}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 4 }]}>MODS & BUILD NOTES</Text>
              <TextInput
                style={[styles.modsInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                value={mods}
                onChangeText={setMods}
                placeholder="e.g. ARB bumper, snorkel, roof rack, onboard air..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
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
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Edit Vehicle Modal ────────────────────────────────────────────────────────

function EditVehicleModal({
  visible,
  vehicle,
  onClose,
  onSave,
}: {
  visible: boolean;
  vehicle: Vehicle | null;
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
  const [tireSize, setTireSize] = useState("");
  const [suspension, setSuspension] = useState("");
  const [liftIn, setLiftIn] = useState("");
  const [tireDiameterIn, setTireDiameterIn] = useState("");
  const [hasLockers, setHasLockers] = useState(false);
  const [hasLowRange, setHasLowRange] = useState(false);
  // null = not specified — legacy vehicles saved before this field existed
  // stay "unknown" unless the user actively picks, so editing another spec
  // never silently claims 4WD.
  const [drivetrain, setDrivetrain] = useState<Drivetrain | null>(null);
  const [mods, setMods] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vehicle) {
      setType(vehicle.type);
      setMake(vehicle.make);
      setModel(vehicle.model);
      setYear(vehicle.year);
      setNickname(vehicle.nickname ?? "");
      setTireSize(vehicle.tireSize ?? "");
      setSuspension(vehicle.suspension ?? "");
      setLiftIn(vehicle.liftIn ? String(vehicle.liftIn) : "");
      setTireDiameterIn(vehicle.tireDiameterIn ? String(vehicle.tireDiameterIn) : "");
      setHasLockers(vehicle.hasLockers ?? false);
      setHasLowRange(vehicle.hasLowRange ?? false);
      setDrivetrain(vehicle.drivetrain ?? null);
      setMods(vehicle.mods ?? "");
    }
  }, [vehicle]);

  const handleSave = async () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert("Missing Info", "Please enter at least a make and model.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        type,
        make: make.trim(),
        model: model.trim(),
        year: year.trim(),
        nickname: nickname.trim(),
        tireSize: tireSize.trim(),
        suspension: suspension.trim(),
        mods: mods.trim(),
        liftIn: parseFloat(liftIn) || 0,
        tireDiameterIn: parseFloat(tireDiameterIn) || 0,
        hasLockers,
        hasLowRange,
        // Firestore rejects undefined values — only include when chosen
        ...(drivetrain ? { drivetrain } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => {}}>
        <View style={[styles.modal, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, maxHeight: "90%" }]}>
          <View style={styles.handle} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>EDIT VEHICLE</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>VEHICLE TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {VEHICLE_TYPES.map((v) => (
                  <TouchableOpacity
                    key={v.type}
                    style={[styles.typePill, { backgroundColor: type === v.type ? colors.accent : colors.secondary, borderColor: type === v.type ? colors.accent : colors.border }]}
                    onPress={() => setType(v.type)}
                  >
                    <MaterialCommunityIcons name={v.icon as never} size={16} color={type === v.type ? "#fff" : colors.mutedForeground} />
                    <Text style={{ color: type === v.type ? "#fff" : colors.mutedForeground, fontWeight: "700", fontSize: 11 }}>{v.label}</Text>
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

            <Text style={[styles.sectionDividerLabel, { color: colors.mutedForeground, borderTopColor: colors.border }]}>
              SPECS — USED BY AI ASSISTANT
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>DRIVETRAIN</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {(["4x4", "2x4"] as Drivetrain[]).map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.typePill,
                    {
                      flex: 1,
                      justifyContent: "center",
                      backgroundColor: drivetrain === d ? colors.accent : colors.secondary,
                      borderColor: drivetrain === d ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setDrivetrain(d)}
                >
                  <Text style={{ color: drivetrain === d ? "#fff" : colors.mutedForeground, fontWeight: "700", fontSize: 11 }}>
                    {d === "4x4" ? "4X4 — FOUR-WHEEL DRIVE" : "2X4 — TWO-WHEEL DRIVE"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {(
              [
                { label: "TIRE SIZE", value: tireSize, onChange: setTireSize, placeholder: "e.g. 35x12.5R17", numeric: false },
                { label: "SUSPENSION", value: suspension, onChange: setSuspension, placeholder: "e.g. Icon Stage 8, 3in lift", numeric: false },
                { label: "LIFT (INCHES)", value: liftIn, onChange: setLiftIn, placeholder: "e.g. 2.5", numeric: true },
                { label: "TIRE DIAMETER (INCHES)", value: tireDiameterIn, onChange: setTireDiameterIn, placeholder: "e.g. 35", numeric: true },
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

            <View style={[styles.switchRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>HAS LOCKERS</Text>
                <Text style={[styles.switchSub, { color: colors.mutedForeground }]}>Front or rear locking differentials</Text>
              </View>
              <Switch value={hasLockers} onValueChange={setHasLockers} thumbColor={hasLockers ? colors.success : colors.mutedForeground} trackColor={{ false: colors.border, true: "#004D26" }} />
            </View>

            <View style={[styles.switchRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>HAS LOW RANGE</Text>
                <Text style={[styles.switchSub, { color: colors.mutedForeground }]}>2-speed transfer case (4LO)</Text>
              </View>
              <Switch value={hasLowRange} onValueChange={setHasLowRange} thumbColor={hasLowRange ? colors.success : colors.mutedForeground} trackColor={{ false: colors.border, true: "#004D26" }} />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 4 }]}>MODS & BUILD NOTES</Text>
              <TextInput
                style={[styles.modsInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                value={mods}
                onChangeText={setMods}
                placeholder="e.g. ARB bumper, snorkel, roof rack, onboard air..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 }]} onPress={onClose} disabled={saving}>
                <Text style={[styles.btnText, { color: colors.mutedForeground }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: colors.accent }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.btnText, { color: "#fff" }]}>SAVE CHANGES</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  const isOnline = useOnline();

  const { mode } = useActivityMode();
  const [section, setSection] = useState<GarageSection>(HUB_SECTIONS["offroad"][0]);

  // Snap to a valid section whenever the activity mode changes
  useEffect(() => {
    setSection((prev) =>
      HUB_SECTIONS[mode].includes(prev) ? prev : HUB_SECTIONS[mode][0],
    );
    // Mods vs gear searches are mode-specific — clear stale results on switch
    setModResults([]);
    setModPrompt("");
    setModsError("");
  }, [mode]);

  // ── Saved hiking spots (hiking mode) ──────────────────────────────────────
  const [savedSpots, setSavedSpots] = useState<SavedHikeSpot[]>([]);

  useEffect(() => {
    if (!user) { setSavedSpots([]); return; }
    let live = false;
    cacheGet<SavedHikeSpot[]>(`hikespots:${user.uid}`).then((cached) => {
      if (!live && cached) setSavedSpots(cached);
    });
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "hiking_spots"), orderBy("savedAt", "desc")),
      (snap) => {
        live = true;
        const items = snap.docs.map((d) => ({ ...(d.data() as HikingPoi), docId: d.id } as SavedHikeSpot));
        setSavedSpots(items);
        cacheSet(`hikespots:${user.uid}`, items);
      },
      () => { live = true; setSavedSpots([]); }
    );
    return unsub;
  }, [user]);

  const removeSpot = useCallback((spot: SavedHikeSpot) => {
    if (!user) return;
    Alert.alert("Remove saved spot?", `"${spot.name}" will be removed from your saved spots.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          deleteDoc(doc(db, "users", user.uid, "hiking_spots", spot.docId)).catch(() => {});
        },
      },
    ]);
  }, [user]);

  // ── Saved trip itineraries (all modes) ────────────────────────────────────
  const [savedItineraries, setSavedItineraries] = useState<SavedItinerary[]>([]);
  // The detail modal shows either one of my own trips or a trip shared with
  // me — a shared trip is detected via its `fromUid` field.
  const [viewItinerary, setViewItinerary] = useState<SavedItinerary | SharedTrip | null>(null);

  useEffect(() => {
    if (!user) { setSavedItineraries([]); return; }
    let live = false;
    // Seed from the offline cache so trip plans survive a cold start without
    // connectivity; the live snapshot overwrites when it lands.
    cacheGet<SavedItinerary[]>(`itineraries:${user.uid}`).then((cached) => {
      if (!live && cached) setSavedItineraries(cached);
    });
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "itineraries"), orderBy("savedAt", "desc")),
      (snap) => {
        live = true;
        const items = snap.docs.map(
          (d) => ({ ...(d.data() as AssistantItinerary), docId: d.id } as SavedItinerary),
        );
        setSavedItineraries(items);
        cacheSet(`itineraries:${user.uid}`, items);
      },
      () => { live = true; setSavedItineraries([]); }
    );
    return unsub;
  }, [user]);

  const removeItinerary = useCallback((trip: SavedItinerary) => {
    if (!user) return;
    Alert.alert("Remove itinerary?", `"${trip.title}" will be removed from your saved trips.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          deleteDoc(doc(db, "users", user.uid, "itineraries", trip.docId)).catch(() => {});
          setViewItinerary((prev) => (prev?.docId === trip.docId ? null : prev));
        },
      },
    ]);
  }, [user]);

  // ── Trips shared with me by crew members ──────────────────────────────────
  const [sharedTrips, setSharedTrips] = useState<SharedTrip[]>([]);
  // Which of my own trips is being shared right now (opens the crew picker)
  const [shareTrip, setShareTrip] = useState<SavedItinerary | null>(null);
  const [sharingToUid, setSharingToUid] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setSharedTrips([]); return; }
    let live = false;
    // Seed from the offline cache so shared plans survive a cold start
    // without connectivity; the live snapshot overwrites when it lands.
    cacheGet<SharedTrip[]>(`sharedtrips:${user.uid}`).then((cached) => {
      if (!live && cached) setSharedTrips(cached);
    });
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "shared_trips"), orderBy("sharedAt", "desc")),
      (snap) => {
        live = true;
        const items = snap.docs.map(
          (d) => ({ ...(d.data() as Omit<SharedTrip, "docId">), docId: d.id } as SharedTrip),
        );
        setSharedTrips(items);
        cacheSet(`sharedtrips:${user.uid}`, items);
      },
      () => { live = true; setSharedTrips([]); }
    );
    return unsub;
  }, [user]);

  // Send one of my saved trips to a crew member: write a shared copy into
  // their shared_trips plus a notification into their inbox.
  const sendTripToCrewMember = useCallback(async (trip: SavedItinerary, member: CrewMember) => {
    if (!user || sharingToUid) return;
    setSharingToUid(member.uid);
    const myName = user.displayName || user.email?.split("@")[0] || "A crew member";
    try {
      // Strip local-only fields and undefined values (Firestore rejects them)
      const { docId: _docId, savedAt: _savedAt, ...rest } = trip;
      const payload = JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
      await addDoc(collection(db, "users", member.uid, "shared_trips"), {
        ...payload,
        fromUid: user.uid,
        fromName: myName,
        sharedAt: serverTimestamp(),
      });
      await addDoc(collection(db, "users", member.uid, "notifications"), {
        type: "trip_share",
        title: "Trip plan shared with you",
        body: `${myName} shared "${trip.title}" — find it under MY TRIPS in your garage.`,
        read: false,
        fromUid: user.uid,
        fromName: myName,
        createdAt: serverTimestamp(),
      });
      setShareTrip(null);
      Alert.alert("Trip shared", `"${trip.title}" was sent to ${member.displayName}.`);
    } catch {
      Alert.alert("Share failed", "Couldn't send the trip plan. Check your connection and try again.");
    } finally {
      setSharingToUid(null);
    }
  }, [user, sharingToUid]);

  // Copy a trip that was shared with me into my own MY TRIPS list.
  const saveSharedTrip = useCallback(async (trip: SharedTrip) => {
    if (!user) return;
    try {
      const { docId, fromUid: _f, fromName: _n, sharedAt: _s, savedAt: _sa, ...rest } = trip;
      const payload = JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
      await setDoc(doc(db, "users", user.uid, "itineraries", `shared_${docId}`), {
        ...payload,
        savedAt: serverTimestamp(),
      });
      Alert.alert("Saved", `"${trip.title}" is now in your MY TRIPS.`);
    } catch {
      Alert.alert("Save failed", "Couldn't save the trip plan. Check your connection and try again.");
    }
  }, [user]);

  const removeSharedTrip = useCallback((trip: SharedTrip) => {
    if (!user) return;
    Alert.alert("Remove shared trip?", `"${trip.title}" will be removed. ${trip.fromName} can share it again.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          deleteDoc(doc(db, "users", user.uid, "shared_trips", trip.docId)).catch(() => {});
          setViewItinerary((prev) => (prev?.docId === trip.docId ? null : prev));
        },
      },
    ]);
  }, [user]);

  // ── Saved campsites (camping mode) ────────────────────────────────────────
  const [savedCampsites, setSavedCampsites] = useState<SavedCampsite[]>([]);

  useEffect(() => {
    if (!user) return;
    let live = false;
    // Seed from the offline cache so the tent isn't empty on a cold start
    // without connectivity; the live snapshot overwrites when it lands.
    cacheGet<SavedCampsite[]>(`campsites:${user.uid}`).then((cached) => {
      if (!live && cached) setSavedCampsites(cached);
    });
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "campsites"), orderBy("savedAt", "desc")),
      (snap) => {
        live = true;
        const items = snap.docs.map((d) => ({ ...(d.data() as Campground), docId: d.id } as SavedCampsite));
        setSavedCampsites(items);
        cacheSet(`campsites:${user.uid}`, items);
      },
      () => { live = true; setSavedCampsites([]); }
    );
    return unsub;
  }, [user]);

  const removeCampsite = useCallback((camp: SavedCampsite) => {
    if (!user) return;
    Alert.alert("Remove campsite?", `"${camp.name}" will be removed from your saved campsites.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          deleteDoc(doc(db, "users", user.uid, "campsites", camp.docId)).catch(() => {});
        },
      },
    ]);
  }, [user]);

  // ── Vehicles ──────────────────────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);

  // ── Find Mods state ────────────────────────────────────────────────────────
  const [showModVehiclePicker, setShowModVehiclePicker] = useState(false);
  const [modVehicle, setModVehicle] = useState<Vehicle | null>(null);
  const [modPrompt, setModPrompt] = useState("");
  const [modResults, setModResults] = useState<ModResult[]>([]);
  const [modsLoading, setModsLoading] = useState(false);
  const [modsError, setModsError] = useState("");

  useEffect(() => {
    if (!user) return;
    let live = false;
    // Seed from the offline cache so the garage isn't empty on a cold start
    // without connectivity; the live snapshot overwrites when it lands.
    cacheGet<Vehicle[]>(`vehicles:${user.uid}`).then((cached) => {
      if (!live && cached) setVehicles(cached);
    });
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "vehicles"), orderBy("createdAt", "desc")),
      (snap) => {
        live = true;
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle));
        setVehicles(items);
        cacheSet(`vehicles:${user.uid}`, items);
      },
      () => { live = true; setVehicles([]); }
    );
    return unsub;
  }, [user]);

  const addVehicle = useCallback(async (v: Omit<Vehicle, "id" | "isFavorite" | "createdAt">) => {
    if (!user) return;
    // Firebase JS SDK has no offline Firestore persistence on RN — an offline
    // write never resolves, so fail fast instead of hanging the SAVE button.
    if (!isOnline) { alertOffline("this vehicle"); return; }
    const isFirst = vehicles.length === 0;
    try {
      await withSaveTimeout(addDoc(collection(db, "users", user.uid, "vehicles"), {
        ...v,
        isFavorite: isFirst,
        createdAt: serverTimestamp(),
      }));
    } catch {
      Alert.alert("Save failed", "Could not save this vehicle. Check your connection and try again.");
      return;
    }
    if (isFirst) {
      await withSaveTimeout(setDoc(doc(db, "users", user.uid), {
        vehicleSpecs: {
          make: v.make, model: v.model, year: v.year,
          tireSize: v.tireSize ?? "", suspension: v.suspension ?? "",
          mods: v.mods ?? "", liftIn: v.liftIn ?? 0,
          tireDiameterIn: v.tireDiameterIn ?? 0,
          hasLockers: v.hasLockers ?? false, hasLowRange: v.hasLowRange ?? false,
          drivetrain: v.drivetrain ?? null,
        },
      }, { merge: true })).catch(() => {
        // Vehicle doc saved — the specs mirror can rebuild on next favorite
        // change, so don't block the modal on this secondary write.
      });
    }
    setShowAddVehicle(false);
  }, [user, vehicles, isOnline]);

  const setFavorite = useCallback(async (vehicle: Vehicle) => {
    if (!user) return;
    if (!isOnline) { alertOffline("this change"); return; }
    try {
      const prev = vehicles.find((v) => v.isFavorite && v.id !== vehicle.id);
      if (prev) await withSaveTimeout(updateDoc(doc(db, "users", user.uid, "vehicles", prev.id), { isFavorite: false }));
      await withSaveTimeout(updateDoc(doc(db, "users", user.uid, "vehicles", vehicle.id), { isFavorite: true }));
      await withSaveTimeout(setDoc(doc(db, "users", user.uid), {
        vehicleSpecs: {
          make: vehicle.make, model: vehicle.model, year: vehicle.year,
          tireSize: vehicle.tireSize ?? "", suspension: vehicle.suspension ?? "",
          mods: vehicle.mods ?? "", liftIn: vehicle.liftIn ?? 0,
          tireDiameterIn: vehicle.tireDiameterIn ?? 0,
          hasLockers: vehicle.hasLockers ?? false, hasLowRange: vehicle.hasLowRange ?? false,
          drivetrain: vehicle.drivetrain ?? null,
        },
      }, { merge: true }));
    } catch {
      Alert.alert("Error", "Could not update favorite. Check your connection and try again.");
    }
  }, [user, vehicles, isOnline]);

  const updateVehicle = useCallback(async (v: Omit<Vehicle, "id" | "isFavorite" | "createdAt">) => {
    if (!user || !editVehicle) return;
    if (!isOnline) { alertOffline("these changes"); return; }
    try {
      await withSaveTimeout(updateDoc(doc(db, "users", user.uid, "vehicles", editVehicle.id), v));
    } catch {
      Alert.alert("Save failed", "Could not save these changes. Check your connection and try again.");
      return;
    }
    if (editVehicle.isFavorite) {
      await withSaveTimeout(setDoc(doc(db, "users", user.uid), {
        vehicleSpecs: {
          make: v.make, model: v.model, year: v.year,
          tireSize: v.tireSize ?? "", suspension: v.suspension ?? "",
          mods: v.mods ?? "", liftIn: v.liftIn ?? 0,
          tireDiameterIn: v.tireDiameterIn ?? 0,
          hasLockers: v.hasLockers ?? false, hasLowRange: v.hasLowRange ?? false,
          drivetrain: v.drivetrain ?? null,
        },
      }, { merge: true })).catch(() => {
        // Vehicle doc saved — the specs mirror can rebuild on next favorite
        // change, so don't block the modal on this secondary write.
      });
    }
    setEditVehicle(null);
  }, [user, editVehicle, isOnline]);

  const searchMods = useCallback(async (prompt: string, vehicle: Vehicle | null) => {
    if (!apiServerUrl) {
      setModsError("API server not configured.");
      return;
    }
    setModsLoading(true);
    setModsError("");
    setModResults([]);
    try {
      const resp = await fetch(`${apiServerUrl}/api/mods/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          kind: mode === "offroad" ? "mods" : "gear",
          vehicleYear: vehicle?.year,
          vehicleMake: vehicle?.make,
          vehicleModel: vehicle?.model,
          vehicleType: vehicle?.type,
        }),
      });
      let json: { results?: ModResult[]; error?: string };
      try {
        json = await resp.json() as { results?: ModResult[]; error?: string };
      } catch {
        throw new Error(
          resp.ok
            ? "Server returned an empty response. Please try again."
            : `Server error (${resp.status}). Please try again.`,
        );
      }
      if (!resp.ok) throw new Error(json.error ?? `Server error (${resp.status})`);
      setModResults(json.results ?? []);
    } catch (e) {
      setModsError(e instanceof Error ? e.message : "Search failed. Try again.");
    } finally {
      setModsLoading(false);
    }
  }, [mode]);

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

  // ── Offline Regions (full offline basemap + terrain, catalog-driven) ─────
  // Downloads happen on the Map screen (REGIONS toolbar button); this section
  // only manages what's already saved on the device.
  const [regionCatalog, setRegionCatalog] = useState<CatalogRegion[]>([]);
  const [regionDownloadedKeys, setRegionDownloadedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (section !== "maps") return;
    let cancelled = false;
    fetchRegionCatalog()
      .then((regions) => {
        if (cancelled) return;
        setRegionCatalog(regions);
        setRegionDownloadedKeys(new Set(listDownloadedRegions(regions).map((r) => r.key)));
        // Clean up dirs no catalog entry references (old versions).
        pruneStaleRegionDirs(regions);
      })
      .catch(() => { /* keep whatever we have */ });
    return () => { cancelled = true; };
  }, [section]);

  // Re-derive saved regions whenever the Garage regains focus, so a region
  // downloaded from the Map screen's REGIONS list shows up here immediately.
  useFocusEffect(
    useCallback(() => {
      if (regionCatalog.length === 0) return;
      setRegionDownloadedKeys(
        new Set(listDownloadedRegions(regionCatalog).map((r) => r.key))
      );
    }, [regionCatalog])
  );

  const handleDeleteRegion = useCallback((region: CatalogRegion) => {
    Alert.alert(
      "Remove offline region?",
      `Delete the downloaded ${region.name} map (${Math.round(regionDownloadBytes(region) / 1_000_000)} MB)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteRegion(region);
            setRegionDownloadedKeys((prev) => {
              const next = new Set(prev);
              next.delete(region.key);
              return next;
            });
          },
        },
      ]
    );
  }, []);

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
    let live = false;
    // Seed from the offline cache so the crew list survives a cold start
    // without connectivity; the live snapshot overwrites when it lands.
    cacheGet<CrewMember[]>(`crew:${user.uid}`).then((cached) => {
      if (!live && cached) setCrew(cached);
    });
    const unsub = onSnapshot(
      collection(db, "users", user.uid, "crew"),
      (snap) => {
        live = true;
        const members = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as CrewMember));
        setCrew(members);
        cacheSet(`crew:${user.uid}`, members);
      },
      () => { live = true; setCrew([]); }
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
    if (!isOnline) { alertOffline("this setting"); return; }
    try {
      await withSaveTimeout(updateDoc(doc(db, "users", user.uid, "crew", member.uid), { wingmanEnabled: enabled }));
    } catch {
      Alert.alert("Error", "Could not update Wingman setting. Check your connection and try again.");
    }
  }, [user, isOnline]);

  // Vehicle context only applies to offroad mods searches — gear searches
  // (camping/hiking) are generic and don't send rig specs.
  const activeModVehicle: Vehicle | null =
    mode === "offroad"
      ? modVehicle ?? vehicles.find((v) => v.isFavorite) ?? vehicles[0] ?? null
      : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TerraPulseLogo color={colors.primary} size="md" />
        <Text style={[styles.headerTitle, { color: colors.accent }]}>{HUB_TITLE[mode]}</Text>
      </View>

      {/* SECTION TABS */}
      <View style={[styles.sectionTabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {HUB_SECTIONS[mode].map((s) => {
          const active = section === s;
          const cfg: Record<GarageSection, { icon: string; mci?: boolean; label: string }> = {
            rides:     { icon: "truck",                 label: "MY RIDES" },
            maps:      { icon: "map",                   label: "MAPS" },
            crew:      { icon: "users",                 label: "MY CREW" },
            mods:      mode === "offroad"
              ? { icon: "tool",         label: "FIND MODS" }
              : { icon: "shopping-bag", label: "FIND GEAR" },
            campsites: { icon: "tent", mci: true,       label: "CAMPSITES" },
            spots:     { icon: "map-marker-star", mci: true, label: "MY SPOTS" },
            itineraries: { icon: "calendar",            label: "MY TRIPS" },
          };
          return (
            <TouchableOpacity
              key={s}
              style={[styles.sectionTab, active && { borderBottomWidth: 2, borderBottomColor: colors.accent }]}
              onPress={() => setSection(s)}
            >
              {cfg[s].mci ? (
                <MaterialCommunityIcons name={cfg[s].icon as never} size={16} color={active ? colors.accent : colors.mutedForeground} />
              ) : (
                <Feather name={cfg[s].icon as never} size={16} color={active ? colors.accent : colors.mutedForeground} />
              )}
              <Text style={[styles.sectionTabText, { color: active ? colors.accent : colors.mutedForeground }]}>
                {cfg[s].label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── CAMPSITES (camping mode) ────────────────────────────────────── */}
      {section === "campsites" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 90, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {savedCampsites.length === 0 ? (
            <View style={styles.emptyCenter}>
              <MaterialCommunityIcons name="tent" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No saved campsites yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Turn on the CAMPGROUNDS layer on the map, tap a tent marker, and
                hit SAVE — your favorite spots will show up right here.
              </Text>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, borderWidth: 1.5, borderColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 }}
                onPress={() => router.push("/(tabs)/map")}
                activeOpacity={0.8}
              >
                <Feather name="map" size={14} color={colors.accent} />
                <Text style={[styles.mapActionText, { color: colors.accent }]}>GO TO MAP</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                {savedCampsites.length} saved campsite{savedCampsites.length === 1 ? "" : "s"} — tap one to see it on the map.
              </Text>
              {savedCampsites.map((camp) => {
                const kindColor = CAMPGROUND_KIND_COLORS[camp.kind] ?? colors.accent;
                const chips = campgroundAmenityChips(camp).slice(0, 4);
                return (
                  <TouchableOpacity
                    key={camp.docId}
                    style={[styles.mapCard, { backgroundColor: colors.card, borderColor: kindColor }]}
                    activeOpacity={0.75}
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/map",
                        params: { focusLat: String(camp.lat), focusLng: String(camp.lng), focusCampsite: "1" },
                      })
                    }
                  >
                    <View style={styles.mapCardHeader}>
                      <View style={[styles.vehicleIconWrap, { backgroundColor: kindColor + "22" }]}>
                        <MaterialCommunityIcons name="tent" size={18} color={kindColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.vehicleName, { color: colors.foreground }]} numberOfLines={2}>
                          {camp.name}
                        </Text>
                        <Text style={[styles.vehicleSub, { color: kindColor }]} numberOfLines={1}>
                          {CAMPGROUND_KIND_LABELS[camp.kind]} · {campgroundSourceLabel(camp)}
                        </Text>
                        {(camp.operator || camp.season) ? (
                          <Text style={[styles.vehicleSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {[camp.operator, camp.season].filter(Boolean).join(" · ")}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => removeCampsite(camp)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ padding: 4 }}
                      >
                        <Feather name="trash-2" size={17} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                    {chips.length > 0 ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {chips.map((chip) => (
                          <View key={chip} style={{ backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground }}>{chip}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {camp.reservationUrl ? (
                      <TouchableOpacity
                        style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 }}
                        onPress={() => Linking.openURL(camp.reservationUrl!).catch(() => {})}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="external-link" size={13} color="#2E7D32" />
                        <Text style={[styles.mapActionText, { color: "#2E7D32" }]}>RESERVE ON RECREATION.GOV</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── MY SPOTS (hiking mode) ──────────────────────────────────────── */}
      {section === "spots" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 90, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {savedSpots.length === 0 ? (
            <View style={styles.emptyCenter}>
              <MaterialCommunityIcons name="map-marker-star" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No saved spots yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Turn on the HIKING POINTS layer on the map, tap a marker —
                trailheads, viewpoints, peaks, waterfalls — and hit SAVE. Your
                favorite spots will show up right here.
              </Text>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, borderWidth: 1.5, borderColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 }}
                onPress={() => router.push("/(tabs)/map")}
                activeOpacity={0.8}
              >
                <Feather name="map" size={14} color={colors.accent} />
                <Text style={[styles.mapActionText, { color: colors.accent }]}>GO TO MAP</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                {savedSpots.length} saved spot{savedSpots.length === 1 ? "" : "s"} — tap one to see it on the map.
              </Text>
              {savedSpots.map((spot) => {
                const kindColor = HIKING_POI_COLORS[spot.kind] ?? colors.accent;
                const chips = hikingPoiChips(spot).slice(0, 4);
                return (
                  <TouchableOpacity
                    key={spot.docId}
                    style={[styles.mapCard, { backgroundColor: colors.card, borderColor: kindColor }]}
                    activeOpacity={0.75}
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/map",
                        params: { focusLat: String(spot.lat), focusLng: String(spot.lng), focusHikeSpot: "1" },
                      })
                    }
                  >
                    <View style={styles.mapCardHeader}>
                      <View style={[styles.vehicleIconWrap, { backgroundColor: kindColor + "22" }]}>
                        <MaterialCommunityIcons name={(HIKING_POI_ICONS[spot.kind] ?? "hiking") as never} size={18} color={kindColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.vehicleName, { color: colors.foreground }]} numberOfLines={2}>
                          {spot.name}
                        </Text>
                        <Text style={[styles.vehicleSub, { color: kindColor }]} numberOfLines={1}>
                          {HIKING_POI_LABELS[spot.kind] ?? "SPOT"} · {hikingPoiSourceLabel(spot)}
                        </Text>
                        {(spot.operator || spot.season) ? (
                          <Text style={[styles.vehicleSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {[spot.operator, spot.season].filter(Boolean).join(" · ")}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => removeSpot(spot)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ padding: 4 }}
                      >
                        <Feather name="trash-2" size={17} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                    {chips.length > 0 ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {chips.map((chip) => (
                          <View key={chip} style={{ backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground }}>{chip}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {spot.website ? (
                      <TouchableOpacity
                        style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 }}
                        onPress={() => Linking.openURL(spot.website!).catch(() => {})}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="external-link" size={13} color={kindColor} />
                        <Text style={[styles.mapActionText, { color: kindColor }]}>OPEN WEBSITE</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── MY TRIPS (saved itineraries, all modes) ─────────────────────── */}
      {section === "itineraries" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 90, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {savedItineraries.length === 0 && sharedTrips.length === 0 ? (
            <View style={styles.emptyCenter}>
              <Feather name="calendar" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No saved trips yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Ask the Trip Assistant to plan a trip, then hit SAVE on the
                itinerary card — your trip plans will show up right here.
              </Text>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, borderWidth: 1.5, borderColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 }}
                onPress={() => router.push("/(tabs)/assistant")}
                activeOpacity={0.8}
              >
                <Feather name="message-square" size={14} color={colors.accent} />
                <Text style={[styles.mapActionText, { color: colors.accent }]}>ASK THE ASSISTANT</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {savedItineraries.length > 0 && (
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  {savedItineraries.length} saved trip{savedItineraries.length === 1 ? "" : "s"} — tap one to see the full plan.
                </Text>
              )}
              {savedItineraries.map((trip) => (
                <TouchableOpacity
                  key={trip.docId}
                  style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.accent }]}
                  activeOpacity={0.75}
                  onPress={() => setViewItinerary(trip)}
                >
                  <View style={styles.mapCardHeader}>
                    <View style={[styles.vehicleIconWrap, { backgroundColor: colors.accent + "22" }]}>
                      <Feather name="map" size={18} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.vehicleName, { color: colors.foreground }]} numberOfLines={2}>
                        {trip.title}
                      </Text>
                      <Text style={[styles.vehicleSub, { color: colors.accent }]} numberOfLines={1}>
                        {[
                          trip.dates,
                          `${trip.days.length} day${trip.days.length === 1 ? "" : "s"}`,
                        ].filter(Boolean).join(" · ")}
                      </Text>
                      {trip.destinationName ? (
                        <Text style={[styles.vehicleSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {trip.destinationName}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => setShareTrip(trip)}
                      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      style={{ padding: 4 }}
                    >
                      <Feather name="share-2" size={17} color={colors.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeItinerary(trip)}
                      hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
                      style={{ padding: 4 }}
                    >
                      <Feather name="trash-2" size={17} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
              {sharedTrips.length > 0 && (
                <>
                  <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.mutedForeground, marginTop: savedItineraries.length > 0 ? 8 : 0 }}>
                    SHARED WITH YOU
                  </Text>
                  {sharedTrips.map((trip) => (
                    <TouchableOpacity
                      key={trip.docId}
                      style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      activeOpacity={0.75}
                      onPress={() => setViewItinerary(trip)}
                    >
                      <View style={styles.mapCardHeader}>
                        <View style={[styles.vehicleIconWrap, { backgroundColor: colors.secondary }]}>
                          <Feather name="users" size={18} color={colors.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.vehicleName, { color: colors.foreground }]} numberOfLines={2}>
                            {trip.title}
                          </Text>
                          <Text style={[styles.vehicleSub, { color: colors.accent }]} numberOfLines={1}>
                            From {trip.fromName || "a crew member"}
                          </Text>
                          <Text style={[styles.vehicleSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {[
                              trip.dates,
                              `${trip.days.length} day${trip.days.length === 1 ? "" : "s"}`,
                              trip.destinationName,
                            ].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => removeSharedTrip(trip)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={{ padding: 4 }}
                        >
                          <Feather name="trash-2" size={17} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

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
                    onPress={() => setEditVehicle(v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="edit-2" size={16} color={colors.mutedForeground} />
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
          {/* Offline Regions: full offline basemap + terrain per region */}
          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: colors.mutedForeground }}>
            OFFLINE REGIONS
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: -6 }}>
            Complete offline maps saved on this device — roads, labels, and terrain shading with no cell service. The map switches to a saved region automatically when you're offline inside it. Browse and download regions from the REGIONS button on the map.
          </Text>
          {regionCatalog.length === 0 ? (
            <View style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 14 }]}>
              <Text style={[styles.vehicleSub, { color: colors.mutedForeground }]}>
                Region list unavailable — connect to the internet to load it.
              </Text>
            </View>
          ) : regionCatalog.filter((r) => regionDownloadedKeys.has(r.key)).length === 0 ? (
            <TouchableOpacity
              style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 14 }]}
              onPress={() => router.push("/(tabs)/map")}
              activeOpacity={0.7}
            >
              <Text style={[styles.vehicleSub, { color: colors.mutedForeground }]}>
                No offline regions saved yet. Open the map and tap REGIONS to
                browse and download full offline maps.
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
                <Feather name="map" size={13} color={colors.accent} />
                <Text style={[styles.mapActionText, { color: colors.accent }]}>GO TO MAP</Text>
              </View>
            </TouchableOpacity>
          ) : (
            regionCatalog
              .filter((region) => regionDownloadedKeys.has(region.key))
              .map((region) => {
                const sizeMB = Math.round(regionDownloadBytes(region) / 1_000_000);
                return (
                  <View key={region.key} style={[styles.mapCard, { backgroundColor: colors.card, borderColor: "#2E7D32" }]}>
                    <View style={styles.mapCardHeader}>
                      <View style={[styles.vehicleIconWrap, { backgroundColor: "#2E7D32" + "22" }]}>
                        <Feather name="globe" size={18} color="#2E7D32" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.vehicleName, { color: colors.foreground }]} numberOfLines={1}>
                          {region.name}, {region.state}
                        </Text>
                        <Text style={[styles.vehicleSub, { color: "#2E7D32" }]}>
                          OFFLINE READY — {sizeMB} MB on device
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.mapActions, { borderTopColor: colors.border }]}>
                      <TouchableOpacity style={styles.mapAction} onPress={() => handleDeleteRegion(region)} activeOpacity={0.7}>
                        <Feather name="trash-2" size={14} color={colors.destructive} />
                        <Text style={[styles.mapActionText, { color: colors.destructive }]}>DELETE</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
          )}

          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: colors.mutedForeground, marginTop: 10 }}>
            SAVED TRAIL MAPS
          </Text>
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

      {/* ── FIND MODS ─────────────────────────────────────────────────────── */}
      {section === "mods" && (
        <View style={{ flex: 1 }}>
          {/* Search panel */}
          <View style={[styles.modSearchPanel, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {/* Vehicle context pill */}
            {mode === "offroad" && activeModVehicle && (() => {
              const av = activeModVehicle;
              return (
                <TouchableOpacity
                  style={[styles.modVehiclePill, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  onPress={() => setShowModVehiclePicker(true)}
                >
                  <MaterialCommunityIcons name={vehicleIcon(av.type)} size={13} color={colors.accent} />
                  <Text style={[styles.modVehiclePillText, { color: colors.foreground }]} numberOfLines={1}>
                    {av.nickname || [av.year, av.make, av.model].filter(Boolean).join(" ")}
                  </Text>
                  <Feather name="chevron-down" size={11} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })()}

            {/* Prompt row */}
            <View style={styles.modPromptRow}>
              <TextInput
                style={[styles.modPromptInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                value={modPrompt}
                onChangeText={setModPrompt}
                placeholder={
                  mode === "offroad"
                    ? 'What mods are you looking for? (e.g. 35" tires, skid plates, roof rack...)'
                    : mode === "camping"
                      ? "What gear do you need? (e.g. 4-season tent, camp stove, sleeping pads...)"
                      : "What gear do you need? (e.g. trekking poles, daypack, water filter...)"
                }
                placeholderTextColor={colors.mutedForeground}
                multiline
                returnKeyType="search"
                blurOnSubmit
                onSubmitEditing={() => {
                  const trimmed = modPrompt.trim();
                  if (!trimmed || modsLoading) return;
                  void searchMods(trimmed, activeModVehicle);
                }}
              />
              <TouchableOpacity
                style={[styles.modSearchBtn, { backgroundColor: modsLoading || !modPrompt.trim() ? colors.secondary : colors.accent }]}
                onPress={() => {
                  const trimmed = modPrompt.trim();
                  if (!trimmed || modsLoading) return;
                  void searchMods(trimmed, activeModVehicle);
                }}
                disabled={modsLoading || !modPrompt.trim()}
              >
                {modsLoading
                  ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                  : <Feather name="search" size={18} color="#fff" />
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Results / empty states */}
          {modsLoading ? (
            <View style={styles.emptyCenter}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 14, textAlign: "center" }}>
                Searching across the web…
              </Text>
            </View>
          ) : modsError ? (
            <View style={styles.emptyCenter}>
              <Feather name="alert-circle" size={32} color={colors.destructive} />
              <Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 15, marginTop: 10 }}>Search Failed</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center", marginTop: 4 }}>{modsError}</Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.accent, marginTop: 16, paddingHorizontal: 24 }]}
                onPress={() => {
                  const trimmed = modPrompt.trim();
                  if (!trimmed) return;
                  void searchMods(trimmed, activeModVehicle);
                }}
              >
                <Feather name="refresh-cw" size={14} color="#fff" />
                <Text style={[styles.btnText, { color: "#fff" }]}>RETRY</Text>
              </TouchableOpacity>
            </View>
          ) : modResults.length > 0 ? (
            <ScrollView
              contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 80, gap: 10 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 2 }}>
                {modResults.length} RESULTS — TAP TO OPEN
              </Text>
              {modResults.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.modLinkCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => Linking.openURL(r.url).catch(() => {})}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.modLinkTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {r.title}
                    </Text>
                    {!!r.description && (
                      <Text style={[styles.modLinkDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                        {r.description}
                      </Text>
                    )}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <Feather name="globe" size={10} color={colors.mutedForeground} />
                      <Text style={[styles.modLinkSource, { color: colors.mutedForeground }]}>{r.source}</Text>
                    </View>
                  </View>
                  <View style={[styles.modLinkArrow, { backgroundColor: colors.accent + "18" }]}>
                    <Feather name="external-link" size={15} color={colors.accent} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyCenter}>
              <Feather name={mode === "offroad" ? "tool" : "shopping-bag"} size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {mode === "offroad" ? "Find Mods" : "Find Gear"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                {mode === "offroad"
                  ? `Describe what you're looking for — suspension lift, 35" tires, skid plates, recovery gear — and we'll pull real product links from across the web.`
                  : mode === "camping"
                    ? `Describe what you need — tents, sleeping bags, camp stoves, coolers — and we'll pull real product links from across the web.`
                    : `Describe what you need — boots, packs, trekking poles, water filters — and we'll pull real product links from across the web.`}
              </Text>
            </View>
          )}
        </View>
      )}

      <AddVehicleModal
        visible={showAddVehicle}
        onClose={() => setShowAddVehicle(false)}
        onSave={addVehicle}
      />

      <EditVehicleModal
        visible={editVehicle !== null}
        vehicle={editVehicle}
        onClose={() => setEditVehicle(null)}
        onSave={updateVehicle}
      />

      {/* ── Saved Itinerary Detail ────────────────────────────────────────── */}
      <Modal
        visible={viewItinerary !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setViewItinerary(null)}
      >
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setViewItinerary(null)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modal, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, maxHeight: "88%" }]}
            onPress={() => {}}
          >
            <View style={styles.handle} />
            {viewItinerary && (
              <>
                <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 4 }]}>
                  {viewItinerary.title.toUpperCase()}
                </Text>
                {"fromUid" in viewItinerary && viewItinerary.fromUid ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <Feather name="users" size={12} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                      Shared by {(viewItinerary as SharedTrip).fromName || "a crew member"}
                    </Text>
                  </View>
                ) : null}
                {(viewItinerary.dates || viewItinerary.destinationName) ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "600", marginBottom: 12 }}>
                    {[viewItinerary.dates, viewItinerary.destinationName].filter(Boolean).join(" · ")}
                  </Text>
                ) : (
                  <View style={{ height: 8 }} />
                )}
                <ScrollView showsVerticalScrollIndicator={false}>
                  {viewItinerary.days.map((day) => (
                    <View key={day.day} style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>D{day.day}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 4, paddingTop: 3 }}>
                        {!!day.date && (
                          <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.5, color: colors.mutedForeground, textTransform: "uppercase" }}>
                            {day.date}
                          </Text>
                        )}
                        {!!(day.plan || day.trailWindow) && (
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
                            {day.plan || day.trailWindow}
                          </Text>
                        )}
                        {!!(day.plan && day.trailWindow) && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Feather name="flag" size={11} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{day.trailWindow}</Text>
                          </View>
                        )}
                        {!!day.driveTime && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Feather name="clock" size={11} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{day.driveTime}</Text>
                          </View>
                        )}
                        {!!day.weatherNote && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Feather name="cloud" size={11} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{day.weatherNote}</Text>
                          </View>
                        )}
                        {!!day.campground && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Feather name="home" size={11} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{day.campground}</Text>
                          </View>
                        )}
                        {!!day.reserveUrl && (
                          <TouchableOpacity
                            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
                            onPress={() => Linking.openURL(day.reserveUrl!).catch(() => {})}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Feather name="external-link" size={11} color={colors.accent} />
                            <Text style={[styles.mapActionText, { color: colors.accent }]}>RESERVE</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                  {(viewItinerary.cellNote || viewItinerary.waterNote || viewItinerary.shelterNote || viewItinerary.packingNote) ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 6, marginBottom: 4 }}>
                      {([
                        ["wifi-off", viewItinerary.cellNote],
                        ["droplet", viewItinerary.waterNote],
                        ["home", viewItinerary.shelterNote],
                        ["package", viewItinerary.packingNote],
                      ] as const).filter(([, text]) => !!text).map(([icon, text]) => (
                        <View key={icon} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                          <Feather name={icon} size={12} color={colors.mutedForeground} />
                          <Text style={{ flex: 1, fontSize: 11, lineHeight: 15, color: colors.mutedForeground }}>{text}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </ScrollView>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  {typeof viewItinerary.destinationLat === "number" && typeof viewItinerary.destinationLng === "number" ? (
                    <TouchableOpacity
                      style={[styles.btn, { flex: 1, backgroundColor: colors.accent }]}
                      onPress={() => {
                        const trip = viewItinerary;
                        setViewItinerary(null);
                        router.push({
                          pathname: "/(tabs)/map",
                          params: {
                            focusLat: String(trip.destinationLat),
                            focusLng: String(trip.destinationLng),
                          },
                        });
                      }}
                    >
                      <Text style={[styles.btnText, { color: "#fff" }]}>VIEW ON MAP</Text>
                    </TouchableOpacity>
                  ) : null}
                  {"fromUid" in viewItinerary && viewItinerary.fromUid ? (
                    <>
                      <TouchableOpacity
                        style={[styles.btn, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.accent, borderWidth: 1 }]}
                        onPress={() => saveSharedTrip(viewItinerary as SharedTrip)}
                      >
                        <Text style={[styles.btnText, { color: colors.accent }]}>SAVE TO MY TRIPS</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 }]}
                        onPress={() => removeSharedTrip(viewItinerary as SharedTrip)}
                      >
                        <Text style={[styles.btnText, { color: colors.destructive }]}>REMOVE</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.btn, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.accent, borderWidth: 1 }]}
                        onPress={() => setShareTrip(viewItinerary as SavedItinerary)}
                      >
                        <Text style={[styles.btnText, { color: colors.accent }]}>SHARE</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, { flex: 1, backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 }]}
                        onPress={() => removeItinerary(viewItinerary as SavedItinerary)}
                      >
                        <Text style={[styles.btnText, { color: colors.destructive }]}>REMOVE</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Share Trip — crew picker ──────────────────────────────────────── */}
      <Modal
        visible={shareTrip !== null}
        animationType="slide"
        transparent
        onRequestClose={() => { if (!sharingToUid) setShareTrip(null); }}
      >
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => { if (!sharingToUid) setShareTrip(null); }}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modal, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, maxHeight: "65%" }]}
            onPress={() => {}}
          >
            <View style={styles.handle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>SHARE WITH YOUR CREW</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 14 }} numberOfLines={2}>
              {shareTrip ? `Send "${shareTrip.title}" to a crew member — they'll see the full day-by-day plan.` : ""}
            </Text>
            {crew.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
                <Feather name="users" size={36} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: 14 }]}>No crew yet</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  Send friend requests in the Riders tab to build your crew, then share trips with them.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {crew.map((member) => (
                  <TouchableOpacity
                    key={member.uid}
                    style={[styles.modVehicleRow, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: sharingToUid && sharingToUid !== member.uid ? 0.5 : 1 }]}
                    disabled={!!sharingToUid}
                    onPress={() => { if (shareTrip) sendTripToCrewMember(shareTrip, member); }}
                  >
                    {member.photoURL ? (
                      <Image source={{ uri: member.photoURL }} style={styles.crewAvatar} />
                    ) : (
                      <View style={[styles.crewAvatar, { backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }]}>
                        <Feather name="user" size={18} color={colors.mutedForeground} />
                      </View>
                    )}
                    <Text style={{ flex: 1, color: colors.foreground, fontWeight: "900", fontSize: 14 }} numberOfLines={1}>
                      {member.displayName}
                    </Text>
                    {sharingToUid === member.uid ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Feather name="send" size={16} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, marginTop: 10 }]}
              disabled={!!sharingToUid}
              onPress={() => setShareTrip(null)}
            >
              <Text style={[styles.btnText, { color: colors.mutedForeground }]}>CANCEL</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Vehicle Picker (for mod context) ──────────────────────────────── */}
      <Modal visible={showModVehiclePicker} animationType="slide" transparent onRequestClose={() => setShowModVehiclePicker(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modal, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, maxHeight: "65%" }]}>
            <View style={styles.handle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>SEARCH FOR WHICH RIG?</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 14 }}>
              Your vehicle tailors the search results
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {vehicles.map((v) => {
                const av = modVehicle ?? vehicles.find((v2) => v2.isFavorite) ?? vehicles[0];
                const selected = v.id === av?.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.modVehicleRow, { backgroundColor: selected ? colors.accent + "18" : colors.secondary, borderColor: selected ? colors.accent : colors.border }]}
                    onPress={() => { setModVehicle(v); setShowModVehiclePicker(false); }}
                  >
                    <View style={[styles.vehicleIconWrap, { backgroundColor: selected ? colors.accent + "22" : colors.card }]}>
                      <MaterialCommunityIcons name={vehicleIcon(v.type)} size={22} color={selected ? colors.accent : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "900", fontSize: 14 }}>
                        {v.nickname || [v.year, v.make, v.model].filter(Boolean).join(" ")}
                      </Text>
                      {v.nickname && (
                        <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: "600" }}>
                          {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                        </Text>
                      )}
                    </View>
                    {selected && <Feather name="check" size={16} color={colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1, marginTop: 10 }]}
              onPress={() => setShowModVehiclePicker(false)}
            >
              <Text style={[styles.btnText, { color: colors.mutedForeground }]}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  sectionDividerLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    borderTopWidth: 1,
    paddingTop: 14,
    marginBottom: 12,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  switchSub: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  modsInput: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontSize: 13,
    fontWeight: "600",
    minHeight: 80,
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

  // ── Find Mods ──────────────────────────────────────────────────────────────
  modSearchPanel: {
    padding: 14,
    gap: 10,
    borderBottomWidth: 1,
  },
  modVehiclePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  modVehiclePillText: { fontWeight: "700", fontSize: 12, maxWidth: 220 },
  modPromptRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  modPromptInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "500",
    minHeight: 50,
    maxHeight: 110,
  },
  modSearchBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  modLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  modLinkTitle: { fontWeight: "800", fontSize: 13, lineHeight: 18 },
  modLinkDesc: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
  modLinkSource: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  modLinkArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
