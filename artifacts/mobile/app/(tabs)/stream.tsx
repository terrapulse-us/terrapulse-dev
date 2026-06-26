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
  Clipboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { CameraType } from "expo-camera";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useTwitchAuth } from "@/lib/useTwitchAuth";

// ── RTMP publisher ──────────────────────────────────────────────────────────
// Android only: @api.video/react-native-livestream is not linked on iOS
// (HaishinKit 1.x is incompatible with iOS SDK 26). iOS always uses the
// expo-camera fallback + copy-RTMP-URL flow for Streamlabs/OBS.
const isExpoGo = Constants.executionEnvironment === "storeClient";
let ApiVideoLiveStreamView: React.ComponentType<any> | null = null;
if (!isExpoGo && Platform.OS === "android") {
  try {
    ApiVideoLiveStreamView =
      require("@api.video/react-native-livestream").ApiVideoLiveStreamView;
  } catch {}
}
const rtmpAvailable = ApiVideoLiveStreamView !== null;

// WebView: native only
let WebView: React.ComponentType<{ source: { uri: string }; style?: object }> | null = null;
if (Platform.OS !== "web") {
  try {
    WebView = require("react-native-webview").WebView;
  } catch {}
}

const STORAGE_KEY_STREAM_KEY = "@terrapulse/stream_key";
const STORAGE_KEY_RTMP = "@terrapulse/rtmp_endpoint";

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

  // Camera
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [cameraFacing, setCameraFacing] = useState<"back" | "front">("back");
  const [camPermDenied, setCamPermDenied] = useState(false);
  const publisherRef = useRef<any>(null);

  // Request camera permission on mount for both RTMP and fallback paths
  useEffect(() => {
    requestCameraPermission().then((result) => {
      if (!result.granted) setCamPermDenied(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable refs to avoid stale closures in callbacks
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Stream state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamTitle, setStreamTitle] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [streamKeySaved, setStreamKeySaved] = useState(false);
  const [rtmpEndpoint, setRtmpEndpoint] = useState("rtmp://live.twitch.tv/app/");
  const [elapsed, setElapsed] = useState(0);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rig + HUD
  const [rigModel, setRigModel] = useState("");
  const [rigTires, setRigTires] = useState("");
  const [rigLift, setRigLift] = useState("");
  const [showHUD, setShowHUD] = useState(true);
  const [coords, setCoords] = useState<Coords>({ latitude: 0, longitude: 0, speed: 0, altitude: 0 });
  const [permGranted, setPermGranted] = useState(false);

  // Twitch integration
  const { auth: twitchAuth, loading: twitchLoading, error: twitchError, connect: connectTwitch, disconnect: disconnectTwitch, updateTitle: updateTwitchTitleViaApi } = useTwitchAuth(user?.uid);
  const twitchChannel = twitchAuth?.channel ?? "";
  const [showTwitchSettings, setShowTwitchSettings] = useState(false);

  // Load persisted stream key + endpoint
  useEffect(() => {
    (async () => {
      try {
        const savedKey = await AsyncStorage.getItem(STORAGE_KEY_STREAM_KEY);
        const savedRtmp = await AsyncStorage.getItem(STORAGE_KEY_RTMP);
        if (savedKey) { setStreamKey(savedKey); setStreamKeySaved(true); }
        if (savedRtmp) setRtmpEndpoint(savedRtmp);
      } catch {}
    })();
  }, []);

  // Location watcher
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermGranted(status === "granted");
      if (status === "granted") {
        sub = await Location.watchPositionAsync(
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
      sub?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const saveStreamKey = useCallback(async () => {
    if (!streamKey.trim()) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY_STREAM_KEY, streamKey.trim());
      await AsyncStorage.setItem(STORAGE_KEY_RTMP, rtmpEndpoint.trim());
      setStreamKeySaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Error", "Could not save stream key.");
    }
  }, [streamKey, rtmpEndpoint]);

  const copyRtmpUrl = useCallback(() => {
    const full = `${rtmpEndpoint.trim()}${streamKey.trim()}`;
    if (!streamKey.trim()) {
      Alert.alert("No Stream Key", "Enter and save your stream key first.");
      return;
    }
    Clipboard.setString(full);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("RTMP URL Copied", "Paste into Streamlabs or OBS:\n\n" + full);
  }, [rtmpEndpoint, streamKey]);

  const onPermissionsDenied = useCallback((_permissions: string[]) => {
    setCamPermDenied(true);
    Alert.alert(
      "Camera Permission Required",
      "TerraPulse needs camera and microphone access to stream. Please enable them in your device Settings.",
      [{ text: "OK" }]
    );
  }, []);

  const flipCamera = useCallback(() => {
    setCamPermDenied(false);
    if (rtmpAvailable) {
      setCameraFacing((f) => (f === "back" ? "front" : "back"));
    } else {
      setFacing((f) => (f === "back" ? "front" : "back"));
    }
  }, []);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const updateTwitchTitle = useCallback(async () => {
    if (!twitchAuth || !streamTitle) return;
    await updateTwitchTitleViaApi(streamTitle);
  }, [twitchAuth, streamTitle, updateTwitchTitleViaApi]);

  // ── Streaming lifecycle ────────────────────────────────────────────────────

  const stopStreamCleanup = useCallback(async (uid: string | undefined) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (uid) { try { await deleteDoc(doc(db, "live_streams", uid)); } catch {} }
    setIsStreaming(false);
    setStreamStatus(null);
  }, []);

  // Called by ApiVideoLiveStreamView when Twitch accepts the connection
  const onConnectionSuccess = useCallback(() => {
    setStreamStatus("Live on Twitch ✓");
  }, []);

  // Called when the connection is refused (bad key, Twitch error, etc.)
  const onConnectionFailed = useCallback((_code: string) => {
    setStreamStatus("Connection failed — check your stream key");
    stopStreamCleanup(userRef.current?.uid);
  }, [stopStreamCleanup]);

  // Called on unexpected disconnect (network drop, Twitch kicked, etc.)
  const onDisconnect = useCallback(() => {
    stopStreamCleanup(userRef.current?.uid);
  }, [stopStreamCleanup]);

  const toggleStream = useCallback(async () => {
    if (!user) return;

    if (isStreaming) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (rtmpAvailable && publisherRef.current) {
        publisherRef.current.stopStreaming();
      }
      await stopStreamCleanup(user.uid);
    } else {
      if (!streamKey.trim()) {
        Alert.alert("Stream Key Required", "Enter and save your Twitch stream key to go live.");
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

      if (rtmpAvailable && publisherRef.current) {
        setStreamStatus("Connecting…");
        publisherRef.current
          .startStreaming(streamKey.trim(), rtmpEndpoint.trim())
          .then((started: boolean) => {
            if (!started) setStreamStatus("Failed to start — check your stream key");
          })
          .catch(() => setStreamStatus("Failed to start stream"));
      }

      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      setIsStreaming(true);
    }
  }, [user, isStreaming, streamKey, streamTitle, rigModel, rigTires, rigLift, coords, rtmpEndpoint, updateTwitchTitle, stopStreamCleanup]);

  // ── HUD (reused in both overlay states) ────────────────────────────────────
  const renderHud = (top: number) => (
    <View style={[styles.hud, { top, backgroundColor: "rgba(0,0,0,0.8)", borderColor: colors.accent }]}>
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
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  // The camera component is ALWAYS mounted so ApiVideoLiveStreamView keeps
  // its native session alive across the pre-stream ↔ live UI transition.
  // Only overlays and the bottom panel change.
  return (
    <View style={[styles.container, { backgroundColor: isStreaming ? "#000" : colors.background }]}>

      {/* ── Camera area ── */}
      <View style={[styles.cameraArea, isStreaming && { paddingTop: insets.top }]}>

        {/* Camera — ApiVideoLiveStreamView (dev client / builds) or CameraView (Expo Go) */}
        {rtmpAvailable && ApiVideoLiveStreamView ? (
          <>
            <ApiVideoLiveStreamView
              key={isStreaming ? "streaming" : cameraFacing}
              ref={publisherRef}
              style={StyleSheet.absoluteFill}
              camera={cameraFacing}
              video={{ fps: 30, resolution: "720p", bitrate: 2000000, gopDuration: 1 }}
              audio={{ bitrate: 128000, sampleRate: 44100, isStereo: true }}
              isMuted={false}
              enablePinchedZoom
              onConnectionSuccess={onConnectionSuccess}
              onConnectionFailed={onConnectionFailed}
              onDisconnect={onDisconnect}
              onPermissionsDenied={onPermissionsDenied}
            />
            {/* Permission denied overlay — shown when OS blocked camera/mic */}
            {camPermDenied && (
              <TouchableOpacity
                style={[styles.cameraPlaceholder, { backgroundColor: "rgba(0,0,0,0.85)", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }]}
                onPress={() => {
                  setCamPermDenied(false);
                  requestCameraPermission().then((r) => {
                    if (!r.granted) setCamPermDenied(true);
                  });
                }}
                activeOpacity={0.8}
              >
                <Feather name="camera-off" size={40} color="#555" />
                <Text style={[styles.cameraLabel, { color: "#777" }]}>TAP TO ENABLE CAMERA</Text>
                <Text style={{ color: "#555", fontSize: 10, marginTop: 4, textAlign: "center", paddingHorizontal: 24 }}>
                  Camera &amp; microphone access needed to stream
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : cameraPermission == null ? null : !cameraPermission.granted ? (
          <TouchableOpacity
            style={[styles.cameraPlaceholder, { backgroundColor: "#111" }]}
            onPress={requestCameraPermission}
            activeOpacity={0.8}
          >
            <Feather name="camera-off" size={40} color="#555" />
            <Text style={[styles.cameraLabel, { color: "#555" }]}>TAP TO ENABLE CAMERA</Text>
          </TouchableOpacity>
        ) : (
          <CameraView style={StyleSheet.absoluteFill} facing={facing} />
        )}

        {/* Flip camera */}
        {(cameraPermission?.granted || rtmpAvailable) && (
          <TouchableOpacity
            style={[styles.flipBtn, { top: insets.top + 12, right: 14 }]}
            onPress={flipCamera}
          >
            <Feather name="refresh-cw" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        {/* ── LIVE overlays ── */}
        {isStreaming && (
          <>
            {/* LIVE badge + elapsed */}
            <View style={[styles.liveBadgeRow, { top: insets.top + 12 }]}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text style={styles.elapsedText}>{formatTime(elapsed)}</Text>
            </View>

            {/* Connection status */}
            {streamStatus ? (
              <View style={[styles.statusBanner, { top: insets.top + 48 }]}>
                <Text style={styles.statusText}>{streamStatus}</Text>
              </View>
            ) : null}

            {/* HUD */}
            {showHUD && renderHud(insets.top + 90)}

            {/* End stream */}
            <View style={[styles.liveControls, { bottom: 12 }]}>
              <TouchableOpacity
                style={[styles.stopBtn, { backgroundColor: colors.destructive }]}
                onPress={toggleStream}
                activeOpacity={0.85}
              >
                <Feather name="square" size={14} color="#fff" />
                <Text style={styles.stopBtnText}>END STREAM</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── PRE-STREAM overlays ── */}
        {!isStreaming && (
          <>
            {/* Status banner */}
            <View style={[styles.expoGoBanner, { top: insets.top + 8 }]}>
              {rtmpAvailable ? (
                <>
                  <Feather name="radio" size={11} color="#00b300" />
                  <Text style={[styles.expoGoText, { color: "#00b300" }]}>
                    Direct RTMP — tap GO LIVE to stream straight to Twitch
                  </Text>
                </>
              ) : (
                <>
                  <Feather name="radio" size={11} color="#f5a623" />
                  <Text style={styles.expoGoText}>Copy your RTMP key below — stream with Streamlabs or OBS</Text>
                </>
              )}
            </View>

            {/* HUD */}
            {showHUD && renderHud(insets.top + 60)}

            {/* GO LIVE */}
            <TouchableOpacity
              style={[styles.floatingStreamBtn, { backgroundColor: "#5A9A5A" }]}
              onPress={toggleStream}
              activeOpacity={0.85}
            >
              <Feather name="radio" size={18} color="#FFFFFF" />
              <Text style={[styles.streamBtnText, { color: "#FFFFFF" }]}>GO LIVE</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Twitch chat (streaming only) ── */}
      {isStreaming && (
        <View style={[styles.chatArea, { backgroundColor: "#18131b", borderTopColor: "#6441a5", paddingBottom: insets.bottom }]}>
          <View style={styles.chatHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={[styles.twitchDot, { backgroundColor: "#6441a5" }]} />
              <Text style={styles.chatTitle}>{twitchChannel ? `${twitchChannel} — CHAT` : "TWITCH CHAT"}</Text>
            </View>
          </View>
          {twitchChannel ? (
            <TwitchChat channel={twitchChannel} />
          ) : (
            <View style={styles.chatFallback}>
              <Feather name="message-square" size={28} color="#6441a5" />
              <Text style={styles.chatFallbackText}>Connect Twitch in settings to see chat here</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Settings panel (pre-stream only) ── */}
      {!isStreaming && (
        <View style={[styles.settingsSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHandleRow}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>BROADCAST STATION</Text>

            <Text style={[styles.fieldLabel, { color: colors.accent }]}>STREAM TITLE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
              placeholder="e.g. Rubicon Run — Day 1"
              placeholderTextColor={colors.mutedForeground}
              value={streamTitle}
              onChangeText={setStreamTitle}
            />

            <Text style={[styles.fieldLabel, { color: colors.accent }]}>RTMP SERVER</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
              placeholder="rtmp://live.twitch.tv/app/"
              placeholderTextColor={colors.mutedForeground}
              value={rtmpEndpoint}
              onChangeText={(v) => { setRtmpEndpoint(v); setStreamKeySaved(false); }}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.fieldLabel, { color: colors.accent }]}>STREAM KEY</Text>
            <View style={styles.keyRow}>
              <TextInput
                style={[styles.input, styles.keyInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: streamKeySaved ? "#00b300" : colors.border }]}
                placeholder="YOUR STREAM KEY"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                value={streamKey}
                onChangeText={(v) => { setStreamKey(v); setStreamKeySaved(false); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.saveKeyBtn, { backgroundColor: streamKeySaved ? "#00b300" : colors.accent }]}
                onPress={saveStreamKey}
              >
                <Feather name={streamKeySaved ? "check" : "save"} size={14} color="#000" />
                <Text style={styles.saveKeyText}>{streamKeySaved ? "SAVED" : "SAVE"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.copyRtmpBtn, { borderColor: colors.border }]}
              onPress={copyRtmpUrl}
              activeOpacity={0.8}
            >
              <Feather name="copy" size={12} color={colors.mutedForeground} />
              <Text style={[styles.copyRtmpText, { color: colors.mutedForeground }]}>
                COPY FULL RTMP URL → USE IN STREAMLABS / OBS
              </Text>
            </TouchableOpacity>

            {/* Twitch Settings */}
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
                {twitchAuth ? (
                  <>
                    <View style={styles.twitchConnectedRow}>
                      <View style={[styles.twitchDot, { backgroundColor: "#00b300" }]} />
                      <Text style={[styles.twitchConnectedText, { color: "#00b300" }]}>
                        Connected as {twitchAuth.displayName || twitchAuth.channel}
                      </Text>
                    </View>
                    <Text style={[styles.helpText, { color: colors.mutedForeground, marginTop: 4 }]}>
                      Stream title auto-updates on Twitch when you go live. Chat is embedded during your stream.
                    </Text>
                    <TouchableOpacity
                      style={[styles.twitchDisconnectBtn, { borderColor: "#6441a5" }]}
                      onPress={disconnectTwitch}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.twitchDisconnectText}>DISCONNECT</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {twitchError ? (
                      <Text style={[styles.helpText, { color: "#ff4444", marginBottom: 8 }]}>Error: {twitchError}</Text>
                    ) : null}
                    <Text style={[styles.helpText, { color: colors.mutedForeground, marginBottom: 12 }]}>
                      Connect your Twitch account to auto-update your stream title and see live chat.
                    </Text>
                    <TouchableOpacity
                      style={[styles.twitchConnectBtn, twitchLoading && { opacity: 0.6 }]}
                      onPress={connectTwitch}
                      disabled={twitchLoading}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.twitchDot, { backgroundColor: "#fff" }]} />
                      <Text style={styles.twitchConnectText}>
                        {twitchLoading ? "CONNECTING…" : "CONNECT WITH TWITCH"}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
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
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraArea: { flex: 1, position: "relative" },
  cameraPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  cameraLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  flipBtn: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 22,
    padding: 10,
    zIndex: 10,
  },
  floatingStreamBtn: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  settingsSheet: { height: 310, borderTopWidth: 2 },
  sheetHandleRow: { alignItems: "center", paddingVertical: 8 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2 },
  liveBadgeRow: { position: "absolute", left: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(211,47,47,0.9)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  elapsedText: { color: "#fff", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", fontSize: 13, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusBanner: { position: "absolute", left: 14, right: 14, backgroundColor: "rgba(0,179,0,0.15)", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { color: "#00b300", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  expoGoBanner: { position: "absolute", left: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(245,166,35,0.12)", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  expoGoText: { color: "#f5a623", fontSize: 9, fontWeight: "700", letterSpacing: 0.5, flex: 1 },
  hud: { position: "absolute", right: 14, padding: 12, borderRadius: 6, borderWidth: 1, minWidth: 110 },
  hudTitle: { fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  hudSpeed: { fontSize: 32, fontWeight: "900", lineHeight: 36 },
  hudSpeedUnit: { fontSize: 11, fontWeight: "700" },
  hudData: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", marginTop: 2 },
  hudAlt: { fontSize: 10, fontWeight: "700", marginTop: 4 },
  hudRig: { fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  liveControls: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 16 },
  stopBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4 },
  stopBtnText: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  chatArea: { height: 260, borderTopWidth: 2 },
  chatHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8 },
  chatTitle: { color: "#9b59e8", fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  twitchDot: { width: 8, height: 8, borderRadius: 4 },
  chatFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  chatFallbackText: { color: "#666", fontSize: 12, textAlign: "center", lineHeight: 18 },
  panelTitle: { fontWeight: "900", fontSize: 14, letterSpacing: 2, marginBottom: 14 },
  fieldLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  input: { padding: 12, borderRadius: 4, marginBottom: 10, borderWidth: 1, fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", gap: 8 },
  inputFlex2: { flex: 2 },
  inputFlex1: { flex: 1 },
  keyRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  keyInput: { flex: 1, marginBottom: 10 },
  saveKeyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 13, borderRadius: 4, marginBottom: 10 },
  saveKeyText: { fontWeight: "900", fontSize: 11, letterSpacing: 1, color: "#000" },
  copyRtmpBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
  copyRtmpText: { fontSize: 9, fontWeight: "700", letterSpacing: 1.2, flex: 1 },
  collapsibleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  twitchBox: { borderWidth: 1, borderRadius: 4, padding: 12, marginBottom: 10 },
  helpText: { fontSize: 10, lineHeight: 15, marginTop: -4, marginBottom: 8 },
  twitchConnectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#6441a5", borderRadius: 6, paddingVertical: 12, paddingHorizontal: 16 },
  twitchConnectText: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 1.5 },
  twitchConnectedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  twitchConnectedText: { fontWeight: "700", fontSize: 12 },
  twitchDisconnectBtn: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8 },
  twitchDisconnectText: { color: "#9b59e8", fontWeight: "700", fontSize: 10, letterSpacing: 1 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  toggleLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggleText: { fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  streamBtnText: { fontWeight: "900", fontSize: 14, letterSpacing: 2 },
});
