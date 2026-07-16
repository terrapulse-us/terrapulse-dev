"use no memo";
import React, { useState, useEffect, useCallback } from "react";
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
  TextInput,
  Linking,
} from "react-native";
import { Feather, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  doc,
  updateDoc,
  arrayUnion,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { type VehicleType, VEHICLE_TYPE_CONFIG } from "@/lib/trails";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrailPhoto {
  url: string;
  uploadedBy: string;
}

export interface TrailForDetail {
  id: string;
  title: string;
  coords: { latitude: number; longitude: number };
  difficulty: string;
  difficultyRating: number;
  size: string;
  suspension: string;
  region: string;
  state: string;
  vehicleTypes?: VehicleType[];
  routeCoordinates?: Array<{ lat: number; lng: number }>;
}

interface TrailEvent {
  id: string;
  title: string;
  eventType: string;
  dateStr: string;
  time: string;
  visibility: "open" | "closed";
  createdBy: string;
  createdByName: string;
  attendees: { uid: string; name: string }[];
  description: string;
}

interface Contributor {
  uid: string;
  displayName: string;
  addedAt?: number;
}

interface Props {
  trail: TrailForDetail | null;
  visible: boolean;
  onClose: () => void;
  photos: TrailPhoto[];
  uploading: boolean;
  onUploadPhoto: () => void;
  downloading: boolean;
  onDownload: () => void;
  offlineReady?: boolean;
  completedTrails: string[];
  riddenTrailIds: string[];
  completing: boolean;
  onComplete: () => void;
  onNavigate?: () => void;
  onGroupRide?: (action: "start" | "join") => void;
  activeRideInfo?: { memberCount: number } | null;
  isFollowed?: boolean;
  onFollow?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  "Group Run",
  "Trail Cleanup",
  "Camping Trip",
  "Race Day",
  "Casual Ride",
  "Other",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DifficultyBar({ rating }: { rating: number }) {
  const colors = useColors();
  const color =
    rating <= 3 ? colors.success : rating <= 6 ? "#FFC107" : colors.destructive;
  return (
    <View style={{ flexDirection: "row", gap: 3, marginTop: 6, marginBottom: 4 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < rating ? color : colors.border,
          }}
        />
      ))}
    </View>
  );
}

