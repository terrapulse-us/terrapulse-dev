"use no memo";
import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import Constants from "expo-constants";

WebBrowser.maybeCompleteAuthSession();

const APP_VERSION = Constants.expoConfig?.version ?? "?";

const GOOGLE_WEB_CLIENT_ID = "516913346465-2d9sghu3nqvtbnj2ttiddu3191jkib32.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID = "516913346465-uvejqbkgh99qd8l2rfug4tqnmlj7m101.apps.googleusercontent.com";
const GOOGLE_ANDROID_CLIENT_ID = "516913346465-n9l1vgse2hr7pemaev5ubt5gjvpalvaf.apps.googleusercontent.com";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, login, register, loginWithGoogleCredential } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);

  const redirectUri = makeRedirectUri({ scheme: "terrapulse", path: "oauth2redirect" });

  const [, googleResponse, googlePromptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    // Android: use web client + scheme redirect (Android OAuth clients require Play Store for sideloaded APKs)
    redirectUri: Platform.OS === "android" ? redirectUri : undefined,
  });

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === "success") {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        setGoogleLoading(true);
        loginWithGoogleCredential(idToken)
          .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : "Google sign-in failed";
            Alert.alert("Google Sign-In Failed", msg);
          })
          .finally(() => setGoogleLoading(false));
      } else {
        setGoogleLoading(false);
        Alert.alert("Google Sign-In Failed", "No ID token returned. Try again.");
      }
    } else if (googleResponse.type === "error") {
      setGoogleLoading(false);
      Alert.alert("Google Sign-In Failed", googleResponse.error?.message ?? "Authorization error");
    } else {
      setGoogleLoading(false);
    }
  }, [googleResponse]);

  const handleGoogle = () => {
    setGoogleLoading(true);
    googlePromptAsync().catch((e: unknown) => {
      setGoogleLoading(false);
      const msg = e instanceof Error ? e.message : "Could not open Google sign-in";
      Alert.alert("Google Sign-In Failed", msg);
    });
  };

  useEffect(() => {
    if (user) router.replace("/(tabs)/map");
  }, [user]);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Authentication failed";
      Alert.alert("Auth Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.header}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={[styles.title, { color: colors.foreground }]}>
            TERRA<Text style={{ color: colors.accent }}>PULSE</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            SHARE YOUR ADVENTURE
          </Text>
          <Text style={[styles.versionBadge, { color: colors.mutedForeground }]}>
            v{APP_VERSION}
          </Text>
        </View>

        <View style={styles.form}>
          <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="mail" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="EMAIL ADDRESS"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="lock" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="PASSWORD"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.accent }, loading && styles.btnDisabled]}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                {mode === "login" ? "LOG IN" : "CREATE ACCOUNT"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => setMode(mode === "login" ? "register" : "login")}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
              {mode === "login" ? "NEW? CREATE ACCOUNT" : "ALREADY HAVE AN ACCOUNT"}
            </Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleGoogle}
            disabled={googleLoading}
            activeOpacity={0.8}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.foreground} />
            ) : (
              <>
                <Text style={styles.googleG}>G</Text>
                <Text style={[styles.socialBtnText, { color: colors.foreground }]}>
                  CONTINUE WITH GOOGLE
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          California's premier off-road trail community
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, justifyContent: "space-between" },
  header: { alignItems: "center", gap: 12 },
  logoImage: { width: 90, height: 90, borderRadius: 18, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  subtitle: { fontSize: 11, fontWeight: "700", letterSpacing: 3, textAlign: "center" },
  versionBadge: { fontSize: 10, letterSpacing: 1, opacity: 0.5 },
  form: { gap: 12 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 13, fontWeight: "600", letterSpacing: 0.5 },
  eyeBtn: { padding: 4 },
  primaryBtn: {
    height: 52,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontWeight: "900", fontSize: 14, letterSpacing: 2 },
  secondaryBtn: {
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontWeight: "700", fontSize: 12, letterSpacing: 1.5 },
  tagline: { textAlign: "center", fontSize: 11, letterSpacing: 1 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  socialBtn: {
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  socialBtnText: { fontWeight: "800", fontSize: 13, letterSpacing: 1.5 },
  googleG: { fontSize: 18, fontWeight: "900", color: "#4285F4" },
});
