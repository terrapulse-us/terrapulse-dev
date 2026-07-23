"use no memo";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQueryClient } from "@tanstack/react-query";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  useListAssistantConversations,
  useCreateAssistantConversation,
  useGetAssistantConversation,
  getListAssistantConversationsQueryKey,
  getGetAssistantConversationQueryKey,
  type AssistantConversationWithMessages,
  type AssistantVehicleProfile,
  type AssistantItinerary,
  type AssistantCoverageWarning,
} from "@workspace/api-client-react";
import "@/lib/api-client";
import { streamAssistantMessage, type AssistantStreamEvent, type AssistantMode } from "@/lib/assistant-api";
import { downloadTrailArea } from "@/lib/offline-maps";
import { useAuth } from "@/context/AuthContext";
import { useActivityMode } from "@/context/ActivityModeContext";
import { useColors } from "@/hooks/useColors";
import { db } from "@/lib/firebase";
import FormattedMessageText from "@/components/FormattedMessageText";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[] | null;
  pending?: boolean;
  itinerary?: AssistantItinerary | null;
  coverageWarning?: AssistantCoverageWarning | null;
}

const TOOL_LABELS: Record<string, string> = {
  get_trail_briefing: "Checking trail data & weather…",
  find_campgrounds_near_trail: "Looking up nearby campgrounds…",
  check_vehicle_fit: "Checking your rig against this trail…",
  web_search: "Searching the web…",
  check_cell_coverage: "Estimating cell coverage…",
  present_itinerary: "Building your itinerary…",
};

const MODE_OPTIONS: Array<{ id: AssistantMode; emoji: string; label: string }> = [
  { id: "offroad", emoji: "🏔️", label: "Offroad" },
  { id: "camping", emoji: "⛺", label: "Camping" },
  { id: "hiking",  emoji: "🥾", label: "Hiking" },
];

const MODE_TITLES: Record<AssistantMode, string> = {
  offroad: "Offroad Chat",
  camping: "Camping Chat",
  hiking:  "Hiking Chat",
};

const MODE_EMPTY_TEXT: Record<AssistantMode, string> = {
  offroad: "Ask about a trail's conditions, whether your rig can handle it, or nearby camping.",
  camping: "Ask about campgrounds, dispersed camping spots, fire restrictions, or overlanding routes.",
  hiking:  "Ask about a hike's conditions, permits, gear recommendations, or best seasons.",
};

const MODE_PLACEHOLDER: Record<AssistantMode, string> = {
  offroad: "Ask about a trail, weather, or camping…",
  camping: "Ask about campgrounds, road conditions, or trip planning…",
  hiking:  "Ask about a hike, permits, gear, or weather…",
};

