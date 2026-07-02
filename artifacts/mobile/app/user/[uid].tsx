"use no memo";
import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { router, useLocalSearchParams } from "expo-router";
import { db } from "@/lib/firebase";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_SIZE = (SCREEN_WIDTH - 4) / 3;

const ALL_ACHIEVEMENTS = [
  // Milestones
  { id: "first_trail",   title: "Trail Breaker",         description: "Complete your first trail",       icon: "flag" },
  { id: "trails_3",      title: "Trail Veteran",          description: "Complete 3 trails",               icon: "trending-up" },
  { id: "trails_6",      title: "Half Dozen Hero",        description: "Complete 6 trails",               icon: "layers" },
  { id: "trails_10",     title: "Trail Addict",           description: "Complete 10 trails",              icon: "zap" },
  { id: "trails_20",     title: "CA Trail Legend",        description: "Complete 20 trails",              icon: "star" },
  { id: "trails_27",     title: "Ultimate OHV Master",    description: "Conquer all 27 CA trails",        icon: "award" },
  // Regional
  { id: "regional_nocal",  title: "NorCal Dominator",    description: "Complete all NorCal trails",      icon: "triangle" },
  { id: "regional_socal",  title: "SoCal Dominator",     description: "Complete all SoCal trails",       icon: "sun" },
  { id: "regional_desert", title: "Desert Demon",        description: "Complete all desert trails",      icon: "thermometer" },
  { id: "dunes_king",      title: "Dunes King",          description: "Hit both Pismo & Dumont Dunes",   icon: "wind" },
  // Special
  { id: "beta_explorer",   title: "Beta Explorer",       description: "Founding beta tester of TerraPulse", icon: "cpu" },
  { id: "went_live",       title: "Broadcaster",         description: "Go live from a trail",            icon: "radio" },
  // Per-trail
  { id: "trail_rubicon",        title: "Rubicon Conqueror",      description: "Conquer the legendary Rubicon Trail",       icon: "shield" },
  { id: "trail_hungry_valley",  title: "Hungry Valley Crusher",  description: "Tear up Hungry Valley SVRA",                icon: "activity" },
  { id: "trail_johnson_valley", title: "Hammertown Hero",        description: "King of the Hammers — Johnson Valley",      icon: "shield" },
  { id: "trail_big_bear",       title: "Big Bear Bandit",        description: "Shred the Big Bear OHV trails",             icon: "activity" },
  { id: "trail_ocotillo",       title: "Desert Rat",             description: "Conquer Ocotillo Wells SVRA",               icon: "sun" },
  { id: "trail_fordyce",        title: "Fordyce Legend",         description: "Tackle the gnarly Fordyce Lake Trail",      icon: "star" },
  { id: "trail_hollister",      title: "Hollister Hills Handler",description: "Rip through Hollister Hills SVRA",          icon: "zap" },
  { id: "trail_pismo",          title: "Dune Runner",            description: "Cruise Oceano Dunes at Pismo Beach",        icon: "wind" },
  { id: "trail_dumont",         title: "Sand Dune King",         description: "Conquer the massive Dumont Dunes",          icon: "wind" },
  { id: "trail_stoddard",       title: "Stoddard Slayer",        description: "Dominate Stoddard Valley OHV",              icon: "activity" },
  { id: "trail_dove_springs",   title: "Jawbone Warrior",        description: "Battle through Dove Springs / Jawbone",     icon: "zap" },
  { id: "trail_carnegie",       title: "Bay Area Brawler",       description: "Rip Carnegie SVRA",                         icon: "activity" },
  { id: "trail_prairie_city",   title: "Capital Crusher",        description: "Tear up Prairie City SVRA",                 icon: "flag" },
  { id: "trail_el_mirage",      title: "Mirage Maker",           description: "Blast across El Mirage OHV",               icon: "sun" },
  { id: "trail_ballinger",      title: "Central Coast Crusher",  description: "Conquer Ballinger Canyon OHV",              icon: "map-pin" },
  { id: "trail_rowher",         title: "LA Hills Shredder",      description: "Rip Rowher Flats OHV",                      icon: "activity" },
  { id: "trail_corral_canyon",  title: "Canyon Carver",          description: "Carve through Corral Canyon OHV",           icon: "scissors" },
  { id: "trail_cleghorn",       title: "Ridge Runner",           description: "Conquer Cleghorn Ridge OHV",                icon: "trending-up" },
  { id: "trail_saline_valley",  title: "Death Valley Drifter",   description: "Traverse the remote Saline Valley Road",    icon: "thermometer" },
  { id: "trail_mojave_road",    title: "Mojave Pioneer",         description: "Follow the historic Mojave Road",           icon: "compass" },
  { id: "trail_mammoth_bar",    title: "Mammoth Masher",         description: "Tackle Mammoth Bar OHV trails",             icon: "layers" },
  { id: "trail_alamo",          title: "Alamo Maverick",         description: "Summit Alamo Mountain OHV",                 icon: "triangle" },
  { id: "trail_surprise_canyon",title: "Panamint Pioneer",       description: "Explore the legendary Surprise Canyon",     icon: "star" },
  { id: "trail_picacho",        title: "Imperial Explorer",      description: "Ride Picacho State Recreation Area",        icon: "compass" },
  { id: "trail_randsburg",      title: "Ghost Town Raider",      description: "Raid the trails around Randsburg OHV",      icon: "anchor" },
  { id: "trail_bodie",          title: "High Desert Drifter",    description: "Drift through Bodie Hills OHV",             icon: "wind" },
  { id: "trail_plumas",         title: "Sierra Norte Shredder",  description: "Shred Plumas Eureka OHV trails",            icon: "triangle" },
];

