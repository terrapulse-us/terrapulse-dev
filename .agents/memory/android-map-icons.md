---
name: Android map icon rendering
description: Which icon libraries work reliably for GPS/locate buttons on Android in React Native / Expo
---

The Feather `crosshair` icon renders as a broken/missing glyph on some Android devices in Expo Go, even though other Feather icons in the same app work fine.

**Rule:** For GPS/locate-style buttons on the map screen, use `MaterialIcons` `my-location` instead of any Feather icon.

**Why:** The `my-location` icon is the exact same icon the Android OS uses in Google Maps for the locate button, so users immediately recognize it. Feather's `crosshair` uses a path that doesn't always render cleanly on Android's font rasterizer.

**How to apply:** Import `MaterialIcons` from `@expo/vector-icons` alongside `Feather`. Use `<MaterialIcons name="my-location" size={20} />` for any locate/GPS button on Android-targeted screens.

**Also note:** To suppress the native `react-native-maps` My Location button on Android, you need **both** `showsMyLocationButton={false}` AND `toolbarEnabled={false}` on the `MapView`. Either prop alone is not sufficient on all Android versions.
