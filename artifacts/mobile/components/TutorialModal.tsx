import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
} from "react-native";
import { MaterialIcons, Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const TUTORIAL_KEY = "tp_tutorial_v2_seen";
const { width: SCREEN_W } = Dimensions.get("window");

interface Slide {
  iconLib: "material" | "feather";
  icon: string;
  tag: string;
  title: string;
  body: string;
  accent: string;
}

const SLIDES: Slide[] = [
  {
    iconLib: "material",
    icon: "terrain",
    tag: "WELCOME",
    title: "TerraPulse",
    body: "Your off-road command center. Explore trails across the entire US, record rides, stream live to Twitch, and connect with the off-road community.",
    accent: "#FF5500",
  },
  {
    iconLib: "feather",
    icon: "map",
    tag: "TRAILS TAB",
    title: "Find Your Next Trail",
    body: "Browse 400+ verified off-road trails across every US state. Use the state filter at the top to narrow it down. Tap any circle marker to open the trail detail sheet.",
    accent: "#FF5500",
  },
  {
    iconLib: "material",
    icon: "touch-app",
    tag: "TRAIL DETAILS",
    title: "Tap Any Trail Marker",
    body: "Each trail shows its difficulty rating, recommended vehicle size, suspension requirements, and community photos. Mark trails as completed to track your progress and rank up.",
    accent: "#FF9800",
  },
  {
    iconLib: "material",
    icon: "add-a-photo",
    tag: "TRAIL PHOTOS",
    title: "Share Trail Photos",
    body: "Inside a trail's detail sheet, tap ADD PIC to upload your own photos from the trail. Every photo you add is visible to the entire TerraPulse community.",
    accent: "#FF9800",
  },
  {
    iconLib: "material",
    icon: "layers",
    tag: "MAP STYLES",
    title: "Switch Map Styles",
    body: "Use the Layers button on the right side of the map to switch between Standard, USGS Topo, and 3D Terrain views. In 3D mode, pinch and tilt to see real elevation with hillshade.",
    accent: "#FF5500",
  },
  {
    iconLib: "material",
    icon: "terrain",
    tag: "3D TERRAIN",
    title: "Fly Over Real Terrain",
    body: "Switch to 3D Terrain in the layers panel. Use two fingers to tilt and rotate the map and see true elevation with hillshade shadows — perfect for scouting canyons, ridgelines, and mountain passes before you go.",
    accent: "#D4860A",
  },
  {
    iconLib: "material",
    icon: "map",
    tag: "LIVE TRAIL DATA",
    title: "5 Trail Data Sources",
    body: "Open the layers panel and toggle on USFS Motor Vehicle Use Maps, USFS NFS Trails (158,000+ miles of classified national forest trails), OpenStreetMap off-road tracks, and BLM land status — each with its own color and on/off switch.",
    accent: "#2D6A4F",
  },
  {
    iconLib: "material",
    icon: "navigation",
    tag: "TRAIL GUIDE",
    title: "Guided Trail Navigation",
    body: "Tap any trail pin on the map to open the Trail Guide sheet. See the trail's length, surface type, trail class, allowed vehicles, and mileage waypoints. Hit FOLLOW THIS TRAIL to start live GPS navigation along that exact route.",
    accent: "#1A6B9E",
  },
  {
    iconLib: "material",
    icon: "gps-fixed",
    tag: "GPS FOLLOW",
    title: "Lock to Your Position",
    body: "Tap the locate button (bottom-right) to enable GPS follow mode. The map locks on to your position and rotates with your direction of travel. Tap again to disengage.",
    accent: "#FF5500",
  },
  {
    iconLib: "feather",
    icon: "circle",
    tag: "RECORD RIDE",
    title: "Track Your Ride",
    body: "Tap RECORD at the bottom of the map to start a live GPS session. Your speed, total miles, elevation gain, and time update in real time as your route draws on the map.",
    accent: "#FF5500",
  },
  {
    iconLib: "material",
    icon: "add-location-alt",
    tag: "ADD A TRAIL",
    title: "Discover & Share Trails",
    body: "Found a hidden gem? Tap the Add Trail button (diamond icon, right side), drive the route, then stop and name it. Your trail goes live immediately as a diamond marker for the whole community.",
    accent: "#00E676",
  },
  {
    iconLib: "feather",
    icon: "radio",
    tag: "BROADCAST TAB",
    title: "Stream Live to Twitch",
    body: "Connect your Twitch account and go live directly from the trail. Flip between front and rear cameras mid-stream. Share the adventure in real time with your audience.",
    accent: "#9146FF",
  },
  {
    iconLib: "feather",
    icon: "award",
    tag: "RANKS TAB",
    title: "Climb the Leaderboard",
    body: "Complete trails to earn your rank. The more trails you conquer, the higher you climb nationally. Gold, silver, and bronze podium spots are awarded to the top three riders.",
    accent: "#FFD700",
  },
  {
    iconLib: "material",
    icon: "group",
    tag: "RIDERS TAB",
    title: "Connect with Riders",
    body: "Browse the TerraPulse community. Search riders by name or rig, view their completed trails and achievements. Set your profile to Public to appear here and connect with others.",
    accent: "#FF5500",
  },
  {
    iconLib: "material",
    icon: "person",
    tag: "PROFILE TAB",
    title: "Build Your Garage",
    body: "Add your vehicle specs (make, model, year, tires, suspension, mods), upload rig photos, and track every trail you've completed. Your profile is your off-road identity.",
    accent: "#FF5500",
  },
  {
    iconLib: "material",
    icon: "check-circle",
    tag: "ALL SET",
    title: "Ready to Ride!",
    body: "You know the terrain. Explore trails, record rides, stream live, and conquer the leaderboard. The TerraPulse community is out there — go find it.",
    accent: "#00E676",
  },
];

export default function TutorialModal() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY).then((val) => {
      if (!val) setVisible(true);
    });
  }, []);

  const dismiss = async () => {
    await AsyncStorage.setItem(TUTORIAL_KEY, "1");
    setVisible(false);
  };

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    } else {
      dismiss();
    }
  };

  if (!visible) return null;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          scrollEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setIndex(newIndex);
          }}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width: SCREEN_W }]}>
              <View
                style={[
                  styles.iconWrap,
                  { borderColor: item.accent, backgroundColor: `${item.accent}18` },
                ]}
              >
                {item.iconLib === "material" ? (
                  <MaterialIcons name={item.icon as never} size={64} color={item.accent} />
                ) : (
                  <Feather name={item.icon as never} size={56} color={item.accent} />
                )}
              </View>

              <Text style={[styles.tag, { color: item.accent }]}>{item.tag}</Text>
              <Text style={[styles.title, { color: "#FFFFFF" }]}>{item.title}</Text>
              <Text style={[styles.body, { color: "rgba(255,255,255,0.75)" }]}>{item.body}</Text>
            </View>
          )}
        />

        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                listRef.current?.scrollToIndex({ index: i, animated: true });
                setIndex(i);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === index ? slide.accent : colors.border,
                    width: i === index ? 20 : 6,
                  },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.btnRow}>
          {!isLast ? (
            <TouchableOpacity
              style={[styles.skipBtn, { borderColor: colors.border }]}
              onPress={dismiss}
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>SKIP</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.nextBtn,
              { backgroundColor: slide.accent, flex: isLast ? 1 : undefined },
            ]}
            onPress={goNext}
          >
            <Text style={styles.nextText}>{isLast ? "LET'S RIDE!" : "NEXT"}</Text>
            {!isLast && <Feather name="arrow-right" size={16} color="#000" />}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,10,0.97)",
    justifyContent: "center",
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 14,
  },
  iconWrap: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  tag: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.5,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 25,
    textAlign: "center",
    fontWeight: "500",
    maxWidth: 340,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 22,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  skipBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 4,
    borderWidth: 1,
  },
  skipText: {
    fontWeight: "800",
    letterSpacing: 1.5,
    fontSize: 12,
  },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 4,
    gap: 8,
  },
  nextText: {
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 13,
    color: "#000",
  },
});
