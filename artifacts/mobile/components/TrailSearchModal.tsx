"use no memo";
import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ALL_TRAILS, type Trail } from "@/lib/trails";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectTrail: (trail: Trail) => void;
}

function diffColor(rating: number) {
  if (rating <= 3) return "#4CAF50";
  if (rating <= 6) return "#FFC107";
  return "#F44336";
}

export default function TrailSearchModal({ visible, onClose, onSelectTrail }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_TRAILS.slice(0, 50);
    return ALL_TRAILS.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.state.toLowerCase().includes(q) ||
        t.region.toLowerCase().includes(q)
    ).slice(0, 80);
  }, [query]);

  function handleClose() {
    setQuery("");
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={handleClose} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={[s.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[s.searchInput, { color: colors.foreground }]}
              placeholder="Search by name, state, or region…"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Count */}
        <Text style={[s.countText, { color: colors.mutedForeground }]}>
          {query.trim()
            ? `${results.length} result${results.length !== 1 ? "s" : ""}`
            : `${ALL_TRAILS.length} trails nationwide — type to search`}
        </Text>

        {/* List */}
        <FlatList
          data={results}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.row, { borderBottomColor: colors.border }]}
              onPress={() => {
                onSelectTrail(item);
                setQuery("");
              }}
              activeOpacity={0.72}
            >
              <View style={[s.dot, { backgroundColor: diffColor(item.difficultyRating) }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.trailTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[s.trailSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.region} · {item.state}
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: colors.secondary }]}>
                <Text style={[s.badgeText, { color: colors.mutedForeground }]}>
                  {item.difficultyRating}/10
                </Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.border} />
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "600" },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  trailTitle: { fontSize: 13, fontWeight: "800" },
  trailSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "700" },
});