const TRAIL_NAMES: Record<string, string> = {
  "1":  "Rubicon Trail",
  "2":  "Hungry Valley SVRA",
  "3":  "Johnson Valley (KOH)",
  "4":  "Big Bear OHV",
  "5":  "Ocotillo Wells",
  "6":  "Fordyce Lake",
  "7":  "Hollister Hills SVRA",
  "8":  "Oceano Dunes (Pismo)",
  "9":  "Dumont Dunes",
  "10": "Stoddard Valley",
  "11": "Dove Springs / Jawbone",
  "12": "Carnegie SVRA",
  "13": "Prairie City SVRA",
  "14": "El Mirage OHV",
  "15": "Ballinger Canyon",
  "16": "Rowher Flats",
  "17": "Corral Canyon",
  "18": "Cleghorn Ridge",
  "19": "Saline Valley Road",
  "20": "Mojave Road",
  "21": "Mammoth Bar OHV",
  "22": "Alamo Mountain",
  "23": "Surprise Canyon",
  "24": "Picacho SRA",
  "25": "Randsburg OHV",
  "26": "Bodie Hills OHV",
  "27": "Plumas Eureka OHV",
};

type Section = "gallery" | "trails" | "achievements" | "specs";

export default function PublicProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uid } = useLocalSearchParams<{ uid: string }>();

  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [gallery, setGallery] = useState<{ url: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("gallery");
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (!data.isPublic) {
          Alert.alert("Private Profile", "This user's profile is private.");
          router.back();
          return;
        }
        setProfileData(data);
      }
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(db, "users", uid, "gallery"), (snap) => {
      const items: { url: string; type: string; uploadedAt: number }[] = [];
      snap.forEach((d) => items.push(d.data() as { url: string; type: string; uploadedAt: number }));
      items.sort((a, b) => b.uploadedAt - a.uploadedAt);
      setGallery(items);
    });
    return unsub;
  }, [uid]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!profileData) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Profile not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.accent, marginTop: 12, fontWeight: "700" }}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handle = (profileData.displayName as string) || (profileData.email as string)?.split("@")[0] || "rider";
  const earnedIds: string[] = (profileData.achievements as string[]) ?? [];
  const achievementDates: Record<string, number> = (profileData.achievementDates as Record<string, number>) ?? {};
  const completedTrails: string[] = (profileData.completedTrails as string[]) ?? [];
  const specs = profileData.vehicleSpecs as Record<string, string> | undefined;

  const SECTIONS: { key: Section; icon: string; label: string }[] = [
    { key: "gallery", icon: "image", label: "GALLERY" },
    { key: "trails", icon: "flag", label: "TRAILS" },
    { key: "achievements", icon: "award", label: "BADGES" },
    { key: "specs", icon: "truck", label: "RIG" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          RIDER PROFILE
        </Text>
        <View style={{ width: 34 }} />
      </View>

      {/* HERO CARD */}
      <View style={[styles.hero, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {profileData.photoURL ? (
          <Image
            source={{ uri: profileData.photoURL as string }}
            style={[styles.avatar, { borderColor: colors.accent }]}
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.secondary, borderColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.accent }]}>
              {handle[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.heroInfo}>
          <Text style={[styles.handle, { color: colors.foreground }]}>
            {handle.toUpperCase()}
          </Text>
          {specs?.make && (
            <Text style={[styles.rigLine, { color: colors.accent }]}>
              {[specs.year, specs.make, specs.model].filter(Boolean).join(" ")}
            </Text>
          )}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatNum, { color: colors.foreground }]}>{completedTrails.length}</Text>
              <Text style={[styles.heroStatLabel, { color: colors.mutedForeground }]}>TRAILS</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatNum, { color: colors.foreground }]}>{earnedIds.length}</Text>
              <Text style={[styles.heroStatLabel, { color: colors.mutedForeground }]}>BADGES</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatNum, { color: colors.foreground }]}>{gallery.length}</Text>
              <Text style={[styles.heroStatLabel, { color: colors.mutedForeground }]}>PHOTOS</Text>
            </View>
          </View>
        </View>
      </View>

      {/* SECTION TABS */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tab, section === s.key && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setSection(s.key)}
          >
            <Feather name={s.icon as keyof typeof Feather.glyphMap} size={14} color={section === s.key ? colors.accent : colors.mutedForeground} />
            <Text style={[styles.tabText, { color: section === s.key ? colors.accent : colors.mutedForeground }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* GALLERY */}
      {section === "gallery" && (
        gallery.length === 0 ? (
          <View style={styles.center}>
            <Feather name="camera" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No photos yet</Text>
          </View>
        ) : (
          <FlatList
            data={gallery}
            keyExtractor={(_, i) => String(i)}
            numColumns={3}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setLightboxUri(item.url)}>
                <Image source={{ uri: item.url }} style={{ width: GRID_SIZE, height: GRID_SIZE, margin: 1 }} />
                {item.type === "video" && (
                  <View style={styles.videoOverlay}>
                    <Feather name="play" size={18} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        )
      )}

      {/* TRAILS */}
      {section === "trails" && (
        <ScrollView contentContainerStyle={[styles.sectionPad, { paddingBottom: insets.bottom + 20 }]}>
          {completedTrails.length === 0 ? (
            <View style={styles.center}>
              <Feather name="map" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No trails completed yet</Text>
            </View>
          ) : (
            completedTrails.map((tid) => (
              <View key={tid} style={[styles.trailCard, { backgroundColor: colors.card, borderColor: colors.success }]}>
                <View style={[styles.trailCheck, { backgroundColor: colors.success }]}>
                  <Feather name="check" size={14} color="#000" />
                </View>
                <Text style={[styles.trailName, { color: colors.foreground }]}>
                  {TRAIL_NAMES[tid] ?? `Trail ${tid}`}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ACHIEVEMENTS */}
      {section === "achievements" && (
        <ScrollView contentContainerStyle={[styles.sectionPad, { paddingBottom: insets.bottom + 20 }]}>
          {ALL_ACHIEVEMENTS.map((ach) => {
            const unlocked = earnedIds.includes(ach.id);
            return (
              <View
                key={ach.id}
                style={[
                  styles.achCard,
                  { backgroundColor: unlocked ? colors.card : colors.secondary, borderColor: unlocked ? colors.accent : colors.border, opacity: unlocked ? 1 : 0.45 },
                ]}
              >
                <View style={[styles.achIcon, { backgroundColor: unlocked ? colors.accent : colors.border }]}>
                  <Feather name={ach.icon as keyof typeof Feather.glyphMap} size={18} color={unlocked ? "#000" : "#555"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.achTitle, { color: unlocked ? colors.foreground : colors.mutedForeground }]}>
                    {ach.title}
                  </Text>
                  <Text style={[styles.achDesc, { color: colors.mutedForeground }]}>{ach.description}</Text>
                  {unlocked && achievementDates[ach.id] && (
                    <Text style={[styles.achDate, { color: colors.accent }]}>
                      ✓ {new Date(achievementDates[ach.id]).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                {unlocked && <Feather name="check-circle" size={20} color={colors.accent} />}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* RIG SPECS */}
      {section === "specs" && (
        <ScrollView contentContainerStyle={[styles.sectionPad, { paddingBottom: insets.bottom + 20 }]}>
          {!specs || (!specs.make && !specs.model) ? (
            <View style={styles.center}>
              <Feather name="truck" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No rig specs added</Text>
            </View>
          ) : (
            <View style={[styles.specsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {([
                { label: "YEAR", value: specs.year },
                { label: "MAKE", value: specs.make },
                { label: "MODEL", value: specs.model },
                { label: "TIRE SIZE", value: specs.tireSize },
                { label: "SUSPENSION", value: specs.suspension },
                { label: "MODS", value: specs.mods },
              ] as { label: string; value: string }[])
                .filter((f) => f.value)
                .map((f) => (
                  <View key={f.label} style={[styles.specRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.specLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                    <Text style={[styles.specValue, { color: colors.foreground }]}>{f.value}</Text>
                  </View>
                ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* LIGHTBOX */}
      {lightboxUri && (
        <View style={styles.lightbox}>
          <TouchableOpacity style={[styles.lightboxClose, { top: insets.top + 12 }]} onPress={() => setLightboxUri(null)}>
            <Feather name="x" size={26} color="#FFF" />
          </TouchableOpacity>
          <Image source={{ uri: lightboxUri }} style={styles.lightboxImg} resizeMode="contain" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontWeight: "900", fontSize: 14, letterSpacing: 2 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderBottomWidth: 1,
  },
  avatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 24, fontWeight: "900" },
  heroInfo: { flex: 1 },
  handle: { fontWeight: "900", fontSize: 16, letterSpacing: 1.5 },
  rigLine: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 16 },
  heroStat: { alignItems: "center" },
  heroStatNum: { fontWeight: "900", fontSize: 18 },
  heroStatLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  statDivider: { width: 1, height: 24 },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10 },
  tabText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  sectionPad: { padding: 16, gap: 10 },
  trailCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  trailCheck: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  trailName: { fontWeight: "700", fontSize: 14 },
  achCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  achIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  achTitle: { fontWeight: "900", fontSize: 13 },
  achDesc: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  achDate: { fontSize: 10, fontWeight: "700", marginTop: 4 },
  specsCard: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  specRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 14, borderBottomWidth: 1 },
  specLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  specValue: { fontSize: 13, fontWeight: "700", flex: 1, textAlign: "right", paddingLeft: 12 },
  emptyText: { fontSize: 13, fontWeight: "600" },
  videoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)", margin: 1 },
  lightbox: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.96)", alignItems: "center", justifyContent: "center" },
  lightboxClose: { position: "absolute", right: 20, zIndex: 10 },
  lightboxImg: { width: "100%", height: "80%" },
});
