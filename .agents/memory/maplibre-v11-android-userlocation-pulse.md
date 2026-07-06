---
name: MapLibre RN v11 UserLocation has no pulse on Android
description: The JS UserLocation component's default puck (used on Android) has no animated pulse, unlike iOS's native puck. Custom Marker + RN Animated is the fix.
---

`<NativeUserLocation />` (iOS-only in this codebase) renders the platform-native
MapLibre location puck, which includes an animated pulse ring out of the box.

`<UserLocation />` (the cross-platform JS component, used for Android) renders a
static three-layer circle puck (`UserLocationPuck.tsx`: accuracy ring, white
outer dot, blue inner dot) with **no pulse animation** — this is a library
limitation, not a config option you're missing.

**Fix pattern:** `UserLocation` accepts a `children` prop that fully replaces
its default puck rendering. But for a cleanly independent implementation, it's
simpler to track the user's coordinates yourself (most map screens already do,
via `expo-location` `watchPositionAsync`) and render a custom `<Marker
lngLat={...}><YourPulseView /></Marker>` instead. `Marker` accepts arbitrary
RN View children and works on both platforms (native `MLNPointAnnotation` on
iOS, native View-on-projection on Android) — an RN `Animated.loop` on
scale+opacity gives a convincing breathing pulse with zero native code.

**Why:** confirmed by reading `@maplibre/maplibre-react-native` v11 source
(`UserLocation.tsx`, `UserLocationPuck.tsx`) — no `pulsing` prop exists,
despite Mapbox/Google Maps SDKs having one natively.
