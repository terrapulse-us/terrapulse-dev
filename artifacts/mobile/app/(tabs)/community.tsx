"use no memo";
import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import TerraPulseLogo from "@/components/TerraPulseLogo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { router } from "expo-router";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ALL_TRAILS } from "@/lib/trails";

interface PublicUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  completedTrails: string[];
  achievements: string[];
  isPublic: boolean;
  vehicleSpecs?: {
    make: string;
    model: string;
    year: string;
  };
}

const TRAIL_NAMES: Record<string, string> = Object.fromEntries(
  ALL_TRAILS.map((t) => [t.id, t.title])
);

export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [riders, setRiders] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = query(collection(db, "users"), where("isPublic", "==", true));
    const unsub = onSnapshot(q, (snap) => {
      const list: PublicUser[] = [];
      snap.forEach((d) => {
        const data = d.data() as PublicUser;
        list.push({
          ...data,
          uid: d.id,
          completedTrails: data.completedTrails ?? [],
          achievements: data.achievements ?? [],
        });
      });
      // Sort: current user first, then by badge count
      list.sort((a, b) => {
        if (a.uid === user?.uid) return -1;
        if (b.uid === user?.uid) return 1;
        return (b.achievements?.length ?? 0) - (a.achievements?.length ?? 0);
      });
      setRiders(list);
      setLoading(false);
    }, () => {
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const filtered = search.trim()
    ? riders.filter((r) => {
        const name = r.displayName || r.email || "";
        const rig = r.vehicleSpecs
          ? `${r.vehicleSpecs.year} ${r.vehicleSpecs.make} ${r.vehicleSpecs.model}`
          : "";
        return (
          name.toLowerCase().includes(search.toLowerCase()) ||
          rig.toLowerCase().includes(search.toLowerCase())
        );
      })
    : riders;

  const renderRider = ({ item, index }: { item: PublicUser; index: number }) => {
    const handle = item.displayName || item.email?.split("@")[0] || "rider";
    const rig = item.vehicleSpecs?.make && item.vehicleSpecs?.model
      ? `${item.vehicleSpecs.year ? item.vehicleSpecs.year + " " : ""}${item.vehicleSpecs.make} ${item.vehicleSpecs.model}`
      : null;
    const trailsCompleted = item.completedTrails?.length ?? 0;
    const badgesEarned = item.achievements?.length ?? 0;
    const isMe = item.uid === user?.uid;

    const rankColors = ["#D4AF37", "#A9A9A9", "#B5722C"];
    const rankLabels = ["Gold", "Silver", "Bronze"];
    const isTop3 = index < 3;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: isTop3 ? "#000" : colors.border, borderWidth: isTop3 ? 2 : 1 }]}
        onPress={() => router.push(`/user/${item.uid}`)}
        activeOpacity={0.85}
      >
        {item.photoURL && !isTop3 ? (
          <Image
            source={{ uri: item.photoURL }}
            style={[styles.avatar, { borderColor: colors.border, borderWidth: 2 }]}
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.secondary, borderColor: isTop3 ? "#000" : colors.border }]}>
            {isTop3 ? (
              <Text
                style={[styles.rankText, { color: rankColors[index] }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {rankLabels[index]}
              </Text>
            ) : (
              <Text style={[styles.avatarText, { color: colors.accent }]}>
                {handle[0].toUpperCase()}
              </Text>
            )}
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={styles.cardTop}>
            <Text style={[styles.handle, { color: colors.foreground }]} numberOfLines={1}>
              {handle.toUpperCase()}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {isMe && (
                <View style={[styles.youBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.youBadgeText}>YOU</Text>
                </View>
              )}
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          </View>
          {rig && (
            <Text style={[styles.rig, { color: colors.accent }]} numberOfLines={1}>
              {rig}
            </Text>
          )}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Feather name="flag" size={11} color={colors.mutedForeground} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                {trailsCompleted} TRAIL{trailsCompleted !== 1 ? "S" : ""}
              </Text>
            </View>
            <View style={styles.stat}>
              <Feather name="award" size={11} color={colors.mutedForeground} />
              <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                {badgesEarned} BADGE{badgesEarned !== 1 ? "S" : ""}
              </Text>
            </View>
            {item.completedTrails?.slice(0, 2).map((tid) => (
              <View key={tid} style={[styles.trailPill, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.trailPillText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {TRAIL_NAMES[tid] ?? tid}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TerraPulseLogo color={colors.primary} size="md" />
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {riders.length} RIDER{riders.length !== 1 ? "S" : ""}
          </Text>
        </View>
      </View>

      {/* SEARCH */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search riders or rigs..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>LOADING RIDERS...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="users" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {search ? "No riders match" : "No public riders yet"}
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {search
              ? "Try a different search"
              : "Set your profile to Public in the Profile tab to appear here"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uid}
          renderItem={renderRider}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

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
  title: { fontWeight: "900", fontSize: 18, letterSpacing: 2 },
  subtitle: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  list: { padding: 12, gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "900" },
  rankText: { fontSize: 9, fontWeight: "900", paddingHorizontal: 2 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  handle: { fontWeight: "900", fontSize: 13, letterSpacing: 1, flex: 1 },
  rig: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  statsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 10, fontWeight: "700" },
  trailPill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  trailPillText: { fontSize: 9, fontWeight: "700" },
  youBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  youBadgeText: { fontSize: 9, fontWeight: "900", color: "#000", letterSpacing: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  loadingText: { fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 8 },
  emptyTitle: { fontWeight: "900", fontSize: 16, textAlign: "center" },
  emptySub: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});
