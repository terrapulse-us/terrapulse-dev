---
name: React Native architecture deadlock
description: Common RN 0.81 dependency conflict between reanimated v4, MapLibre v10, and newArchEnabled
---

## The deadlock (resolved by MapLibre v11)
- `react-native-reanimated` v4.x: hard Gradle assertion requiring `newArchEnabled: true`
- `react-native-reanimated` v3.x: Java compile errors on RN 0.81 (removed TRACE_TAG_REACT_JAVA_BRIDGE)  
- `@maplibre/maplibre-react-native` v10: crashes at runtime when `newArchEnabled: true`

**Solution**: Upgrade MapLibre to v11 (New Architecture native). Then `newArchEnabled: true` works for both.

**Why:** MapLibre v11 was released specifically for RN 0.80+ New Architecture support.
**How to apply:** When adding any native library to this project, verify it supports New Architecture (has codegen config or v11+ if MapLibre).
