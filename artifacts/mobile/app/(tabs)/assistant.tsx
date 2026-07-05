"use no memo";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { doc, onSnapshot } from "firebase/firestore";
import {
  useListAssistantConversations,
  useCreateAssistantConversation,
  useGetAssistantConversation,
  getListAssistantConversationsQueryKey,
  getGetAssistantConversationQueryKey,
  type AssistantConversationWithMessages,
  type AssistantVehicleProfile,
} from "@workspace/api-client-react";
import "@/lib/api-client";
import { streamAssistantMessage, type AssistantStreamEvent } from "@/lib/assistant-api";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { db } from "@/lib/firebase";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[] | null;
  pending?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  get_trail_briefing: "Checking trail data & weather…",
  find_campgrounds_near_trail: "Looking up nearby campgrounds…",
  check_vehicle_fit: "Checking your rig against this trail…",
  web_search: "Searching the web…",
};

export default function AssistantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const queryClient = useQueryClient();

  const [vehicleProfile, setVehicleProfile] = useState<AssistantVehicleProfile>({});
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const listRef = useRef<FlatList<DisplayMessage>>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      const specs = snap.data()?.vehicleSpecs as
        | { liftIn?: number; tireDiameterIn?: number; hasLockers?: boolean; hasLowRange?: boolean }
        | undefined;
      setVehicleProfile({
        liftIn: specs?.liftIn || undefined,
        tireDiameterIn: specs?.tireDiameterIn || undefined,
        hasLockers: !!specs?.hasLockers,
        hasLowRange: !!specs?.hasLowRange,
      });
    });
    return unsub;
  }, [uid]);

  const authHeaders = useMemo(() => ({ "X-User-Id": uid }), [uid]);

  const { data: conversations, isLoading: loadingList } = useListAssistantConversations({
    query: { queryKey: getListAssistantConversationsQueryKey(), enabled: !!uid },
    request: { headers: authHeaders },
  });

  const createConversation = useCreateAssistantConversation({
    request: { headers: authHeaders },
  });

  useEffect(() => {
    if (!uid || loadingList || conversationId !== null) return;
    if (conversations && conversations.length > 0) {
      setConversationId(conversations[0].id);
    } else if (conversations && conversations.length === 0 && !createConversation.isPending) {
      createConversation.mutate(
        { data: { title: "Trip Chat" } },
        { onSuccess: (created) => setConversationId(created.id) },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, loadingList, conversations, conversationId]);

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
      { data: { title: "Trip Chat" } },
      {
        onSuccess: (created) => {
          setConversationId(created.id);
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
    }));
    if (sending) {
      base.push({
        id: "streaming",
        role: "assistant",
        content: streamingText,
        pending: true,
      });
    }
    return base;
  }, [conversation, sending, streamingText]);

  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, streamingText]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending || conversationId === null || !uid) return;

    setInput("");
    setErrorMsg(null);
    setSending(true);
    setStreamingText("");
    setActiveTool(null);

    queryClient.setQueryData(
      getGetAssistantConversationQueryKey(conversationId),
      (old: AssistantConversationWithMessages | undefined) =>
        old
          ? {
              ...old,
              messages: [
                ...old.messages,
                {
                  id: -Date.now(),
                  conversationId,
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
        conversationId,
        uid,
        content,
        vehicleProfile,
        (event: AssistantStreamEvent) => {
          if (event.type === "tool_call") {
            setActiveTool(event.tool);
          } else if (event.type === "text") {
            setActiveTool(null);
            setStreamingText((prev) => prev + event.content);
          } else if (event.type === "error") {
            setErrorMsg(event.message);
          }
        },
      );
    } finally {
      setSending(false);
      setActiveTool(null);
      setStreamingText("");
      queryClient.invalidateQueries({
        queryKey: getGetAssistantConversationQueryKey(conversationId),
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
            <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
              {item.content}
            </Text>
          )}
          {!!item.toolsUsed?.length && (
            <Text style={styles.toolsUsedTag}>
              Used: {item.toolsUsed.join(", ")}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
          <Text style={styles.emptyText}>
            Ask about a trail's conditions, whether your rig can handle it, or nearby camping.
          </Text>
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

      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about a trail, weather, or camping…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          editable={!sending && conversationId !== null}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending || conversationId === null}
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
      flexDirection: "row",
    },
    bubbleRowUser: {
      justifyContent: "flex-end",
    },
    bubbleRowAssistant: {
      justifyContent: "flex-start",
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
