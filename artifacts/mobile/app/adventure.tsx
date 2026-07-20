import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
  Animated,
  Easing,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Polygon,
  RadialGradient as SvgRadialGradient,
  Stop,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import type { AssistantMode } from "@/lib/assistant-api";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export const ADVENTURE_MODE_KEY = "adventure.mode";
export const ADVENTURE_REMEMBER_KEY = "adventure.remember";

type SkyPhase = "dawn" | "day" | "dusk" | "night";

function getPhase(hour: number): SkyPhase {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

const PHASE_GRADIENTS: Record<SkyPhase, [string, string, ...string[]]> = {
  dawn: ["#221D3F", "#5A3D75", "#C96F5E", "#F2BE7E"],
  day: ["#4A90C4", "#7EC0E8", "#B8E0F2", "#F5E9CF"],
  dusk: ["#141232", "#3D2460", "#94414F", "#E08A4E"],
  night: ["#04050E", "#090E22", "#101735", "#131C41"],
};

const PHASE_TEXT: Record<SkyPhase, string> = {
  dawn: "#FFF3E4",
  day: "#132A3E",
  dusk: "#FFEEDD",
  night: "#E8ECFF",
};

const PHASE_SUBTEXT: Record<SkyPhase, string> = {
  dawn: "rgba(255,243,228,0.75)",
  day: "rgba(19,42,62,0.7)",
  dusk: "rgba(255,238,221,0.72)",
  night: "rgba(232,236,255,0.7)",
};

const PHASE_CARD_BG: Record<SkyPhase, string> = {
  dawn: "rgba(255,255,255,0.12)",
  day: "rgba(255,255,255,0.45)",
  dusk: "rgba(255,255,255,0.10)",
  night: "rgba(255,255,255,0.08)",
};

const PHASE_CARD_BORDER: Record<SkyPhase, string> = {
  dawn: "rgba(255,255,255,0.22)",
  day: "rgba(19,42,62,0.18)",
  dusk: "rgba(255,255,255,0.20)",
  night: "rgba(255,255,255,0.16)",
};

const PHASE_RIDGE_FAR: Record<SkyPhase, string> = {
  dawn: "rgba(30,20,50,0.55)",
  day: "rgba(38,74,105,0.45)",
  dusk: "rgba(18,12,40,0.6)",
  night: "rgba(4,6,16,0.7)",
};

const PHASE_RIDGE_NEAR: Record<SkyPhase, string> = {
  dawn: "rgba(20,13,38,0.85)",
  day: "rgba(24,52,78,0.75)",
  dusk: "rgba(10,7,28,0.9)",
  night: "rgba(2,3,10,0.95)",
};

function getSalutation(hour: number): string {
  if (hour >= 5 && hour < 12) return "GOOD MORNING";
  if (hour >= 12 && hour < 17) return "GOOD AFTERNOON";
  if (hour >= 17 && hour < 20) return "GOOD EVENING";
  return "NIGHT OWL MODE";
}

const MODES: Array<{ id: AssistantMode; emoji: string; label: string }> = [
  { id: "offroad", emoji: "🏔️", label: "OFFROAD" },
  { id: "camping", emoji: "⛺", label: "CAMPING" },
  { id: "hiking", emoji: "🥾", label: "HIKING" },
];

// ── Sun with pulsing glow (dawn / day / dusk) ────────────────────────────────
function PulsingSun({ phase }: { phase: SkyPhase }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  const size = SCREEN_W * 0.9;
  // Day: high in the top-right. Dawn: lower left horizon. Dusk: lower right horizon.
  const pos =
    phase === "day"
      ? { top: -size * 0.32, right: -size * 0.28 }
      : phase === "dawn"
        ? { top: SCREEN_H * 0.28, left: -size * 0.42 }
        : { top: SCREEN_H * 0.30, right: -size * 0.42 };

  const core = phase === "day" ? "#FFF7D6" : "#FFD9A0";
  const glow = phase === "day" ? "#FFE9A8" : "#FF9E5E";

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", width: size, height: size },
        pos,
        { transform: [{ scale }], opacity },
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <SvgRadialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={core} stopOpacity="0.95" />
            <Stop offset="18%" stopColor={glow} stopOpacity="0.55" />
            <Stop offset="45%" stopColor={glow} stopOpacity="0.22" />
            <Stop offset="100%" stopColor={glow} stopOpacity="0" />
          </SvgRadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#sunGlow)" />
      </Svg>
    </Animated.View>
  );
}

