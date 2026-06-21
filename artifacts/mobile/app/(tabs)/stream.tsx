import React, { useState, useEffect, useRef } from "react";
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
} from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Coords {
  latitude: number;
  longitude: number;
  speed: number;
  altitude: number;
}

export default function StreamScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamKey, setStreamKey] = useState("");
  const [rtmpEndpoint, setRtmpEndpoint] = useState("rtmp://live.twitch.tv/app/");
  const [rigModel, setRigModel] = useState("");
  const [rigTires, setRigTires] = useState("");
  const [rigLift, setRigLift] = useState("");
  const [showHUD, setShowHUD] = useState(true);
  const [coords, setCoords] = useState<Coords>({ latitude: 0, longitude: 0, speed: 0, altitude: 0 });
  const [permGranted, setPermGranted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermGranted(status === "granted");
      if (status === "granted") {
        watchRef.current = await Location.watchPositionAsync(
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
      watchRef.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const toggleStream = async () => {
    if (!user) return;

    if (isStreaming) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      stopTimer();
      try {
        await deleteDoc(doc(db, "live_streams", user.uid));
      } catch {}
      setIsStreaming(false);
    } else {
      if (!streamKey.trim()) {
        Alert.alert("Stream Key Required", "Enter your stream key to go live.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      try {
        await setDoc(doc(db, "live_streams", user.uid), {
          streamer: user.email,
          rig: { model: rigModel, tires: rigTires, lift: rigLift },
          location: { latitude: coords.latitude, longitude: coords.longitude },
          rtmpUrl: `${rtmpEndpoint}${streamKey}`,
          active: true,
          startedAt: serverTimestamp(),
        });
      } catch {}
      startTimer();
      setIsStreaming(true);
    }
  };

  const paddingBottom = Platform.OS === "web" ? 34 : insets.bottom + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* CAMERA PREVIEW AREA */}
      <View style={styles.cameraArea}>
        <View style={[styles.cameraPlaceholder, { backgroundColor: "#000" }]}>
          <Feather name="video" size={48} color={colors.border} />
          <Text style={[styles.cameraLabel, { color: colors.mutedForeground }]}>
            {isStreaming ? "LIVE BROADCAST ACTIVE" : "CAMERA PREVIEW"}
          </Text>
          {isStreaming && (
            <View style={styles.liveIndicator}>
              <View style={[styles.liveDot, { backgroundColor: colors.destructive }]} />
              <Text style={[styles.liveText, { color: "#FFF" }]}>LIVE</Text>
              <Text style={[styles.elapsedText, { color: colors.mutedForeground }]}>
                {formatTime(elapsed)}
              </Text>
            </View>
          )}
        </View>

        {/* GPS HUD OVERLAY */}
        {showHUD && (
          <View style={[styles.hud, { backgroundColor: "rgba(0,0,0,0.8)", borderColor: colors.accent }]}>
            <Text style={[styles.hudTitle, { color: colors.accent }]}>TELEMETRY</Text>
            <Text style={[styles.hudSpeed, { color: colors.success }]}>
              {coords.speed}
              <Text style={styles.hudSpeedUnit}> MPH</Text>
            </Text>
            <Text style={[styles.hudData, { color: "#FFF" }]}>
              {permGranted ? `${coords.latitude.toFixed(4)}° N` : "NO GPS"}
            </Text>
            <Text style={[styles.hudData, { color: "#FFF" }]}>
              {permGranted ? `${coords.longitude.toFixed(4)}° W` : "PERMISSION DENIED"}
            </Text>
            <Text style={[styles.hudAlt, { color: colors.mutedForeground }]}>
              ALT: {coords.altitude}m
            </Text>
            {rigModel ? (
              <Text style={[styles.hudRig, { color: "#AAA" }]}>{rigModel.toUpperCase()}</Text>
            ) : null}
          </View>
        )}
      </View>

      {/* CONTROL PANEL */}
      <ScrollView
        style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}
        contentContainerStyle={{ paddingBottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.panelTitle, { color: colors.foreground }]}>BROADCAST STATION</Text>

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

        <Text style={[styles.fieldLabel, { color: colors.accent }]}>RIG SPECS</Text>
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
            placeholder='Tires (e.g. 37")'
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

        <TouchableOpacity
          style={[
            styles.streamBtn,
            { backgroundColor: isStreaming ? colors.destructive : colors.accent },
          ]}
          onPress={toggleStream}
          activeOpacity={0.85}
        >
          <Feather name={isStreaming ? "square" : "radio"} size={18} color={isStreaming ? "#FFF" : "#000"} />
          <Text style={[styles.streamBtnText, { color: isStreaming ? "#FFF" : "#000" }]}>
            {isStreaming ? "STOP STREAM" : "ENGAGE BROADCAST"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraArea: { flex: 1, position: "relative" },
  cameraPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  cameraLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  liveIndicator: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontWeight: "900", fontSize: 12, letterSpacing: 2 },
  elapsedText: { fontSize: 12, fontFamily: "monospace" },
  hud: {
    position: "absolute",
    top: 20,
    right: 16,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 110,
  },
  hudTitle: { fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  hudSpeed: { fontSize: 32, fontWeight: "900", lineHeight: 36 },
  hudSpeedUnit: { fontSize: 11, fontWeight: "700" },
  hudData: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", marginTop: 2 },
  hudAlt: { fontSize: 10, fontWeight: "700", marginTop: 4 },
  hudRig: { fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  panel: {
    maxHeight: "45%",
    borderTopWidth: 2,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  panelTitle: { fontWeight: "900", fontSize: 14, letterSpacing: 2, marginBottom: 14 },
  fieldLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  input: {
    padding: 12,
    borderRadius: 4,
    marginBottom: 10,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  row: { flexDirection: "row", gap: 8 },
  inputFlex2: { flex: 2 },
  inputFlex1: { flex: 1 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  toggleLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggleText: { fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  streamBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 4,
  },
  streamBtnText: { fontWeight: "900", fontSize: 14, letterSpacing: 2 },
});
