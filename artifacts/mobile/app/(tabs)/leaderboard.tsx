"use no memo";
import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, onSnapshot } from "firebase/firestore";
import { router } from "expo-router";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const TOTAL_TRAILS = 27;

const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"] as const;
const MEDAL_LABELS = ["1ST", "2ND", "3RD"] as const;

interface LeaderEntry {
  uid: string;
  displayName?: string;
  photoURL?: string;
  completedTrails: string[];
  isPublic: boolean;
}

function Avatar({ photoURL, displayName, size }: { photoURL?: string; displayName?: string; size: number }) {
  const colors = useColors();
  const initial = (displayName?.[0] ?? "?").toUpperCase();

  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ color: colors.accent, fontWeight: "900", fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  );
}

function PodiumCard({ entry, rank, isMe }: { entry: LeaderEntry; rank: number; isMe: boolean }) {
  const colors = useColors();
  const medalColor = MEDAL_COLORS[rank - 1];
  const count = entry.completedTrails?.length ?? 0;
  const pct = Math.round((count / TOTAL_TRAILS) * 100);
  const name = entry.displayName ?? entry.uid.slice(0, 8);

  const handlePress = () => {
    if (entry.isPublic && !isMe) router.push(`/user/${entry.uid}`);
  };

  return (
    <TouchableOpacity
      style={[styles.podiumCard, { backgroundColor: colors.card, borderColor: medalColor }]}
      onPress={handlePress}
      activeOpacity={entry.isPublic && !isMe ? 0.8 : 1}
    >
      {/* Medal badge */}
      <View style={[styles.medalBadge, { backgroundColor: medalColor }]}>
        <Text style={styles.medalLabel}>{MEDAL_LABELS[rank - 1]}</Text>
      </View>

      {isMe && (
        <View style={[styles.youBadge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.youText, { color: "#000" }]}>YOU</Text>
        </View>
      )}

      <Avatar photoURL={entry.photoURL} displayName={name} size={52} />
      <Text style={[styles.podiumName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>

      <Text style={[styles.podiumCount, { color: medalColor }]}>{count}</Text>
      <Text style={[styles.podiumSub, { color: colors.mutedForeground }]}>of {TOTAL_TRAILS} trails</Text>

      {/* Progress bar */}
      <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: medalColor }]} />
      </View>
    </TouchableOpacity>
  );
}

function RankRow({ entry, rank, isMe }: { entry: LeaderEntry; rank: number; isMe: boolean }) {
  const colors = useColors();
  const count = entry.completedTrails?.length ?? 0;
  const pct = Math.round((count / TOTAL_TRAILS) * 100);
  const name = entry.displayName ?? entry.uid.slice(0, 8);

  const handlePress = () => {
    if (entry.isPublic && !isMe) router.push(`/user/${entry.uid}`);
  };

  return (
    <TouchableOpacity
      style={[styles.rankRow, { backgroundColor: isMe ? colors.secondary : colors.card, borderColor: isMe ? colors.accent : colors.border }]}
      onPress={handlePress}
      activeOpacity={entry.isPublic && !isMe ? 0.8 : 1}
    >
      {/* Rank number */}
      <Text style={[styles.rankNum, { color: colors.mutedForeground }]}>
        {String(rank).padStart(2, "0")}
      </Text>

      <Avatar photoURL={entry.photoURL} displayName={name} size={38} />

      <View style={styles.rankInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.rankName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
          {isMe && (
            <View style={[styles.youBadgeSmall, { backgroundColor: colors.accent }]}>
              <Text style={[styles.youTextSmall, { color: "#000" }]}>YOU</Text>
            </View>
          )}
        </View>
        <View style={[styles.progressBg, { backgroundColor: colors.secondary, marginTop: 4 }]}>
          <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: colors.accent }]} />
        </View>
      </View>

      <View style={styles.rankCountCol}>
        <Text style={[styles.rankCount, { color: colors.accent }]}>{count}</Text>
        <Text style={[styles.rankCountSub, { color: colors.mutedForeground }]}>trails</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch ALL users so the leaderboard can include private users (anonymized if needed)
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const list: LeaderEntry[] = [];
      snap.forEach((d) => {
        const data = d.data() as LeaderEntry;
        list.push({ ...data, uid: d.id });
      });
      // Sort by trail count descending
      list.sort((a, b) => (b.completedTrails?.length ?? 0) - (a.completedTrails?.length ?? 0));
      setEntries(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const topThree = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Feather name="award" size={18} color={colors.accent} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>LEADERBOARD</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{TOTAL_TRAILS} TRAILS</Text>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading riders…</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.loader}>
          <Feather name="users" size={40} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No riders yet</Text>
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Podium — top 3 */}
              {topThree.length > 0 && (
                <View style={styles.podiumRow}>
                  {topThree.map((entry, idx) => (
                    <PodiumCard
                      key={entry.uid}
                      entry={entry}
                      rank={idx + 1}
                      isMe={entry.uid === user?.uid}
                    />
                  ))}
                </View>
              )}

              {rest.length > 0 && (
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                  RANKINGS
                </Text>
              )}
            </>
          }
          renderItem={({ item, index }) => (
            <RankRow
              entry={item}
              rank={index + 4}
              isMe={item.uid === user?.uid}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontWeight: "900", fontSize: 16, letterSpacing: 2, flex: 1 },
  headerSub: { fontSize: 10, fontWeight: "700", letterSpacing: 2 },

  loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 12, fontWeight: "600" },
  emptyText: { fontSize: 14, fontWeight: "600" },

  // Podium
  podiumRow: { flexDirection: "row", justifyContent: "center", gap: 10, padding: 16 },
  podiumCard: {
    flex: 1,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 2,
    padding: 12,
    gap: 4,
    position: "relative",
  },
  medalBadge: {
    position: "absolute",
    top: -10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  medalLabel: { fontWeight: "900", fontSize: 10, color: "#000", letterSpacing: 1 },
  youBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youText: { fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  podiumName: { fontWeight: "800", fontSize: 11, textAlign: "center", marginTop: 4 },
  podiumCount: { fontWeight: "900", fontSize: 28, lineHeight: 32 },
  podiumSub: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  // Progress bar
  progressBg: { width: "100%", height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },

  // Rankings list
  sectionLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 3, paddingHorizontal: 20, marginBottom: 8 },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rankNum: { fontWeight: "900", fontSize: 12, fontFamily: "monospace", width: 24, textAlign: "center" },
  rankInfo: { flex: 1 },
  rankName: { fontWeight: "700", fontSize: 13 },
  rankCount: { fontWeight: "900", fontSize: 20, lineHeight: 22, textAlign: "right" },
  rankCountSub: { fontSize: 9, fontWeight: "700", textAlign: "right", letterSpacing: 1 },
  rankCountCol: { alignItems: "flex-end" },
  youBadgeSmall: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  youTextSmall: { fontWeight: "900", fontSize: 8, letterSpacing: 1 },
});