// ── One twinkling star ───────────────────────────────────────────────────────
function Star({
  x,
  y,
  size,
  delay,
  duration,
}: {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}) {
  const twinkle = useRef(new Animated.Value(Math.random())).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(twinkle, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: 0.15,
          duration: duration * 1.4,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [twinkle, delay, duration]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#FFFFFF",
        opacity: twinkle,
      }}
    />
  );
}

function StarField({ count }: { count: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * SCREEN_W,
        y: Math.random() * SCREEN_H * 0.55,
        size: Math.random() < 0.25 ? 3 : 2,
        delay: Math.random() * 3000,
        duration: 900 + Math.random() * 1800,
      })),
    [count],
  );

  return (
    <>
      {stars.map((s) => (
        <Star key={s.id} x={s.x} y={s.y} size={s.size} delay={s.delay} duration={s.duration} />
      ))}
    </>
  );
}

// ── Drifting aurora ribbon (night / dusk) ────────────────────────────────────
function AuroraRibbon({
  colors: ribbonColors,
  top,
  height,
  drift,
  duration,
  rotate,
  idSuffix,
}: {
  colors: [string, string, string];
  top: number;
  height: number;
  drift: number;
  duration: number;
  rotate: string;
  idSuffix: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, duration]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-drift, drift] });
  const scaleY = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.25, 1] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.55, 0.85, 0.55] });

  const w = SCREEN_W * 1.6;
  const gradId = `aurora-${idSuffix}`;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top,
        left: -SCREEN_W * 0.3,
        width: w,
        height,
        opacity,
        transform: [{ translateX }, { scaleY }, { rotate }],
      }}
    >
      <Svg width={w} height={height}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={ribbonColors[0]} stopOpacity="0" />
            <Stop offset="30%" stopColor={ribbonColors[0]} stopOpacity="0.5" />
            <Stop offset="55%" stopColor={ribbonColors[1]} stopOpacity="0.6" />
            <Stop offset="80%" stopColor={ribbonColors[2]} stopOpacity="0.4" />
            <Stop offset="100%" stopColor={ribbonColors[2]} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Ellipse cx={w / 2} cy={height / 2} rx={w / 2} ry={height / 2} fill={`url(#${gradId})`} />
      </Svg>
    </Animated.View>
  );
}

