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

// ── RTMP publisher — loaded only when running in the dev client or a standalone build ──
// In Expo Go (storeClient) the native module doesn't exist; fall back to the
// copy-key / Streamlabs workflow. In the dev client (bare) and preview/production
// builds the native module is compiled in and RTMP streams directly to Twitch.
const isExpoGo = Constants.executionEnvironment === "storeClient";
let NodePublisher: React.ComponentType<any> | null = null;
if (!isExpoGo) {
  try {
    NodePublisher = require("react-native-nodemediaclient").NodePublisher;
  } catch {}
}
const rtmpAvailable = NodePublisher !== null;

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
  const [frontCamera, setFrontCamera] = useState(false);
  const publisherRef = useRef<any>(null);

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
    Alert.alert("RTMP URL Copied", "Paste into Streamlabs or OBS to go live:\n\n" + full);
  }, [rtmpEndpoint, streamKey]);

  const flipCamera = useCallback(() => {
    if (rtmpAvailable && publisherRef.current) {
      setFrontCamera((f) => !f);
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

  const toggleStream = useCallback(async () => {
    if (!user) return;

    if (isStreaming) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      // Stop native RTMP if available
      if (rtmpAvailable && publisherRef.current) {
        publisherRef.current.stop();
      }
      try { await deleteDoc(doc(db, "live_streams", user.uid)); } catch {}
      setIsStreaming(false);
      setStreamStatus(null);
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
      // Start native RTMP if available
      if (rtmpAvailable && publisherRef.current) {
        publisherRef.current.start();
        setStreamStatus("Connecting…");
      }
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      setIsStreaming(true);
    }
  }, [user, isStreaming, streamKey, streamTitle, rigModel, rigTires, rigLift, coords, rtmpEndpoint, updateTwitchTitle]);

  // RTMP event handler (standalone only)
  const onPublishEvent = useCallback((code: number, msg: string) => {
    if (code === 2001) setStreamStatus("Live on Twitch ✓");
    else if (code >= 2000 && code < 3000) setStreamStatus(msg ?? "Connecting…");
    else if (code >= 3000) setStreamStatus("Stream error — check your key");
  }, []);

  // ── LIVE VIEW ──
  if (isStreaming) {
    const outputUrl = `${rtmpEndpoint}${streamKey}`;
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={[styles.liveCameraArea, { paddingTop: insets.top }]}>

          {/* Live camera — NodePublisher (standalone) or CameraView (Expo Go) */}
          {rtmpAvailable && NodePublisher ? (
            <NodePublisher
              ref={publisherRef}
              style={StyleSheet.absoluteFill}
              url={outputUrl}
              frontCamera={frontCamera}
              videoParam={{
                fps: 30,
                bitrate: 1500000,
                width: 720,
                height: 1280,
              }}
              audioParam={{
                samplerate: 44100,
                channels: 2,
                bitrate: 128000,
              }}
              onEvent={onPublishEvent}
            />
          ) : cameraPermission?.granted ? (
            <CameraView style={StyleSheet.absoluteFill} facing={facing} />
          ) : (
            <View style={styles.livePlaceholder}>
              <Feather name="camera-off" size={48} color="#444" />
            </View>
          )}

          {/* Flip camera */}
          <TouchableOpacity
            style={[styles.flipBtn, { top: insets.top + 12, right: 14 }]}
            onPress={flipCamera}
          >
            <Feather name="refresh-cw" size={18} color="#fff" />
          </TouchableOpacity>

          {/* LIVE badge + elapsed */}
          <View style={[styles.liveBadgeRow, { top: insets.top + 12 }]}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.elapsedText}>{formatTime(elapsed)}</Text>
          </View>

          {/* RTMP status / streaming notice */}
          {streamStatus ? (
            <View style={[styles.statusBanner, { top: insets.top + 48 }]}>
              <Text style={styles.statusText}>{streamStatus}</Text>
            </View>
          ) : (
            <View style={[styles.expoGoBanner, { top: insets.top + 48 }]}>
              <Feather name="info" size={11} color="#f5a623" />
              <Text style={styles.expoGoText}>Use the RTMP key below with Streamlabs or OBS to go live</Text>
            </View>
          )}

          {/* HUD */}
          {showHUD && (
            <View style={[styles.hud, { top: insets.top + 90, backgroundColor: "rgba(0,0,0,0.8)", borderColor: colors.accent }]}>
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
        </View>

        {/* Twitch Chat */}
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
      </View>
    );
  }

  // ── PRE-STREAM SETTINGS VIEW ──
  const paddingBottom = Platform.OS === "web" ? 34 : insets.bottom + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Camera Preview */}
      <View style={styles.cameraArea}>
        {/* NodePublisher preview (standalone) */}
        {rtmpAvailable && NodePublisher ? (
          <NodePublisher
            ref={publisherRef}
            style={StyleSheet.absoluteFill}
            frontCamera={frontCamera}
            videoParam={{ fps: 30, bitrate: 1500000, width: 720, height: 1280 }}
            audioParam={{ samplerate: 44100, channels: 2, bitrate: 128000 }}
          />
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

        {/* Flip */}
        {(cameraPermission?.granted || rtmpAvailable) && (
          <TouchableOpacity
            style={[styles.flipBtn, { top: insets.top + 12, right: 14 }]}
            onPress={flipCamera}
          >
            <Feather name="refresh-cw" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        {/* HUD */}
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

        {/* Streaming notice */}
        <View style={[styles.expoGoBanner, { top: insets.top + 8 }]}>
          <Feather name="radio" size={11} color="#f5a623" />
          <Text style={styles.expoGoText}>Copy your RTMP key below — stream with Streamlabs or OBS</Text>
        </View>

        {/* ENGAGE BROADCAST */}
        <TouchableOpacity
          style={[styles.floatingStreamBtn, { backgroundColor: colors.accent }]}
          onPress={toggleStream}
          activeOpacity={0.85}
        >
          <Feather name="radio" size={18} color="#000" />
          <Text style={[styles.streamBtnText, { color: "#000" }]}>ENGAGE BROADCAST</Text>
        </TouchableOpacity>
      </View>

      {/* Settings Panel */}
      <View style={[styles.settingsSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sheetHandleRow}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom }}
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
  liveCameraArea: { flex: 1, position: "relative", backgroundColor: "#000" },
  livePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  liveBadgeRow: { position: "absolute", left: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(211,47,47,0.9)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  elapsedText: { color: "#fff", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", fontSize: 13, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusBanner: { position: "absolute", left: 14, right: 14, backgroundColor: "rgba(0,179,0,0.15)", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { color: "#00b300", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  expoGoBanner: { position: "absolute", left: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(245,166,35,0.15)", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
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