export default function AssistantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const queryClient = useQueryClient();

  const [vehicleProfile, setVehicleProfile] = useState<AssistantVehicleProfile>({});
  const [mode, setMode] = useState<AssistantMode>("offroad");
  const [conversationIds, setConversationIds] = useState<Record<AssistantMode, number | null>>({ offroad: null, camping: null, hiking: null });
  const conversationId = conversationIds[mode];
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [streamingItinerary, setStreamingItinerary] = useState<AssistantItinerary | null>(null);
  const [streamingCoverageWarning, setStreamingCoverageWarning] =
    useState<AssistantCoverageWarning | null>(null);
  const [downloadingTrailId, setDownloadingTrailId] = useState<string | null>(null);
  const [downloadedTrailIds, setDownloadedTrailIds] = useState<Set<string>>(new Set());
  const [savedItineraryIds, setSavedItineraryIds] = useState<Set<string>>(new Set());
  const [savingItineraryId, setSavingItineraryId] = useState<string | null>(null);
  const listRef = useRef<FlatList<DisplayMessage>>(null);

  // Follow the app-wide activity mode (adventure page pills / map filter switcher)
  const { mode: activityMode } = useActivityMode();
  useEffect(() => {
    setMode(activityMode);
    setErrorMsg(null);
  }, [activityMode]);

  // Params handed off from the Adventure start page: preselect mode + prefill prompt
  const params = useLocalSearchParams<{ mode?: string; prompt?: string }>();
  const consumedParamsRef = useRef(false);
  useEffect(() => {
    if (consumedParamsRef.current) return;
    const paramMode = typeof params.mode === "string" ? params.mode : undefined;
    const paramPrompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
    if (!paramMode && !paramPrompt) return;
    consumedParamsRef.current = true;
    if (paramMode === "offroad" || paramMode === "camping" || paramMode === "hiking") {
      setMode(paramMode);
      setErrorMsg(null);
    }
    if (paramPrompt) setInput(paramPrompt);
    // Clear the handoff params so a screen remount can't re-inject a stale prompt
    router.setParams({ mode: undefined, prompt: undefined });
  }, [params.mode, params.prompt]);

  const handleDownloadOfflineMap = (warning: AssistantCoverageWarning) => {
    if (downloadingTrailId) return;
    setDownloadingTrailId(warning.trailId);
    downloadTrailArea(
      { id: warning.trailId, title: warning.trailTitle, lat: warning.lat, lng: warning.lng },
      {
        onAlreadySaved: () => {
          setDownloadingTrailId(null);
          setDownloadedTrailIds((prev) => new Set(prev).add(warning.trailId));
          Alert.alert("Already saved", "This trail area is already available offline.");
        },
        onComplete: () => {
          setDownloadingTrailId(null);
          setDownloadedTrailIds((prev) => new Set(prev).add(warning.trailId));
          Alert.alert("Saved offline!", "Trail map downloaded. Works without cell service now.");
        },
        onError: (message) => {
          setDownloadingTrailId(null);
          Alert.alert("Download failed", message);
        },
      },
    );
  };

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      const specs = snap.data()?.vehicleSpecs as
        | { liftIn?: number; tireDiameterIn?: number; hasLockers?: boolean; hasLowRange?: boolean; drivetrain?: string | null }
        | undefined;
      setVehicleProfile({
        liftIn: specs?.liftIn || undefined,
        tireDiameterIn: specs?.tireDiameterIn || undefined,
        hasLockers: !!specs?.hasLockers,
        hasLowRange: !!specs?.hasLowRange,
        drivetrain:
          specs?.drivetrain === "2x4" || specs?.drivetrain === "4x4"
            ? specs.drivetrain
            : undefined,
      });
    });
    return unsub;
  }, [uid]);

  // Track which itineraries this user has saved so cards can show a
  // "Saved" state; the same collection powers My Itineraries in the garage.
  useEffect(() => {
    if (!uid) { setSavedItineraryIds(new Set()); return; }
    const unsub = onSnapshot(
      collection(db, "users", uid, "itineraries"),
      (snap) => setSavedItineraryIds(new Set(snap.docs.map((d) => d.id))),
      () => {},
    );
    return unsub;
  }, [uid]);

  const handleSaveItinerary = async (messageId: string, itinerary: AssistantItinerary) => {
    if (!uid || savingItineraryId) return;
    setSavingItineraryId(messageId);
    try {
      // Firestore rejects undefined values — strip unset optional fields.
      const clean = JSON.parse(JSON.stringify(itinerary)) as AssistantItinerary;
      await setDoc(doc(db, "users", uid, "itineraries", `msg_${messageId}`), {
        ...clean,
        mode,
        savedAt: serverTimestamp(),
      });
    } catch {
      Alert.alert("Save failed", "Could not save this itinerary. Please try again.");
    } finally {
      setSavingItineraryId(null);
    }
  };

  const authHeaders = useMemo(() => ({ "X-User-Id": uid }), [uid]);

  const { data: conversations, isLoading: loadingList } = useListAssistantConversations({
    query: { queryKey: getListAssistantConversationsQueryKey(), enabled: !!uid },
    request: { headers: authHeaders },
  });

  const createConversation = useCreateAssistantConversation({
    request: { headers: authHeaders },
  });

  useEffect(() => {
    if (!uid || loadingList || conversations === undefined) return;
    setConversationIds(prev => {
      const next = { ...prev };
      if (next.offroad === null && conversations.length > 0) {
        next.offroad = conversations[0].id;
      }
      if (next.camping === null) {
        const found = conversations.find(c => c.title === "Camping Chat");
        if (found) next.camping = found.id;
      }
      if (next.hiking === null) {
        const found = conversations.find(c => c.title === "Hiking Chat");
        if (found) next.hiking = found.id;
      }
      return next;
    });
  }, [uid, loadingList, conversations]);

  const { data: conversation, isLoading: loadingConversation } = useGetAssistantConversation(
    conversationId ?? 0,
    {
      query: {
        queryKey: getGetAssistantConversationQueryKey(conversationId ?? 0),
        enabled: conversationId !== null,
      },
      request: { headers: authHeaders },
    },
  );

  const handleNewChat = () => {
    if (sending) return;
    setErrorMsg(null);
    createConversation.mutate(
      { data: { title: MODE_TITLES[mode] } },
      {
        onSuccess: (created) => {
          setConversationIds(prev => ({ ...prev, [mode]: created.id }));
          setStreamingText("");
          setActiveTool(null);
        },
      },
    );
  };

  const messages: DisplayMessage[] = useMemo(() => {
    const base: DisplayMessage[] = (conversation?.messages ?? []).map((m) => ({
      id: String(m.id),
      role: m.role,
      content: m.content,
      toolsUsed: m.toolsUsed,
      itinerary: m.structuredData?.itinerary,
      coverageWarning: m.structuredData?.coverageWarning,
    }));
    if (sending) {
      base.push({
        id: "streaming",
        role: "assistant",
        content: streamingText,
        pending: true,
        itinerary: streamingItinerary,
        coverageWarning: streamingCoverageWarning,
      });
    }
    return base;
  }, [conversation, sending, streamingText, streamingItinerary, streamingCoverageWarning]);

  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, streamingText]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending || !uid) return;

    setInput("");
    setErrorMsg(null);
    setSending(true);
    setStreamingText("");
    setActiveTool(null);
    setStreamingItinerary(null);
    setStreamingCoverageWarning(null);

    // Lazy-create the conversation on first send so the input is never locked
    let cid = conversationId;
    if (cid === null) {
      try {
        const created = await createConversation.mutateAsync({ data: { title: MODE_TITLES[mode] } });
        cid = created.id;
        setConversationIds(prev => ({ ...prev, [mode]: created.id }));
      } catch {
        setErrorMsg("Could not start a conversation. Please check your connection and try again.");
        setSending(false);
        return;
      }
    }

    queryClient.setQueryData(
      getGetAssistantConversationQueryKey(cid),
      (old: AssistantConversationWithMessages | undefined) =>
        old
          ? {
              ...old,
              messages: [
                ...old.messages,
                {
                  id: -Date.now(),
                  conversationId: cid,
                  role: "user" as const,
                  content,
                  toolsUsed: null,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : old,
    );

    try {
      await streamAssistantMessage(
        cid,
        uid,
        content,
        vehicleProfile,
        (event: AssistantStreamEvent) => {
          if (event.type === "tool_call") {
            setActiveTool(event.tool);
          } else if (event.type === "text") {
            setActiveTool(null);
            setStreamingText((prev) => prev + event.content);
          } else if (event.type === "coverage_warning") {
            setStreamingCoverageWarning(event.coverageWarning);
          } else if (event.type === "itinerary") {
            setStreamingItinerary(event.itinerary);
          } else if (event.type === "error") {
            setErrorMsg(event.message);
          }
        },
        mode,
      );
    } finally {
      setSending(false);
      setActiveTool(null);
      setStreamingText("");
      setStreamingItinerary(null);
      setStreamingCoverageWarning(null);
      queryClient.invalidateQueries({
        queryKey: getGetAssistantConversationQueryKey(cid),
      });
    }
  };

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const renderMessage = ({ item }: { item: DisplayMessage }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          {item.pending && item.content.length === 0 ? (
            activeTool ? (
              <View style={styles.toolRow}>
                <ActivityIndicator size="small" color={colors.mutedForeground} />
                <Text style={styles.toolText}>{TOOL_LABELS[activeTool] ?? "Thinking…"}</Text>
              </View>
            ) : (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            )
          ) : (
            <FormattedMessageText
              content={item.content}
              textStyle={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}
            />
          )}
          {!!item.toolsUsed?.length && (
            <Text style={styles.toolsUsedTag}>
              Used: {item.toolsUsed.join(", ")}
            </Text>
          )}
        </View>
        {!!item.coverageWarning && (
          <View style={[styles.coverageCard, styles.bubble]}>
            <View style={styles.coverageHeader}>
              <Feather
                name={item.coverageWarning.level === "poor" ? "wifi-off" : "alert-triangle"}
                size={14}
                color={colors.destructive}
              />
              <Text style={styles.coverageTitle}>
                {item.coverageWarning.level === "poor" ? "Poor" : "Patchy"} cell coverage near{" "}
                {item.coverageWarning.trailTitle}
              </Text>
            </View>
            <Text style={styles.coverageNote}>{item.coverageWarning.note}</Text>
            {downloadedTrailIds.has(item.coverageWarning.trailId) ? (
              <View style={styles.coverageDownloadBtnDone}>
                <Feather name="check-circle" size={14} color={colors.mutedForeground} />
                <Text style={styles.coverageDownloadTextDone}>Offline map saved</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.coverageDownloadBtn}
                onPress={() => handleDownloadOfflineMap(item.coverageWarning!)}
                disabled={downloadingTrailId === item.coverageWarning.trailId}
              >
                {downloadingTrailId === item.coverageWarning.trailId ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="download" size={14} color={colors.primaryForeground} />
                )}
                <Text style={styles.coverageDownloadText}>
                  {downloadingTrailId === item.coverageWarning.trailId
                    ? "Downloading…"
                    : "Download offline map"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {!!item.itinerary && (() => {
          const it = item.itinerary;
          const hasCoords =
            typeof it.destinationLat === "number" && typeof it.destinationLng === "number";
          const saved = savedItineraryIds.has(`msg_${item.id}`);
          const saving = savingItineraryId === item.id;
          const notes: Array<{ icon: React.ComponentProps<typeof Feather>["name"]; text: string }> = [
            ...(it.cellNote ? [{ icon: "wifi-off" as const, text: it.cellNote }] : []),
            ...(it.waterNote ? [{ icon: "droplet" as const, text: it.waterNote }] : []),
            ...(it.shelterNote ? [{ icon: "home" as const, text: it.shelterNote }] : []),
            ...(it.packingNote ? [{ icon: "package" as const, text: it.packingNote }] : []),
          ];
          return (
            <View style={[styles.itineraryCard, styles.bubble]}>
              <View style={styles.itineraryHeader}>
                <Feather name="map" size={15} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itineraryTitle}>{it.title}</Text>
                  {!!it.dates && <Text style={styles.itineraryDates}>{it.dates}</Text>}
                </View>
              </View>
              {!!it.destinationName && (
                <View style={styles.itineraryDayMetaRow}>
                  <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                  <Text style={styles.itineraryDestination}>{it.destinationName}</Text>
                </View>
              )}
              {it.days.map((day) => (
                <View key={day.day} style={styles.itineraryDay}>
                  <View style={styles.itineraryDayBadge}>
                    <Text style={styles.itineraryDayBadgeText}>D{day.day}</Text>
                  </View>
                  <View style={styles.itineraryDayBody}>
                    {!!day.date && <Text style={styles.itineraryDayDate}>{day.date}</Text>}
                    {!!(day.plan || day.trailWindow) && (
                      <Text style={styles.itineraryDayLine}>{day.plan || day.trailWindow}</Text>
                    )}
                    {!!(day.plan && day.trailWindow) && (
                      <View style={styles.itineraryDayMetaRow}>
                        <Feather name="flag" size={11} color={colors.mutedForeground} />
                        <Text style={styles.itineraryDayMeta}>{day.trailWindow}</Text>
                      </View>
                    )}
                    {!!day.driveTime && (
                      <View style={styles.itineraryDayMetaRow}>
                        <Feather name="clock" size={11} color={colors.mutedForeground} />
                        <Text style={styles.itineraryDayMeta}>{day.driveTime}</Text>
                      </View>
                    )}
                    {!!day.weatherNote && (
                      <View style={styles.itineraryDayMetaRow}>
                        <Feather name="cloud" size={11} color={colors.mutedForeground} />
                        <Text style={styles.itineraryDayMeta}>{day.weatherNote}</Text>
                      </View>
                    )}
                    {!!day.campground && (
                      <View style={styles.itineraryDayMetaRow}>
                        <Feather name="home" size={11} color={colors.mutedForeground} />
                        <Text style={styles.itineraryDayMeta}>{day.campground}</Text>
                      </View>
                    )}
                    {!!day.reserveUrl && (
                      <TouchableOpacity
                        style={styles.itineraryDayMetaRow}
                        onPress={() => Linking.openURL(day.reserveUrl!).catch(() => {})}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Feather name="external-link" size={11} color={colors.primary} />
                        <Text style={styles.itineraryReserveText}>RESERVE</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
              {notes.length > 0 && (
                <View style={styles.itineraryNotes}>
                  {notes.map((note) => (
                    <View key={note.icon} style={styles.itineraryNoteRow}>
                      <Feather name={note.icon} size={12} color={colors.mutedForeground} />
                      <Text style={styles.itineraryNoteText}>{note.text}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(hasCoords || !item.pending) && (
                <View style={styles.itineraryActions}>
                  {hasCoords && (
                    <TouchableOpacity
                      style={styles.itineraryActionBtn}
                      onPress={() =>
                        router.push({
                          pathname: "/(tabs)/map",
                          params: {
                            focusLat: String(it.destinationLat),
                            focusLng: String(it.destinationLng),
                          },
                        })
                      }
                    >
                      <Feather name="navigation" size={13} color={colors.primary} />
                      <Text
                        style={styles.itineraryActionText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.65}
                      >
                        VIEW MAP
                      </Text>
                    </TouchableOpacity>
                  )}
                  {!item.pending &&
                    (saved ? (
                      <View style={styles.itineraryActionBtn}>
                        <Feather name="check-circle" size={13} color={colors.mutedForeground} />
                        <Text style={styles.itinerarySavedText}>SAVED</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.itinerarySaveBtn}
                        onPress={() => handleSaveItinerary(item.id, it)}
                        disabled={saving || !uid}
                      >
                        {saving ? (
                          <ActivityIndicator size="small" color={colors.primaryForeground} />
                        ) : (
                          <Feather name="bookmark" size={13} color={colors.primaryForeground} />
                        )}
                        <Text style={styles.itinerarySaveText}>{saving ? "SAVING…" : "SAVE"}</Text>
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </View>
          );
        })()}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Feather name="message-square" size={20} color={colors.primary} />
          <Text style={styles.headerTitle}>TRIP ASSISTANT</Text>
        </View>
        <TouchableOpacity onPress={handleNewChat} style={styles.newChatBtn} disabled={sending}>
          <Feather name="plus-circle" size={16} color={colors.primary} />
          <Text style={styles.newChatText}>New Chat</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.disclaimer}>
        <Feather name="alert-triangle" size={14} color={colors.destructive} />
        <Text style={styles.disclaimerText}>
          Informational only — always verify current trail and weather conditions locally before
          heading out.
        </Text>
      </View>

      <View style={styles.modeRow}>
        {MODE_OPTIONS.map(({ id, emoji, label }) => (
          <TouchableOpacity
            key={id}
            style={[styles.modeBtn, mode === id && styles.modeBtnActive]}
            onPress={() => { if (mode !== id) { setMode(id); setErrorMsg(null); } }}
            disabled={sending}
          >
            <Text style={styles.modeBtnEmoji}>{emoji}</Text>
            <Text style={[styles.modeBtnText, mode === id && styles.modeBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {loadingList || (conversationId !== null && loadingConversation && !conversation) ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerFill}>
          <Feather name="compass" size={36} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{MODE_EMPTY_TEXT[mode]}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: 12, marginBottom: tabBarHeight }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={MODE_PLACEHOLDER[mode]}
          placeholderTextColor={colors.mutedForeground}
          multiline
          editable={!sending}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending || !uid}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="arrow-up" size={18} color={colors.primaryForeground} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerTitle: {
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: 1,
      color: colors.foreground,
    },
    newChatBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    newChatText: {
      color: colors.primary,
      fontWeight: "700",
      fontSize: 12,
    },
    disclaimer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.secondary,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 10,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    disclaimerText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 15,
      color: colors.mutedForeground,
      fontWeight: "600",
    },
    modeRow: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginBottom: 8,
      gap: 8,
    },
    modeBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 7,
      borderRadius: colors.radius,
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    modeBtnEmoji: {
      fontSize: 13,
    },
    modeBtnText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.mutedForeground,
    },
    modeBtnTextActive: {
      color: colors.primaryForeground,
    },
    errorBanner: {
      backgroundColor: colors.destructive,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 10,
      borderRadius: colors.radius,
    },
    errorText: {
      color: colors.destructiveForeground,
      fontSize: 12,
      fontWeight: "600",
    },
    centerFill: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 40,
    },
    emptyText: {
      color: colors.mutedForeground,
      fontSize: 13,
      textAlign: "center",
      lineHeight: 19,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 10,
    },
    bubbleRow: {
      flexDirection: "column",
      gap: 6,
    },
    bubbleRowUser: {
      alignItems: "flex-end",
    },
    bubbleRowAssistant: {
      alignItems: "flex-start",
    },
    bubble: {
      maxWidth: "85%",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bubbleUser: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 4,
    },
    bubbleTextUser: {
      color: colors.primaryForeground,
      fontSize: 14,
      lineHeight: 20,
    },
    bubbleTextAssistant: {
      color: colors.cardForeground,
      fontSize: 14,
      lineHeight: 20,
    },
    toolRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    toolText: {
      color: colors.mutedForeground,
      fontSize: 12,
      fontStyle: "italic",
    },
    toolsUsedTag: {
      marginTop: 6,
      fontSize: 10,
      color: colors.mutedForeground,
      fontWeight: "600",
    },
    coverageCard: {
      marginTop: 6,
      alignSelf: "stretch",
      maxWidth: "85%",
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    coverageHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    coverageTitle: {
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
      color: colors.foreground,
    },
    coverageNote: {
      fontSize: 11,
      lineHeight: 15,
      color: colors.mutedForeground,
    },
    coverageDownloadBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 8,
    },
    coverageDownloadText: {
      color: colors.primaryForeground,
      fontSize: 12,
      fontWeight: "700",
    },
    coverageDownloadBtnDone: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
    },
    coverageDownloadTextDone: {
      color: colors.mutedForeground,
      fontSize: 12,
      fontWeight: "600",
    },
    itineraryCard: {
      marginTop: 6,
      alignSelf: "stretch",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    itineraryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    itineraryTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.foreground,
    },
    itineraryDay: {
      flexDirection: "row",
      gap: 10,
    },
    itineraryDayBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    itineraryDayBadgeText: {
      color: colors.primaryForeground,
      fontSize: 10,
      fontWeight: "800",
    },
    itineraryDayBody: {
      flex: 1,
      gap: 4,
      paddingTop: 3,
    },
    itineraryDayLine: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.foreground,
    },
    itineraryDayMetaRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 5,
    },
    itineraryDayMeta: {
      flex: 1,
      fontSize: 11,
      lineHeight: 15,
      color: colors.mutedForeground,
    },
    itineraryDates: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.mutedForeground,
      marginTop: 1,
    },
    itineraryDestination: {
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
      color: colors.foreground,
    },
    itineraryDayDate: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: colors.mutedForeground,
      textTransform: "uppercase",
    },
    itineraryReserveText: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: colors.primary,
    },
    itineraryNotes: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
      gap: 6,
    },
    itineraryNoteRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
    },
    itineraryNoteText: {
      flex: 1,
      fontSize: 11,
      lineHeight: 15,
      color: colors.mutedForeground,
    },
    itineraryActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
    },
    itineraryActionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itineraryActionText: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: colors.primary,
    },
    itinerarySavedText: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: colors.mutedForeground,
    },
    itinerarySaveBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
    },
    itinerarySaveText: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: colors.primaryForeground,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      maxHeight: 100,
      backgroundColor: colors.input,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.foreground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnDisabled: {
      opacity: 0.5,
    },
  });
}
