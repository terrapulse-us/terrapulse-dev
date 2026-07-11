import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TOS_KEY = "tp_tos_v1_accepted";

const TOS_TEXT = `TERMS OF SERVICE

Last Updated: July 11, 2026

Welcome to TerraPulse (the "Product"). By accessing or using our Product, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Product.

1. "AS-IS" AND BETA TESTING STATUS
The Product is currently in a testing, development, and/or beta phase. You acknowledge and agree that the Product is provided on an "AS IS" and "AS AVAILABLE" basis. The Product may contain bugs, errors, and inaccuracies, and may experience unexpected downtime or data loss. We make no warranties, express or implied, regarding the stability, reliability, or availability of the Product.

2. ELIGIBILITY & USER ACCOUNTS
You must be at least 13 years of age (or the minimum legal age in your jurisdiction) to use this Product. If you create an account, you are entirely responsible for maintaining the security of your credentials and for all activities that occur under your account.

3. INTELLECTUAL PROPERTY
We own all right, title, and interest in and to the Product, including all source code, designs, graphics, and features. By using the Product, you do not acquire any ownership rights. If you provide us with any feedback, suggestions, or ideas, you grant us an unrestricted, perpetual, royalty-free license to use that feedback for any purpose without compensation to you.

4. USER CONDUCT & PROHIBITED USES
You agree not to misuse the Product. Prohibited activities include, but are not limited to:
- Attempting to reverse engineer, decompile, or disrupt the infrastructure of the Product.
- Using the Product for any illegal or unauthorized purpose.
- Uploading malicious code, viruses, or scraping data without authorization.

5. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE CREATOR(S), DEVELOPER(S), OR OPERATORS OF THIS PRODUCT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM (I) YOUR ACCESS TO OR USE OF THE PRODUCT; (II) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE PRODUCT; OR (III) ANY CONTENT OBTAINED FROM THE PRODUCT.

OUR TOTAL LIABILITY FOR ANY CLAIMS UNDER THESE TERMS SHALL NOT EXCEED $50 USD (OR THE TOTAL AMOUNT YOU PAID TO US TO USE THE PRODUCT, WHICHEVER IS LESS).

6. TERMINATION
We reserve the right to modify, suspend, or terminate the Product, your account, or your access to the Product at any time, for any reason, and without prior notice or liability.

7. GOVERNING LAW
These Terms shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law provisions. Any legal action arising under these Terms must be brought exclusively in the courts located in Riverside County, California.

8. CHANGES TO TERMS
We may update these Terms from time to time. Your continued use of the Product after any changes constitutes your acceptance of the new Terms.`;

interface Props {
  onAccepted: () => void;
}

export default function TosModal({ onAccepted }: Props) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    AsyncStorage.getItem(TOS_KEY).then((val) => {
      if (!val) setVisible(true);
      else onAccepted();
    });
  }, []);

  const handleAccept = async () => {
    await AsyncStorage.setItem(TOS_KEY, "1");
    setVisible(false);
    onAccepted();
  };

  const handleDecline = () => {
    Alert.alert(
      "Terms Required",
      "You must accept the Terms of Service to use TerraPulse. Please scroll through and accept to continue.",
      [{ text: "OK", style: "default" }]
    );
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="gavel" size={28} color="#FF5500" />
          </View>
          <View>
            <Text style={styles.tag}>TERRAPULSE</Text>
            <Text style={styles.title}>Terms of Service</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          Please read and accept our Terms of Service before continuing.
        </Text>

        <View style={styles.scrollWrap}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            indicatorStyle="white"
          >
            <Text style={styles.tosText}>{TOS_TEXT}</Text>
          </ScrollView>
        </View>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setChecked((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked && <MaterialIcons name="check" size={14} color="#000" />}
          </View>
          <Text style={styles.checkLabel}>
            I have read and agree to the Terms of Service
          </Text>
        </TouchableOpacity>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={handleDecline}
            activeOpacity={0.7}
          >
            <Text style={styles.declineBtnText}>DECLINE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.acceptBtn, !checked && styles.acceptBtnDisabled]}
            onPress={checked ? handleAccept : () => {
              Alert.alert(
                "Checkbox Required",
                "Please check the box to confirm you have read and agree to the Terms of Service.",
                [{ text: "OK" }]
              );
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="check-circle" size={18} color={checked ? "#000" : "#555"} />
            <Text style={[styles.acceptBtnText, !checked && styles.acceptBtnTextDisabled]}>
              ACCEPT
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,10,0.98)",
    paddingHorizontal: 20,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 8,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#FF5500",
    backgroundColor: "#FF550018",
    alignItems: "center",
    justifyContent: "center",
  },
  tag: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
    color: "#FF5500",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    fontWeight: "500",
    lineHeight: 20,
  },
  scrollWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  tosText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    lineHeight: 22,
    fontWeight: "400",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: "#FF5500",
    borderColor: "#FF5500",
  },
  checkLabel: {
    flex: 1,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
  },
  declineBtn: {
    flex: 1,
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  declineBtnText: {
    color: "rgba(255,255,255,0.45)",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1.5,
  },
  acceptBtn: {
    flex: 2,
    height: 52,
    borderRadius: 4,
    backgroundColor: "#FF5500",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  acceptBtnDisabled: {
    backgroundColor: "rgba(255,85,0,0.25)",
  },
  acceptBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 2,
  },
  acceptBtnTextDisabled: {
    color: "rgba(255,255,255,0.3)",
  },
});