function MiniCalendar({
  year,
  month,
  eventDateSet,
  selectedDate,
  todayStr,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  eventDateSet: Set<string>;
  selectedDate: string | null;
  todayStr: string;
  onSelectDate: (d: string | null) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const colors = useColors();
  const days = getCalendarDays(year, month);

  return (
    <View style={[cal.card, { backgroundColor: colors.card }]}>
      <View style={cal.header}>
        <TouchableOpacity onPress={onPrevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[cal.monthText, { color: colors.foreground }]}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity onPress={onNextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-right" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <View style={cal.dayNames}>
        {DAY_NAMES.map((d, i) => (
          <Text key={i} style={[cal.dayName, { color: colors.mutedForeground }]}>{d}</Text>
        ))}
      </View>
      <View style={cal.grid}>
        {days.map((day, i) => {
          if (!day) return <View key={`e-${i}`} style={cal.cell} />;
          const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasEvent = eventDateSet.has(ds);
          const isSel = selectedDate === ds;
          const isToday = ds === todayStr;
          return (
            <TouchableOpacity
              key={ds}
              style={[cal.cell, isSel && { backgroundColor: colors.accent, borderRadius: 20 }]}
              onPress={() => onSelectDate(isSel ? null : ds)}
              activeOpacity={0.7}
            >
              <Text style={[
                cal.dayNum,
                { color: isSel ? colors.accentForeground : isToday ? colors.accent : colors.foreground },
                isToday && { fontWeight: "900" },
              ]}>
                {day}
              </Text>
              {hasEvent && (
                <View style={[cal.dot, { backgroundColor: isSel ? colors.accentForeground : colors.accent }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  monthText: { fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
  dayNames: { flexDirection: "row", marginBottom: 6 },
  dayName: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayNum: { fontSize: 13, fontWeight: "600" },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrailDetailScreen({
  trail,
  visible,
  onClose,
  photos,
  uploading,
  onUploadPhoto,
  downloading,
  onDownload,
  offlineReady,
  completedTrails,
  riddenTrailIds,
  completing,
  onComplete,
  onNavigate,
  onGroupRide,
  activeRideInfo,
  isFollowed,
  onFollow,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"info" | "events">("info");
  const [events, setEvents] = useState<TrailEvent[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Create event form state
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evType, setEvType] = useState(EVENT_TYPES[0]);
  const [evDateStr, setEvDateStr] = useState(formatDateStr(new Date()));
  const [evTime, setEvTime] = useState("09:00");
  const [evVisibility, setEvVisibility] = useState<"open" | "closed">("open");
  const [evDescription, setEvDescription] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [attendeesEvent, setAttendeesEvent] = useState<TrailEvent | null>(null);

  // Contributors state
  const [showContributors, setShowContributors] = useState(false);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [togglingContributor, setTogglingContributor] = useState(false);

  // Load contributors for this trail
  useEffect(() => {
    if (!trail || !visible) { setContributors([]); return; }
    const unsub = onSnapshot(
      collection(db, "trails", trail.id, "contributors"),
      (snap) => {
        setContributors(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as Contributor)));
      }
    );
    return unsub;
  }, [trail?.id, visible]);

  // Load events for this trail
  useEffect(() => {
    if (!trail || !visible) { setEvents([]); return; }
    const unsub = onSnapshot(
      query(collection(db, "trails", trail.id, "events"), orderBy("dateStr", "asc")),
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TrailEvent)));
      }
    );
    return unsub;
  }, [trail?.id, visible]);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setActiveTab("info");
      setSelectedDate(null);
      setCalendarMonth(new Date());
    }
  }, [visible]);

  const openDirections = useCallback(() => {
    if (!trail) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${trail.coords.latitude},${trail.coords.longitude}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Cannot open Maps", "Install Google Maps or check your connection.")
    );
  }, [trail]);

  const resetCreateForm = useCallback(() => {
    setEvTitle("");
    setEvType(EVENT_TYPES[0]);
    setEvDateStr(formatDateStr(new Date()));
    setEvTime("09:00");
    setEvVisibility("open");
    setEvDescription("");
    setShowDatePicker(false);
  }, []);

  const createEvent = useCallback(async () => {
    if (!user || !trail) return;
    if (!evTitle.trim()) {
      Alert.alert("Missing name", "Please give your event a title.");
      return;
    }
    setCreatingEvent(true);
    try {
      await addDoc(collection(db, "trails", trail.id, "events"), {
        title: evTitle.trim(),
        eventType: evType,
        dateStr: evDateStr,
        time: evTime,
        visibility: evVisibility,
        createdBy: user.uid,
        createdByName: user.displayName ?? user.email ?? "Unknown",
        attendees: [{ uid: user.uid, name: user.displayName ?? user.email ?? "You" }],
        description: evDescription.trim(),
        createdAt: serverTimestamp(),
      });
      setShowCreateEvent(false);
      resetCreateForm();
      setActiveTab("events");
    } catch {
      Alert.alert("Error", "Could not create event. Try again.");
    } finally {
      setCreatingEvent(false);
    }
  }, [user, trail, evTitle, evType, evDateStr, evTime, evVisibility, evDescription, resetCreateForm]);

  const toggleContributor = useCallback(async () => {
    if (!user || !trail) return;
    const isContrib = contributors.some((c) => c.uid === user.uid);
    setTogglingContributor(true);
    try {
      const contribRef = doc(db, "trails", trail.id, "contributors", user.uid);
      if (isContrib) {
        await deleteDoc(contribRef);
      } else {
        await setDoc(contribRef, {
          uid: user.uid,
          displayName: user.displayName ?? user.email ?? "Anonymous",
          addedAt: Date.now(),
        });
      }
    } catch {
      Alert.alert("Error", "Could not update contributor status. Try again.");
    } finally {
      setTogglingContributor(false);
    }
  }, [user, trail, contributors]);

  const joinOrLeaveEvent = useCallback(async (event: TrailEvent) => {
    if (!user || !trail) return;
    const already = event.attendees?.some((a) => a.uid === user.uid);
    const eventRef = doc(db, "trails", trail.id, "events", event.id);
    try {
      if (already) {
        const filtered = (event.attendees ?? []).filter((a) => a.uid !== user.uid);
        await updateDoc(eventRef, { attendees: filtered });
      } else {
        await updateDoc(eventRef, {
          attendees: arrayUnion({
            uid: user.uid,
            name: user.displayName ?? user.email ?? "You",
          }),
        });
      }
    } catch {
      Alert.alert("Error", "Could not update attendance.");
    }
  }, [user, trail]);

  if (!trail) return null;

  const done = completedTrails.includes(trail.id);
  const hasRoute = (trail.routeCoordinates?.length ?? 0) > 0;
  const isContributor = user ? contributors.some((c) => c.uid === user.uid) : false;
  const todayStr = formatDateStr(new Date());
  const calYear = calendarMonth.getFullYear();
  const calMonth = calendarMonth.getMonth();
  const eventDateSet = new Set(events.map((e) => e.dateStr));
  const displayedEvents = selectedDate
    ? events.filter((e) => e.dateStr === selectedDate)
    : events.filter((e) => e.dateStr >= todayStr);

  // Date picker calendar state
  const pyYear = pickerMonth.getFullYear();
  const pyMonth = pickerMonth.getMonth();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { backgroundColor: colors.background }]}>

        {/* ── HEADER ── */}
        <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={[s.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {trail.title.toUpperCase()}
            </Text>
            <Text style={[s.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {trail.region} · {trail.state}
            </Text>
          </View>
        </View>

        {/* ── ACTION BUTTONS ── */}
        <View style={[s.actionRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={[s.actionBtn, s.directionsBtn]} onPress={openDirections} activeOpacity={0.85}>
            <MaterialIcons name="location-on" size={15} color="#fff" />
            <Text style={[s.actionBtnText, { color: "#fff" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>DIRECTIONS</Text>
          </TouchableOpacity>
          {!!onFollow && (
            <TouchableOpacity
              style={[s.actionBtn, {
                backgroundColor: isFollowed ? "#E53935" : colors.secondary,
                borderColor: isFollowed ? "#E53935" : colors.border,
                borderWidth: 1,
              }]}
              onPress={onFollow}
              activeOpacity={0.85}
            >
              <MaterialIcons name={isFollowed ? "favorite" : "favorite-border"} size={14} color={isFollowed ? "#fff" : colors.accent} />
              <Text style={[s.actionBtnText, { color: isFollowed ? "#fff" : colors.accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {isFollowed ? "FOLLOWING" : "FOLLOW"}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.actionBtn, {
              backgroundColor: colors.secondary,
              borderColor: offlineReady ? "#4CAF50" : colors.border,
              borderWidth: 1,
            }]}
            onPress={onDownload}
            disabled={downloading}
            activeOpacity={0.85}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : offlineReady ? (
              <>
                <MaterialIcons name="offline-pin" size={14} color="#4CAF50" />
                <Text style={[s.actionBtnText, { color: "#4CAF50" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>OFFLINE READY</Text>
              </>
            ) : (
              <>
                <Feather name="download" size={13} color={colors.accent} />
                <Text style={[s.actionBtnText, { color: colors.accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>SAVE MAP</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── CONTRIBUTORS BAR ── */}
        <TouchableOpacity
          style={[s.contribBar, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}
          onPress={() => setShowContributors(true)}
          activeOpacity={0.75}
        >
          <Feather name="users" size={13} color={colors.mutedForeground} />
          <Text style={[s.contribBarText, { color: colors.mutedForeground }]}>
            {contributors.length === 0
              ? "No trail contributors yet"
              : `${contributors.length} contributor${contributors.length !== 1 ? "s" : ""}`}
          </Text>
          <Feather name="chevron-right" size={13} color={colors.border} />
        </TouchableOpacity>

        {/* ── FOLLOW TRAIL ── */}
        {!!trail.routeCoordinates?.length && !!onNavigate && (
          <TouchableOpacity
            style={[s.followTrailBtn, { backgroundColor: colors.primary, borderBottomColor: colors.border }]}
            onPress={onNavigate}
            activeOpacity={0.85}
          >
            <MaterialIcons name="navigation" size={16} color={colors.primaryForeground} />
            <Text style={[s.followTrailText, { color: colors.primaryForeground }]}>FOLLOW TRAIL ON MAP</Text>
          </TouchableOpacity>
        )}

        {/* ── GROUP RIDE ── */}
        {!!onGroupRide && (
          <TouchableOpacity
            style={[s.followTrailBtn, {
              backgroundColor: activeRideInfo ? "#1E88E5" : "#43A047",
              borderBottomColor: colors.border,
            }]}
            onPress={() => onGroupRide(activeRideInfo ? "join" : "start")}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="account-group" size={18} color="#fff" />
            <Text style={[s.followTrailText, { color: "#fff" }]}>
              {activeRideInfo
                ? `JOIN GROUP RIDE  (${activeRideInfo.memberCount} RIDER${activeRideInfo.memberCount !== 1 ? "S" : ""})`
                : "START GROUP RIDE"}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── TAB BAR ── */}
        <View style={[s.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {(["info", "events"] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[s.tab, active && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[s.tabText, { color: active ? colors.accent : colors.mutedForeground }]}>
                  {tab === "info"
                    ? "TRAIL INFO"
                    : events.length > 0
                    ? `EVENTS (${events.length})`
                    : "EVENTS"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── CONTENT ── */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === "info" ? (
            <>
              {/* Difficulty */}
              <View style={[s.card, { backgroundColor: colors.card }]}>
                <Text style={[s.label, { color: colors.mutedForeground }]}>DIFFICULTY</Text>
                <Text style={[s.value, { color: colors.foreground }]}>{trail.difficulty}</Text>
                <DifficultyBar rating={trail.difficultyRating} />
              </View>

              {/* Specs */}
              <View style={s.specsRow}>
                <View style={[s.specCard, { backgroundColor: colors.card }]}>
                  <Feather name="truck" size={18} color={colors.accent} />
                  <Text style={[s.label, { color: colors.mutedForeground }]}>VEHICLE SIZE</Text>
                  <Text style={[s.value, { color: colors.foreground }]}>{trail.size}</Text>
                </View>
                <View style={[s.specCard, { backgroundColor: colors.card }]}>
                  <Feather name="settings" size={18} color={colors.accent} />
                  <Text style={[s.label, { color: colors.mutedForeground }]}>SUSPENSION</Text>
                  <Text style={[s.value, { color: colors.foreground }]}>{trail.suspension}</Text>
                </View>
              </View>

              {/* Permitted Vehicle Types */}
              {trail.vehicleTypes && trail.vehicleTypes.length > 0 && (
                <View style={[s.card, { backgroundColor: colors.card }]}>
                  <Text style={[s.label, { color: colors.mutedForeground }]}>PERMITTED VEHICLES</Text>
                  <View style={s.vehicleRow}>
                    {trail.vehicleTypes.map(vt => {
                      const cfg = VEHICLE_TYPE_CONFIG[vt];
                      return (
                        <View
                          key={vt}
                          style={[s.vehicleBadge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '55' }]}
                        >
                          <Text style={s.vehicleEmoji}>{cfg.emoji}</Text>
                          <Text style={[s.vehicleBadgeLabel, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Community Pics */}
              <View style={[s.card, { backgroundColor: colors.card }]}>
                <View style={s.picHeader}>
                  <Text style={[s.sectionTitle, { color: colors.foreground }]}>COMMUNITY PICS</Text>
                  <TouchableOpacity
                    onPress={onUploadPhoto}
                    disabled={uploading}
                    style={[s.addPicBtn, { borderColor: colors.accent }]}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <Feather name="camera" size={13} color={colors.accent} />
                        <Text style={[s.addPicText, { color: colors.accent }]}>ADD PIC</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                {photos.length === 0 ? (
                  <View style={s.emptyBox}>
                    <Feather name="image" size={28} color={colors.border} />
                    <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No photos yet. Be the first!</Text>
                  </View>
                ) : (
                  <FlatList
                    horizontal
                    data={photos}
                    keyExtractor={(_, i) => String(i)}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingTop: 12, gap: 8 }}
                    renderItem={({ item }) => (
                      <Image source={{ uri: item.url }} style={[s.photo, { borderColor: colors.border }]} />
                    )}
                  />
                )}
              </View>

              {/* Mark as Complete */}
              {(() => {
                const hasRidden = riddenTrailIds.includes(trail.id);
                const locked = !hasRidden && !done;
                return locked ? (
                  <View style={[s.completeBtn, s.completeBtnLocked, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Feather name="lock" size={15} color={colors.mutedForeground} />
                    <View>
                      <Text style={[s.completeBtnText, { color: colors.mutedForeground }]}>MARK AS COMPLETE</Text>
                      <Text style={[s.completeBtnHint, { color: colors.mutedForeground }]}>
                        {hasRoute
                          ? "Follow this trail on the map first"
                          : "Record a ride near this trail first"}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      s.completeBtn,
                      {
                        backgroundColor: done ? colors.card : colors.success,
                        borderColor: done ? colors.success : "transparent",
                        borderWidth: done ? 1 : 0,
                      },
                      completing && { opacity: 0.6 },
                    ]}
                    onPress={onComplete}
                    disabled={completing}
                    activeOpacity={0.85}
                  >
                    {completing ? (
                      <ActivityIndicator color={done ? colors.success : "#fff"} />
                    ) : (
                      <>
                        <Feather name={done ? "check-circle" : "flag"} size={16} color={done ? colors.success : "#fff"} />
                        <Text style={[s.completeBtnText, { color: done ? colors.success : "#fff" }]}>
                          {done ? "TRAIL COMPLETED ✓" : "MARK AS COMPLETE"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })()}

              {/* Add me as contributor — only for area trails (no GPS route) once completed */}
              {done && !hasRoute && user && (
                <TouchableOpacity
                  style={[s.contribToggle, { borderTopColor: colors.border }]}
                  onPress={toggleContributor}
                  disabled={togglingContributor}
                  activeOpacity={0.8}
                >
                  <Feather
                    name="users"
                    size={15}
                    color={isContributor ? colors.success : colors.mutedForeground}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.contribToggleTitle, { color: colors.foreground }]}>
                      Add me as contributor
                    </Text>
                    <Text style={[s.contribToggleSub, { color: colors.mutedForeground }]}>
                      {isContributor
                        ? "You're listed as a contributor to this trail"
                        : "Helped map or verify this trail exists?"}
                    </Text>
                  </View>
                  {togglingContributor ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <View style={[s.contribCheckBox, { backgroundColor: isContributor ? colors.success : colors.border }]}>
                      {isContributor && <Feather name="check" size={12} color="#fff" />}
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {/* Create Event CTA */}
              <TouchableOpacity
                style={[s.createEventBtn, { backgroundColor: colors.accent }]}
                onPress={() => { resetCreateForm(); setShowCreateEvent(true); }}
                activeOpacity={0.85}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={[s.createEventBtnText, { color: "#fff" }]}>CREATE EVENT</Text>
              </TouchableOpacity>

              {/* Calendar */}
              <MiniCalendar
                year={calYear}
                month={calMonth}
                eventDateSet={eventDateSet}
                selectedDate={selectedDate}
                todayStr={todayStr}
                onSelectDate={setSelectedDate}
                onPrevMonth={() => setCalendarMonth(new Date(calYear, calMonth - 1, 1))}
                onNextMonth={() => setCalendarMonth(new Date(calYear, calMonth + 1, 1))}
              />

              {/* Filter chip */}
              {selectedDate && (
                <TouchableOpacity style={s.clearChip} onPress={() => setSelectedDate(null)}>
                  <Feather name="x" size={11} color={colors.mutedForeground} />
                  <Text style={[s.clearChipText, { color: colors.mutedForeground }]}>
                    {selectedDate} — tap to clear
                  </Text>
                </TouchableOpacity>
              )}

              {/* Events list */}
              {displayedEvents.length === 0 ? (
                <View style={s.emptyBox}>
                  <MaterialIcons name="event" size={36} color={colors.border} />
                  <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                    {selectedDate ? "No events on this day" : "No upcoming events"}
                  </Text>
                  <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>
                    Tap "Create Event" to organise a ride!
                  </Text>
                </View>
              ) : (
                displayedEvents.map((event) => {
                  const joined = event.attendees?.some((a) => a.uid === user?.uid);
                  const isOpen = event.visibility === "open";
                  return (
                    <View key={event.id} style={[s.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={s.eventCardTop}>
                        <View style={[s.typeBadge, { borderColor: colors.accent }]}>
                          <Text style={[s.typeBadgeText, { color: colors.accent }]}>{event.eventType}</Text>
                        </View>
                        <View style={[
                          s.visBadge,
                          { backgroundColor: isOpen ? "rgba(0,230,118,0.1)" : "rgba(255,85,0,0.1)" },
                        ]}>
                          <Feather
                            name={isOpen ? "unlock" : "lock"}
                            size={10}
                            color={isOpen ? colors.success : colors.destructive}
                          />
                          <Text style={[s.visBadgeText, { color: isOpen ? colors.success : colors.destructive }]}>
                            {isOpen ? "OPEN" : "CLOSED"}
                          </Text>
                        </View>
                      </View>

                      <Text style={[s.eventTitle, { color: colors.foreground }]}>{event.title}</Text>
                      <Text style={[s.eventMeta, { color: colors.mutedForeground }]}>
                        {event.dateStr} · {event.time} · By {event.createdByName}
                      </Text>
                      {!!event.description && (
                        <Text style={[s.eventDesc, { color: colors.mutedForeground }]}>{event.description}</Text>
                      )}

                      <View style={[s.eventFooter, { borderTopColor: colors.border }]}>
                        <View style={s.attendeeRow}>
                          <Feather name="users" size={13} color={colors.mutedForeground} />
                          <Text style={[s.attendeeCount, { color: colors.mutedForeground }]}>
                            {event.attendees?.length ?? 0} going
                          </Text>
                        </View>
                        {isOpen && (
                          <TouchableOpacity
                            style={[
                              s.joinBtn,
                              {
                                backgroundColor: joined ? colors.secondary : colors.accent,
                                borderColor: joined ? colors.border : colors.accent,
                              },
                            ]}
                            onPress={() => joinOrLeaveEvent(event)}
                            activeOpacity={0.8}
                          >
                            <Text style={[s.joinBtnText, { color: joined ? colors.foreground : colors.accentForeground }]}>
                              {joined ? "LEAVE" : "JOIN"}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {(event.attendees?.length ?? 0) > 0 && (
                        <TouchableOpacity
                          style={[s.attendeesList, { borderTopColor: colors.border }]}
                          onPress={() => setAttendeesEvent(event)}
                          activeOpacity={0.7}
                        >
                          <View style={s.attendeesBtnRow}>
                            <Feather name="users" size={13} color={colors.mutedForeground} />
                            <Text style={[s.attendeesLabel, { color: colors.mutedForeground }]}>
                              {event.attendees.length} ATTENDEE{event.attendees.length !== 1 ? "S" : ""} — TAP TO VIEW
                            </Text>
                          </View>
                          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      </View>

      {/* ── ATTENDEES MODAL ── */}
      <Modal
        visible={!!attendeesEvent}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAttendeesEvent(null)}
      >
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <View style={[s.createHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setAttendeesEvent(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.createHeaderTitle, { color: colors.foreground }]}>
              {attendeesEvent?.attendees?.length ?? 0} ATTENDING
            </Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20 }}
            showsVerticalScrollIndicator={false}
          >
            {attendeesEvent && (
              <>
                <Text style={[s.attendeesEventTitle, { color: colors.mutedForeground }]}>
                  {attendeesEvent.eventType.toUpperCase()} · {attendeesEvent.dateStr}
                </Text>
                <Text style={[s.fieldLabel, { color: colors.foreground, fontSize: 15, marginBottom: 12 }]}>
                  {attendeesEvent.title}
                </Text>
                {attendeesEvent.attendees.map((a, i) => (
                  <View key={a.uid} style={[s.attendeeItem, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={[s.attendeeAvatar, { backgroundColor: colors.accent }]}>
                      <Text style={[s.attendeeAvatarText, { color: colors.accentForeground }]}>
                        {a.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[s.attendeeItemName, { color: colors.foreground }]}>{a.name}</Text>
                    {i === 0 && (
                      <View style={[s.organizerBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[s.organizerBadgeText, { color: colors.mutedForeground }]}>ORGANIZER</Text>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── CONTRIBUTORS MODAL ── */}
      <Modal
        visible={showContributors}
        transparent
        animationType="fade"
        onRequestClose={() => setShowContributors(false)}
      >
        <TouchableOpacity
          style={s.contribOverlay}
          onPress={() => setShowContributors(false)}
          activeOpacity={1}
        >
          <TouchableOpacity
            style={[s.contribSheet, { backgroundColor: colors.card }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={s.contribSheetHandle} />
            <Text style={[s.contribSheetTitle, { color: colors.foreground }]}>Trail Contributors</Text>
            <Text style={[s.contribSheetSub, { color: colors.mutedForeground }]}>
              Riders who helped map or verify this trail
            </Text>
            {contributors.length === 0 ? (
              <View style={s.contribEmpty}>
                <Feather name="users" size={32} color={colors.border} />
                <Text style={[s.contribEmptyText, { color: colors.mutedForeground }]}>No contributors yet</Text>
                {!hasRoute && user && (
                  <Text style={[s.contribEmptyHint, { color: colors.mutedForeground }]}>
                    Complete this trail to add yourself
                  </Text>
                )}
              </View>
            ) : (
              contributors.map((c) => (
                <View key={c.uid} style={[s.contribItem, { borderTopColor: colors.border }]}>
                  <View style={[s.contribAvatar, { backgroundColor: colors.accent + "33" }]}>
                    <Text style={[s.contribInitial, { color: colors.accent }]}>
                      {(c.displayName?.[0] ?? "?").toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[s.contribName, { color: colors.foreground }]} numberOfLines={1}>
                    {c.displayName}
                  </Text>
                  {c.uid === user?.uid && (
                    <View style={[s.youBadge, { backgroundColor: colors.accent }]}>
                      <Text style={s.youBadgeText}>YOU</Text>
                    </View>
                  )}
                </View>
              ))
            )}
            <TouchableOpacity
              style={[s.contribCloseBtn, { backgroundColor: colors.secondary }]}
              onPress={() => setShowContributors(false)}
            >
              <Text style={[s.contribCloseBtnText, { color: colors.foreground }]}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── CREATE EVENT MODAL ── */}
      <Modal
        visible={showCreateEvent}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowCreateEvent(false); resetCreateForm(); }}
      >
        <View style={[s.root, { backgroundColor: colors.background }]}>
          <View style={[s.createHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setShowCreateEvent(false); resetCreateForm(); }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[s.createHeaderTitle, { color: colors.foreground }]}>CREATE EVENT</Text>
            <TouchableOpacity onPress={createEvent} disabled={creatingEvent}>
              {creatingEvent ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[s.saveText, { color: colors.accent }]}>SAVE</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 60 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Trail context */}
            <Text style={[s.createTrailName, { color: colors.mutedForeground }]}>
              {trail.title.toUpperCase()}
            </Text>

            {/* Event name */}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>EVENT NAME *</Text>
            <TextInput
              style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="e.g. Weekend Rubicon Run"
              placeholderTextColor={colors.mutedForeground}
              value={evTitle}
              onChangeText={setEvTitle}
              maxLength={60}
              autoFocus
            />

            {/* Event type */}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>EVENT TYPE</Text>
            <View style={s.typePills}>
              {EVENT_TYPES.map((t) => {
                const active = evType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      s.typePill,
                      {
                        backgroundColor: active ? colors.accent : colors.card,
                        borderColor: active ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => setEvType(t)}
                  >
                    <Text style={[s.typePillText, { color: active ? colors.accentForeground : colors.foreground }]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Date */}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>DATE</Text>
            <TouchableOpacity
              style={[s.fieldRow, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => { setPickerMonth(new Date()); setShowDatePicker(!showDatePicker); }}
              activeOpacity={0.8}
            >
              <Feather name="calendar" size={16} color={colors.accent} />
              <Text style={[s.fieldRowText, { color: colors.foreground }]}>{evDateStr}</Text>
              <Feather name={showDatePicker ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            {showDatePicker && (
              <View style={[s.inlinePicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={cal.header}>
                  <TouchableOpacity onPress={() => setPickerMonth(new Date(pyYear, pyMonth - 1, 1))}>
                    <Feather name="chevron-left" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text style={[cal.monthText, { color: colors.foreground }]}>
                    {MONTH_NAMES[pyMonth]} {pyYear}
                  </Text>
                  <TouchableOpacity onPress={() => setPickerMonth(new Date(pyYear, pyMonth + 1, 1))}>
                    <Feather name="chevron-right" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
                <View style={cal.dayNames}>
                  {DAY_NAMES.map((d, i) => (
                    <Text key={i} style={[cal.dayName, { color: colors.mutedForeground }]}>{d}</Text>
                  ))}
                </View>
                <View style={cal.grid}>
                  {getCalendarDays(pyYear, pyMonth).map((day, i) => {
                    if (!day) return <View key={`pd-${i}`} style={cal.cell} />;
                    const ds = `${pyYear}-${String(pyMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const sel = evDateStr === ds;
                    return (
                      <TouchableOpacity
                        key={ds}
                        style={[cal.cell, sel && { backgroundColor: colors.accent, borderRadius: 20 }]}
                        onPress={() => { setEvDateStr(ds); setShowDatePicker(false); }}
                      >
                        <Text style={[cal.dayNum, { color: sel ? colors.accentForeground : colors.foreground }]}>{day}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Time */}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>TIME (24H FORMAT)</Text>
            <TextInput
              style={[s.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="09:00"
              placeholderTextColor={colors.mutedForeground}
              value={evTime}
              onChangeText={setEvTime}
              maxLength={5}
              keyboardType="numeric"
            />

            {/* Visibility */}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>VISIBILITY</Text>
            <View style={s.visRow}>
              {(["open", "closed"] as const).map((v) => {
                const active = evVisibility === v;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[
                      s.visBtn,
                      {
                        backgroundColor: active ? colors.accent : colors.card,
                        borderColor: active ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => setEvVisibility(v)}
                  >
                    <Feather
                      name={v === "open" ? "unlock" : "lock"}
                      size={14}
                      color={active ? colors.accentForeground : colors.mutedForeground}
                    />
                    <View>
                      <Text style={[s.visBtnTitle, { color: active ? colors.accentForeground : colors.foreground }]}>
                        {v === "open" ? "OPEN" : "CLOSED"}
                      </Text>
                      <Text style={[s.visBtnSub, { color: active ? "rgba(235,228,209,0.75)" : colors.mutedForeground }]}>
                        {v === "open" ? "Anyone can join" : "Invite only"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Description */}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>DESCRIPTION (optional)</Text>
            <TextInput
              style={[s.fieldInput, s.fieldTextarea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Meeting point, vehicle requirements, what to bring..."
              placeholderTextColor={colors.mutedForeground}
              value={evDescription}
              onChangeText={setEvDescription}
              multiline
              numberOfLines={4}
              maxLength={300}
              textAlignVertical="top"
            />

            {/* Save button */}
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: colors.accent }, creatingEvent && { opacity: 0.6 }]}
              onPress={createEvent}
              disabled={creatingEvent}
              activeOpacity={0.85}
            >
              {creatingEvent ? (
                <ActivityIndicator color={colors.accentForeground} />
              ) : (
                <Text style={[s.saveBtnText, { color: colors.accentForeground }]}>CREATE EVENT</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 2 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: "900", letterSpacing: 1 },
  headerSub: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, marginTop: 2 },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 8,
    overflow: "hidden",
  },
  directionsBtn: { backgroundColor: "#1A73E8" },
  actionBtnText: { fontWeight: "800", fontSize: 11, flexShrink: 1 },
  followTrailBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  followTrailText: { fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: { fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  scroll: { flex: 1 },
  card: { borderRadius: 12, padding: 14, marginBottom: 12 },
  specsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  specCard: { flex: 1, borderRadius: 12, padding: 14, gap: 6 },
  vehicleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  vehicleBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  vehicleEmoji: { fontSize: 14 },
  vehicleBadgeLabel: { fontSize: 12, fontWeight: "700" },
  label: { fontSize: 9, fontWeight: "700", letterSpacing: 1, marginTop: 4 },
  value: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  sectionTitle: { fontWeight: "900", fontSize: 13, letterSpacing: 1 },
  picHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addPicBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addPicText: { fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  photo: { width: 100, height: 100, borderRadius: 6, borderWidth: 1 },
  emptyBox: { alignItems: "center", paddingVertical: 28, gap: 8 },
  emptyText: { fontSize: 13, fontWeight: "600" },
  emptyHint: { fontSize: 11 },
  completeBtnLocked: { borderWidth: 1, opacity: 0.75 },
  completeBtnHint: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 10,
    marginTop: 4,
  },
  completeBtnText: { fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  createEventBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 10,
    marginBottom: 14,
  },
  createEventBtnText: { fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  clearChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10,
  },
  clearChipText: { fontSize: 11, fontWeight: "600" },
  eventCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  eventCardTop: { flexDirection: "row", gap: 8, marginBottom: 10, alignItems: "center" },
  typeBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  visBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  visBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  eventTitle: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  eventMeta: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
  eventDesc: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  eventFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, marginTop: 4 },
  attendeeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  attendeeCount: { fontSize: 12, fontWeight: "600" },
  joinBtn: { borderRadius: 6, paddingHorizontal: 16, paddingVertical: 7, borderWidth: 1 },
  joinBtnText: { fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },
  attendeesList: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  attendeesBtnRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  attendeesLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  attendeesNames: { fontSize: 12, fontWeight: "600", lineHeight: 18 },
  attendeesEventTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  attendeeItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderRadius: 10, marginBottom: 8 },
  attendeeAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  attendeeAvatarText: { fontWeight: "900", fontSize: 15 },
  attendeeItemName: { flex: 1, fontSize: 14, fontWeight: "700" },
  organizerBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  organizerBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  // Create event form
  createHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  createHeaderTitle: { fontWeight: "900", fontSize: 14, letterSpacing: 2 },
  saveText: { fontWeight: "900", fontSize: 13, letterSpacing: 1 },
  createTrailName: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 20 },
  fieldLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 8, marginTop: 18 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 13,
    fontSize: 14,
    fontWeight: "600",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 13,
  },
  fieldRowText: { flex: 1, fontSize: 14, fontWeight: "600" },
  fieldTextarea: { minHeight: 100, paddingTop: 13 },
  inlinePicker: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  typePills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typePill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  typePillText: { fontSize: 12, fontWeight: "700" },
  visRow: { flexDirection: "row", gap: 10 },
  visBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  visBtnTitle: { fontSize: 12, fontWeight: "800" },
  visBtnSub: { fontSize: 10, fontWeight: "600", marginTop: 1 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 10,
    marginTop: 24,
  },
  saveBtnText: { fontWeight: "900", fontSize: 14, letterSpacing: 2 },

  // ── Contributors ──────────────────────────────────────────────────────────
  contribBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  contribBarText: { flex: 1, fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  contribToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    marginTop: 4,
  },
  contribToggleTitle: { fontSize: 13, fontWeight: "800" },
  contribToggleSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  contribCheckBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  contribOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  contribSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  contribSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.3)",
    alignSelf: "center",
    marginBottom: 16,
  },
  contribSheetTitle: { fontSize: 16, fontWeight: "900", letterSpacing: 0.5, marginBottom: 4 },
  contribSheetSub: { fontSize: 12, fontWeight: "600", marginBottom: 16 },
  contribEmpty: { alignItems: "center", paddingVertical: 24, gap: 8 },
  contribEmptyText: { fontSize: 13, fontWeight: "700" },
  contribEmptyHint: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  contribItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  contribAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  contribInitial: { fontSize: 15, fontWeight: "900" },
  contribName: { flex: 1, fontSize: 13, fontWeight: "700" },
  youBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  youBadgeText: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  contribCloseBtn: {
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 16,
  },
  contribCloseBtnText: { fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
});