// ── Mountain silhouettes ─────────────────────────────────────────────────────
function MountainRidges({ phase }: { phase: SkyPhase }) {
  const h = SCREEN_H * 0.22;
  return (
    <View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: h }}>
      <Svg width={SCREEN_W} height={h} viewBox={`0 0 ${SCREEN_W} ${h}`}>
        <Polygon
          points={`0,${h} 0,${h * 0.55} ${SCREEN_W * 0.18},${h * 0.28} ${SCREEN_W * 0.33},${h * 0.5} ${SCREEN_W * 0.52},${h * 0.15} ${SCREEN_W * 0.68},${h * 0.42} ${SCREEN_W * 0.85},${h * 0.22} ${SCREEN_W},${h * 0.48} ${SCREEN_W},${h}`}
          fill={PHASE_RIDGE_FAR[phase]}
        />
        <Polygon
          points={`0,${h} 0,${h * 0.78} ${SCREEN_W * 0.14},${h * 0.52} ${SCREEN_W * 0.3},${h * 0.72} ${SCREEN_W * 0.47},${h * 0.4} ${SCREEN_W * 0.63},${h * 0.68} ${SCREEN_W * 0.8},${h * 0.5} ${SCREEN_W},${h * 0.75} ${SCREEN_W},${h}`}
          fill={PHASE_RIDGE_NEAR[phase]}
        />
      </Svg>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function AdventureScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [now, setNow] = useState(() => new Date());
  const phase = getPhase(now.getHours());
  const salutation = getSalutation(now.getHours());

  const [name, setName] = useState("");
  const [mode, setModeState] = useState<AssistantMode>("offroad");
  const [remember, setRemember] = useState(false);
  const [prompt, setPrompt] = useState("");

  // Re-evaluate the sky every minute so the phase can roll over naturally
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fade the whole scene in on mount
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [fadeIn]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const dn = (snap.data()?.displayName as string | undefined)?.trim();
        if (!cancelled) setName(dn || user.email?.split("@")[0] || "Explorer");
      } catch {
        if (!cancelled) setName(user.email?.split("@")[0] || "Explorer");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const [savedMode, savedRemember] = await Promise.all([
          AsyncStorage.getItem(ADVENTURE_MODE_KEY),
          AsyncStorage.getItem(ADVENTURE_REMEMBER_KEY),
        ]);
        if (savedMode === "offroad" || savedMode === "camping" || savedMode === "hiking") {
          setModeState(savedMode);
        }
        setRemember(savedRemember === "1");
      } catch {
        // non-fatal — defaults stand
      }
    })();
  }, []);

  const setMode = (m: AssistantMode) => {
    setModeState(m);
    AsyncStorage.setItem(ADVENTURE_MODE_KEY, m).catch(() => {});
  };

  const toggleRemember = (v: boolean) => {
    setRemember(v);
    AsyncStorage.setItem(ADVENTURE_REMEMBER_KEY, v ? "1" : "0").catch(() => {});
  };

  const startExploring = () => {
    router.replace("/(tabs)/map");
  };

  const askAssistant = () => {
    const text = prompt.trim();
    if (!text) {
      router.replace({ pathname: "/(tabs)/assistant", params: { mode } });
      return;
    }
    router.replace({ pathname: "/(tabs)/assistant", params: { mode, prompt: text } });
  };

  const textColor = PHASE_TEXT[phase];
  const subColor = PHASE_SUBTEXT[phase];
  const cardBg = PHASE_CARD_BG[phase];
  const cardBorder = PHASE_CARD_BORDER[phase];
  const isDarkPhase = phase !== "day";

  return (
    <View style={styles.flex}>
      <LinearGradient colors={PHASE_GRADIENTS[phase]} style={StyleSheet.absoluteFill} />

      {(phase === "dawn" || phase === "day" || phase === "dusk") && <PulsingSun phase={phase} />}
      {phase === "night" && <StarField count={42} />}
      {phase === "dusk" && <StarField count={14} />}
      {phase === "dawn" && <StarField count={6} />}

      {phase === "night" && (
        <>
          <AuroraRibbon
            colors={["#3EE6A8", "#4EC9E0", "#7A5CE0"]}
            top={SCREEN_H * 0.06}
            height={SCREEN_H * 0.2}
            drift={SCREEN_W * 0.12}
            duration={9000}
            rotate="-8deg"
            idSuffix="a"
          />
          <AuroraRibbon
            colors={["#7A5CE0", "#3EE6A8", "#2BA8C9"]}
            top={SCREEN_H * 0.2}
            height={SCREEN_H * 0.16}
            drift={SCREEN_W * 0.18}
            duration={13000}
            rotate="5deg"
            idSuffix="b"
          />
        </>
      )}
      {phase === "dusk" && (
        <AuroraRibbon
          colors={["#7A5CE0", "#C96F8E", "#3EE6A8"]}
          top={SCREEN_H * 0.08}
          height={SCREEN_H * 0.14}
          drift={SCREEN_W * 0.1}
          duration={11000}
          rotate="-6deg"
          idSuffix="c"
        />
      )}

      <MountainRidges phase={phase} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Animated.View style={[styles.flex, { opacity: fadeIn }]}>
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.tabletCenter}>
              {/* Greeting */}
              <View style={styles.header}>
                <View style={[styles.salutationChip, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                  <Text style={[styles.salutationText, { color: textColor }]}>{salutation}</Text>
                </View>
                <Text style={[styles.hello, { color: textColor }]}>
                  Hello{name ? ` ${name}` : ""},
                </Text>
                <Text style={[styles.question, { color: subColor }]}>
                  what adventure are we thinking of today?
                </Text>
              </View>

              {/* Spacer where the sky breathes */}
              <View style={styles.skyGap} />

              {/* Activity pills */}
              <View style={styles.pillRow}>
                {MODES.map((m) => {
                  const active = mode === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setMode(m.id)}
                      activeOpacity={0.8}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: active
                            ? isDarkPhase
                              ? "rgba(255,255,255,0.92)"
                              : "#132A3E"
                            : cardBg,
                          borderColor: active ? "transparent" : cardBorder,
                        },
                      ]}
                    >
                      <Text style={styles.pillEmoji}>{m.emoji}</Text>
                      <Text
                        style={[
                          styles.pillLabel,
                          {
                            color: active
                              ? isDarkPhase
                                ? "#132A3E"
                                : "#FFFFFF"
                              : textColor,
                          },
                        ]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Start button */}
              <TouchableOpacity
                style={[
                  styles.startBtn,
                  { backgroundColor: isDarkPhase ? "rgba(255,255,255,0.92)" : "#132A3E" },
                ]}
                onPress={startExploring}
                activeOpacity={0.85}
              >
                <Feather
                  name="compass"
                  size={16}
                  color={isDarkPhase ? "#132A3E" : "#FFFFFF"}
                />
                <Text
                  style={[styles.startBtnText, { color: isDarkPhase ? "#132A3E" : "#FFFFFF" }]}
                >
                  START EXPLORING
                </Text>
              </TouchableOpacity>

              {/* AI prompt */}
              <View style={[styles.aiCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.aiLabel, { color: subColor }]}>
                  OR LET THE TRIP ASSISTANT PLAN IT
                </Text>
                <View style={styles.aiRow}>
                  <TextInput
                    style={[styles.aiInput, { color: textColor }]}
                    placeholder="Describe your ideal adventure..."
                    placeholderTextColor={subColor}
                    value={prompt}
                    onChangeText={setPrompt}
                    onSubmitEditing={askAssistant}
                    returnKeyType="send"
                    multiline={false}
                  />
                  <TouchableOpacity
                    onPress={askAssistant}
                    style={[
                      styles.aiSendBtn,
                      { backgroundColor: isDarkPhase ? "rgba(255,255,255,0.92)" : "#132A3E" },
                    ]}
                    activeOpacity={0.85}
                  >
                    <Feather
                      name="arrow-right"
                      size={16}
                      color={isDarkPhase ? "#132A3E" : "#FFFFFF"}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Remember toggle */}
              <View style={styles.rememberRow}>
                <Text style={[styles.rememberText, { color: subColor }]}>
                  REMEMBER MY CHOICE — SKIP THIS SCREEN
                </Text>
                <Switch
                  value={remember}
                  onValueChange={toggleRemember}
                  trackColor={{ false: "rgba(120,120,120,0.4)", true: "#3EE6A8" }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  tabletCenter: { flex: 1, maxWidth: 480, width: "100%", alignSelf: "center" },
  header: { gap: 8, marginTop: 8 },
  salutationChip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 6,
  },
  salutationText: { fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  hello: { fontSize: 32, fontWeight: "900", letterSpacing: 0.5 },
  question: { fontSize: 16, fontWeight: "600", letterSpacing: 0.3, lineHeight: 22 },
  skyGap: { flex: 1, minHeight: SCREEN_H * 0.16 },
  pillRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  pillEmoji: { fontSize: 15 },
  pillLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  startBtn: {
    height: 52,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  startBtnText: { fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  aiCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  aiLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.6 },
  aiRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiInput: { flex: 1, fontSize: 14, fontWeight: "600", paddingVertical: 6 },
  aiSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rememberText: { fontSize: 10, fontWeight: "700", letterSpacing: 1.2, flex: 1 },
});
