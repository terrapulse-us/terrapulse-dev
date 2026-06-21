---
name: EAS build arch conflict
description: react-native-reanimated v4 and react-native-nodemediaclient cannot coexist in the same EAS build
---

**Rule:** Do not use `react-native-nodemediaclient` alongside `react-native-reanimated` v4 in an Expo SDK 54+ project.

**Why:** reanimated v4 requires `newArchEnabled: true`. nodemediaclient is an old-arch-only library from 2021 and fails Gradle compilation with new arch enabled. The two are mutually exclusive.

**How to apply:** If RTMP streaming is needed in the future, look for a new-arch-compatible library or implement via a custom Expo module. For now, the stream screen shows camera preview + GPS telemetry HUD and directs users to use Streamlabs/OBS with the copied RTMP key.
