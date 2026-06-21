import React from "react";
import { ScrollView, Text, View, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export default function PrivacyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>PRIVACY POLICY</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.updated, { color: colors.mutedForeground }]}>Last updated: June 2025</Text>

        <Section title="Overview" colors={colors}>
          TerraPulse ("we", "us", or "our") is a California off-road trail finder app. This policy explains what data we collect, how we use it, and your rights. By using TerraPulse, you agree to this policy.
        </Section>

        <Section title="Data We Collect" colors={colors}>
          <BulletItem colors={colors} label="Account data">Your email address and authentication credentials, stored securely via Firebase Authentication.</BulletItem>
          <BulletItem colors={colors} label="Location data">GPS coordinates, speed, and altitude while the app is in use — used for trail navigation, telemetry overlay, and community stream markers. We do not store location history.</BulletItem>
          <BulletItem colors={colors} label="Camera & microphone">Used only during live broadcasts you initiate. We do not record, store, or transmit any video or audio except the live stream you send directly to Twitch.</BulletItem>
          <BulletItem colors={colors} label="Stream key">Stored locally on your device only using encrypted AsyncStorage. Never transmitted to our servers.</BulletItem>
          <BulletItem colors={colors} label="Twitch account">If you connect Twitch, we store your Twitch display name and channel (not your password). Your Twitch OAuth token is used only to update your stream title on Twitch's servers.</BulletItem>
          <BulletItem colors={colors} label="Community posts">Trail posts, photos, and comments you submit are stored in Firebase Firestore and visible to other users.</BulletItem>
          <BulletItem colors={colors} label="Rig specs">Vehicle model, tire size, and lift height you enter are stored per-session and optionally shown on your public stream.</BulletItem>
        </Section>

        <Section title="How We Use Your Data" colors={colors}>
          {"• Authenticate your account and persist your session\n• Show your GPS telemetry during live streams\n• Display nearby active streams on the community map\n• Update your Twitch stream title when you go live\n• Show your posts and rig info to the community\n• Operate the leaderboard and RIDERS features"}
        </Section>

        <Section title="Data Sharing" colors={colors}>
          We do not sell your personal data. We share data only with:{"\n\n"}
          {"• Firebase (Google) — authentication, database, and storage infrastructure\n• Twitch — only when you explicitly connect your account\n• No advertising networks or third-party analytics"}
        </Section>

        <Section title="Data Retention" colors={colors}>
          Your account data is retained until you delete your account. Live stream session data is deleted when you end your broadcast. Community posts remain until you delete them. You may request full data deletion by contacting us.
        </Section>

        <Section title="Your Rights" colors={colors}>
          You may request access to, correction of, or deletion of your personal data at any time. California residents have additional rights under the CCPA, including the right to know what personal information is collected and the right to opt out of sale (we do not sell data).
        </Section>

        <Section title="Children's Privacy" colors={colors}>
          TerraPulse is not directed to children under 13. We do not knowingly collect personal information from children under 13.
        </Section>

        <Section title="Security" colors={colors}>
          We use industry-standard security measures including Firebase's built-in security rules, encrypted data transmission (HTTPS/TLS), and local-only storage of sensitive values like stream keys.
        </Section>

        <Section title="Contact" colors={colors}>
          For privacy questions or data deletion requests, contact us at privacy@terrapulse.app
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.accent }]}>{title.toUpperCase()}</Text>
      {typeof children === "string" ? (
        <Text style={[styles.body, { color: colors.foreground }]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function BulletItem({ label, children, colors }: { label: string; children: string; colors: any }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bulletLabel, { color: colors.foreground }]}>{label}: </Text>
      <Text style={[styles.bulletBody, { color: colors.mutedForeground }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { width: 36, alignItems: "flex-start" },
  title: { fontWeight: "900", fontSize: 13, letterSpacing: 2 },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  updated: { fontSize: 11, marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  body: { fontSize: 13, lineHeight: 20 },
  bulletRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  bulletLabel: { fontSize: 13, fontWeight: "700", lineHeight: 20 },
  bulletBody: { fontSize: 13, lineHeight: 20, flex: 1 },
});
