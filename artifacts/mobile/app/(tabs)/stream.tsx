"use no memo";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  Alert,
  Platform,
  Image,
} from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// WebView: native only — on web we render an iframe fallback
let WebView: React.ComponentType<{ source: { uri: string }; style?: object }> | null = null;
if (Platform.OS !== "web") {
  try {
    WebView = require("react-native-webview").WebView;
  } catch {}
}

interface Coords {
  latitude: number;
  longitude: number;
  speed: number;
  altitude: number;
}

function TwitchChat({ channel }: { channel: string }) {
  const chatUrl = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?darkpopout&parent=localhost`;

  if (Platform.OS === "web") {
    const webUrl = typeof window !== "undefined"
      ? `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?darkpopout&parent=${window.location.hostname}`
      : chatUrl;
    return (
      <View style={{ flex: 1 }}>
        {/* @ts-ignore */}
        <iframe src={webUrl} style={{ width: "100%", height: "100%", border: "none" }} title="Twitch Chat" />
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={styles.chatFallback}>
        <Feather name="message-square" size={24} color="#6441a5" />
        <Text style={styles.chatFallbackText}>WebView unavailable</Text>
      </View>
    );
  }

  return <WebView source={{ uri: chatUrl }} style={{ flex: 1 }} />;
}

export default function StreamScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Stream state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamTitle, setStreamTitle] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [rtmpEndpoint, setRtmpEndpoint] = useState("rtmp://live.twitch.tv/app/");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rig + HUD
  const [rigModel, setRigModel] = useState("");
  const [rigTires, setRigTires] = useState("");
  const [rigLift, setRigLift] = useState("");
  const [showHUD, setShowHUD] = useState(true);
  const [coords, setCoords] = useState<Coords>({ latitude: 0, longitude: 0, speed: 0, altitude: 0 });
  const [permGranted, setPermGranted] = useState(false);

  // Twitch integration
  const [twitchChannel, setTwitchChannel] = useState("");
  const [twitchToken, setTwitchToken] = useState("");
  const [twitchClientId, setTwitchClientId] = useState("");
  const [showTwitchSettings, setShowTwitchSettings] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermGranted(status === "granted");
      if (status === "granted") {
        await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 1, timeInterval: 1000 },
          (loc) => {
            const spd = loc.coords.speed ?? 0;
            setCoords({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              speed: Math.max(0, Math.round(spd * 2.23694)),
              altitude: Math.round(loc.coords.altitude ?? 0),
            });
          }
        );
      }
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const updateTwitchTitle = useCallback(async () => {
    if (!twitchChannel || !twitchToken || !twitchClientId || !streamTitle) return;
    try {
      // Get broadcaster ID
      const userRes = await fetch(
        `https://api.twitch.tv/helix/users?login=${encodeURIComponent(twitchChannel)}`,
        { headers: { "Client-ID": twitchClientId, "Authorization": `Bearer ${twitchToken}` } }
      );
      const userData = await userRes.json();
      const broadcasterId = userData?.data?.[0]?.id;
      if (!broadcasterId) return;

      // Update title
      await fetch(
        `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`,
        {
          method: "PATCH",
          headers: {
            "Client-ID": twitchClientId,
            "Authorization": `Bearer ${twitchToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: streamTitle }),
        }
      );
    } catch {}
  }, [twitchChannel, twitchToken, twitchClientId, streamTitle]);

  const toggleStream = useCallback(async () => {
    if (!user) return;

    if (isStreaming) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      setIsRecording(false);
      setRecordElapsed(0);
      try { await deleteDoc(doc(db, "live_streams", user.uid)); } catch {}
      setIsStreaming(false);
    } else {
      if (!streamKey.trim()) {
        Alert.alert("Stream Key Required", "Enter your stream key to go live.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateTwitchTitle();
      try {
        await setDoc(doc(db, "live_streams", user.uid), {
          streamer: user.email,
          title: streamTitle,
          rig: { model: rigModel, tires: rigTires, lift: rigLift },
          location: { latitude: coords.latitude, longitude: coords.longitude },
          rtmpUrl: `${rtmpEndpoint}${streamKey}`,
          active: true,
          startedAt: serverTimestamp(),
        });
      } catch {}
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      setIsStreaming(true);
    }
  }, [user, isStreaming, streamKey, streamTitle, rigModel, rigTires, rigLift, coords, rtmpEndpoint, updateTwitchTitle]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      setIsRecording(false);
      Alert.alert("Recording Saved", `Clip saved — ${formatTime(recordElapsed)}`);
      setRecordElapsed(0);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setRecordElapsed(0);
      recordTimerRef.current = setInterval(() => setRecordElapsed((e) => e + 1), 1000);
      setIsRecording(true);
    }
  }, [isRecording, recordElapsed]);

  if (isStreaming) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {/* LIVE CAMERA AREA */}
        <View style={[styles.liveCameraArea, { paddingTop: insets.top }]}>
          {/* Camera placeholder */}
          <View style={styles.livePlaceholder}>
            <Image source={require("@/assets/icons/camera.png")} style={styles.cameraIcon} resizeMode="contain" />
            {streamTitle ? (
              <Text style={styles.liveTitleOverlay}>{streamTitle.toUpperCase()}</Text>
            ) : null}
          </View>

          {/* LIVE badge + elapsed */}
          <View style={[styles.liveBadgeRow, { top: insets.top + 12 }]}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.elapsedText}>{formatTime(elapsed)}</Text>
          </View>

          {/* HUD Telemetry */}
          {showHUD && (
            <View style={[styles.hud, { top: insets.top + 12, backgroundColor: "rgba(0,0,0,0.8)", borderColor: colors.accent }]}>
              <Text style={[styles.hudTitle, { color: colors.accent }]}>TELEMETRY</Text>
              <Text style={[styles.hudSpeed, { color: colors.success }]}>
                {coords.speed}<Text style={styles.hudSpeedUnit}> MPH</Text>
              </Text>
              <Text style={[styles.hudData, { color: "#FFF" }]}>
                {permGranted ? `${coords.latitude.toFixed(4)}° N` : "NO GPS"}
              </Text>
              <Text style={[styles.hudData, { color: "#FFF" }]}>
                {permGranted ? `${coords.longitude.toFixed(4)}° W` : ""}
              </Text>
              <Text style={[styles.hudAlt, { color: colors.mutedForeground }]}>ALT: {coords.altitude}m</Text>
              {rigModel ? <Text style={[styles.hudRig, { color: "#AAA" }]}>{rigModel.toUpperCase()}</Text> : null}
            </View>
          )}

          {/* Bottom controls overlay */}
          <View style={[styles.liveControls, { bottom: 12 }]}>
            {/* Record button */}
            <TouchableOpacity
              style={[styles.recordBtn, { borderColor: isRecording ? "#ff0000" : "#fff" }]}
              onPress={toggleRecording}
              activeOpacity={0.8}
            >
              {isRecording ? (
                <View style={styles.recordingSquare} />
              ) : (
                <View style={styles.recordCircle} />
              )}
            </TouchableOpacity>

            {isRecording && (
              <View style={styles.recBadge}>
                <View style={[styles.liveDot, { backgroundColor: "#ff0000" }]} />
                <Text style={styles.recText}>REC {formatTime(recordElapsed)}</Text>
              </View>
            )}

            {/* Stop stream */}
            <TouchableOpacity
              style={[styles.stopBtn, { backgroundColor: colors.destructive }]}
              onPress={toggleStream}
              activeOpacity={0.85}
            >
              <Feather name="square" size={14} color="#fff" />
              <Text style={styles.stopBtnText}>END STREAM</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* TWITCH CHAT */}
        <View style={[styles.chatArea, { backgroundColor: "#18131b", borderTopColor: "#6441a5", paddingBottom: insets.bottom }]}>
          <View style={styles.chatHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={[styles.twitchDot, { backgroundColor: "#6441a5" }]} />
              <Text style={styles.chatTitle}>
                {twitchChannel ? `${twitchChannel} — CHAT` : "TWITCH CHAT"}
              </Text>
            </View>
          </View>
          {twitchChannel ? (
            <TwitchChat channel={twitchChannel} />
          ) : (
            <View style={styles.chatFallback}>
              <Feather name="message-square" size={28} color="#6441a5" />
              <Text style={styles.chatFallbackText}>Enter your Twitch channel{"\n"}in settings to see chat here</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ── PRE-STREAM SETTINGS VIEW ──
  const paddingBottom = Platform.OS === "web" ? 34 : insets.bottom + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* CAMERA PREVIEW */}
      <View style={styles.cameraArea}>
        <View style={[styles.cameraPlaceholder, { backgroundColor: "#000" }]}>
          <Image source={require("@/assets/icons/camera.png")} style={styles.cameraIcon} resizeMode="contain" />
          <Text style={[styles.cameraLabel, { color: colors.mutedForeground }]}>CAMERA PREVIEW</Text>
        </View>
        {showHUD && (
          <View style={[styles.hud, { top: insets.top + 60, backgroundColor: "rgba(0,0,0,0.8)", borderColor: colors.accent }]}>
            <Text style={[styles.hudTitle, { color: colors.accent }]}>TELEMETRY</Text>
            <Text style={[styles.hudSpeed, { color: colors.success }]}>
              {coords.speed}<Text style={styles.hudSpeedUnit}> MPH</Text>
            </Text>
            <Text style={[styles.hudData, { color: "#FFF" }]}>
              {permGranted ? `${coords.latitude.toFixed(4)}° N` : "NO GPS"}
            </Text>
            <Text style={[styles.hudData, { color: "#FFF" }]}>
              {permGranted ? `${coords.longitude.toFixed(4)}° W` : ""}
            </Text>
            <Text style={[styles.hudAlt, { color: colors.mutedForeground }]}>ALT: {coords.altitude}m</Text>
          </View>
        )}
      </View>

      {/* SETTINGS PANEL */}
      <ScrollView
        style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}
        contentContainerStyle={{ paddingBottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.panelTitle, { color: colors.foreground }]}>BROADCAST STATION</Text>

        {/* Stream Title */}
        <Text style={[styles.fieldLabel, { color: colors.accent }]}>STREAM TITLE</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
          placeholder="e.g. Rubicon Run — Day 1"
          placeholderTextColor={colors.mutedForeground}
          value={streamTitle}
          onChangeText={setStreamTitle}
        />

        {/* RTMP */}
        <Text style={[styles.fieldLabel, { color: colors.accent }]}>RTMP SERVER</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
          placeholder="rtmp://live.twitch.tv/app/"
          placeholderTextColor={colors.mutedForeground}
          value={rtmpEndpoint}
          onChangeText={setRtmpEndpoint}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Stream Key */}
        <Text style={[styles.fieldLabel, { color: colors.accent }]}>STREAM KEY</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
          placeholder="YOUR STREAM KEY"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={streamKey}
          onChangeText={setStreamKey}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Twitch Settings (collapsible) */}
        <TouchableOpacity
          style={[styles.collapsibleHeader, { borderColor: colors.border }]}
          onPress={() => setShowTwitchSettings((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.twitchDot, { backgroundColor: "#6441a5" }]} />
            <Text style={[styles.fieldLabel, { color: "#9b59e8", marginBottom: 0 }]}>TWITCH SETTINGS</Text>
          </View>
          <Feather name={showTwitchSettings ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        {showTwitchSettings && (
          <View style={[styles.twitchBox, { borderColor: "#6441a5", backgroundColor: colors.secondary }]}>
            <Text style={[styles.fieldLabel, { color: "#9b59e8" }]}>TWITCH CHANNEL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: "#6441a5" }]}
              placeholder="your_channel_name"
              placeholderTextColor={colors.mutedForeground}
              value={twitchChannel}
              onChangeText={setTwitchChannel}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.fieldLabel, { color: "#9b59e8" }]}>CLIENT ID (for title update)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: "#6441a5" }]}
              placeholder="Twitch app Client-ID"
              placeholderTextColor={colors.mutedForeground}
              value={twitchClientId}
              onChangeText={setTwitchClientId}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.fieldLabel, { color: "#9b59e8" }]}>OAUTH TOKEN (for title update)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: "#6441a5" }]}
              placeholder="User access token"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={twitchToken}
              onChangeText={setTwitchToken}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
              Channel name is used for the chat embed. Client ID + OAuth token are only needed if you want the stream title auto-updated on Twitch when you go live.
            </Text>
          </View>
        )}

        {/* Rig Specs */}
        <Text style={[styles.fieldLabel, { color: colors.accent, marginTop: 8 }]}>RIG SPECS</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.inputFlex2, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
            placeholder="Vehicle (e.g. Tacoma)"
            placeholderTextColor={colors.mutedForeground}
            value={rigModel}
            onChangeText={setRigModel}
          />
          <TextInput
            style={[styles.input, styles.inputFlex1, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
            placeholder='Tires (37")'
            placeholderTextColor={colors.mutedForeground}
            value={rigTires}
            onChangeText={setRigTires}
          />
        </View>
        <TextInput
          style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
          placeholder="Lift height (e.g. 4 inch)"
          placeholderTextColor={colors.mutedForeground}
          value={rigLift}
          onChangeText={setRigLift}
        />

        {/* HUD Toggle */}
        <View style={[styles.toggleRow, { borderColor: colors.border }]}>
          <View style={styles.toggleLabel}>
            <Feather name="map-pin" size={14} color={colors.foreground} />
            <Text style={[styles.toggleText, { color: colors.foreground }]}>HUD TELEMETRY OVERLAY</Text>
          </View>
          <Switch
            value={showHUD}
            onValueChange={setShowHUD}
            thumbColor={colors.accent}
            trackColor={{ false: colors.border, true: "#8B3000" }}
          />
        </View>

        {/* Go Live */}
        <TouchableOpacity
          style={[styles.streamBtn, { backgroundColor: colors.accent }]}
          onPress={toggleStream}
          activeOpacity={0.85}
        >
          <Feather name="radio" size={18} color="#000" />
          <Text style={[styles.streamBtnText, { color: "#000" }]}>ENGAGE BROADCAST</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Pre-stream
  cameraArea: { flex: 1, position: "relative" },
  cameraPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  cameraLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 2 },

  // Live mode
  liveCameraArea: { flex: 1, position: "relative", backgroundColor: "#000" },
  livePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  cameraIcon: { width: 80, height: 80, tintColor: "#ffffff" },
  liveTitleOverlay: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 2, textAlign: "center", paddingHorizontal: 20 },

  // Live badge
  liveBadgeRow: { position: "absolute", left: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(211,47,47,0.9)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  elapsedText: { color: "#fff", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", fontSize: 13, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },

  // HUD
  hud: { position: "absolute", right: 14, padding: 12, borderRadius: 6, borderWidth: 1, minWidth: 110 },
  hudTitle: { fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  hudSpeed: { fontSize: 32, fontWeight: "900", lineHeight: 36 },
  hudSpeedUnit: { fontSize: 11, fontWeight: "700" },
  hudData: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", marginTop: 2 },
  hudAlt: { fontSize: 10, fontWeight: "700", marginTop: 4 },
  hudRig: { fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 4 },

  // Live controls overlay
  liveControls: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  recordBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  recordCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#ff0000" },
  recordingSquare: { width: 18, height: 18, borderRadius: 3, backgroundColor: "#ff0000" },
  recBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4 },
  recText: { color: "#ff0000", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  stopBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4 },
  stopBtnText: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 1 },

  // Twitch Chat
  chatArea: { height: 260, borderTopWidth: 2 },
  chatHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8 },
  chatTitle: { color: "#9b59e8", fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  twitchDot: { width: 8, height: 8, borderRadius: 4 },
  chatFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  chatFallbackText: { color: "#666", fontSize: 12, textAlign: "center", lineHeight: 18 },

  // Settings panel
  panel: { maxHeight: "60%", borderTopWidth: 2, paddingHorizontal: 20, paddingTop: 16 },
  panelTitle: { fontWeight: "900", fontSize: 14, letterSpacing: 2, marginBottom: 14 },
  fieldLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  input: { padding: 12, borderRadius: 4, marginBottom: 10, borderWidth: 1, fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", gap: 8 },
  inputFlex2: { flex: 2 },
  inputFlex1: { flex: 1 },

  // Twitch collapsible
  collapsibleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  twitchBox: { borderWidth: 1, borderRadius: 4, padding: 12, marginBottom: 10 },
  helpText: { fontSize: 10, lineHeight: 15, marginTop: -4, marginBottom: 8 },

  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  toggleLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggleText: { fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  streamBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 4 },
  streamBtnText: { fontWeight: "900", fontSize: 14, letterSpacing: 2 },
});
