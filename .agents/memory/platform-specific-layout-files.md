---
name: Platform-specific layout files for iOS/Android isolation
description: Use .ios.tsx / .android.tsx extensions to isolate platform-specific tab bar and layout changes, preventing OTA cross-contamination.
---

## Rule

For any change to `app/(tabs)/_layout.tsx` that is iOS-only, put it in `app/(tabs)/_layout.ios.tsx` instead. Android loads `_layout.tsx`, iOS loads `_layout.ios.tsx`. Metro resolves platform extensions automatically — Android never bundles the `.ios.tsx` file.

**Why:**

Removing `expo-blur` (BlurView) from `_layout.tsx` — even though Android never renders it — caused Android to crash every time the change was delivered via OTA. The exact mechanism is unclear (possible bundling side-effect, module graph change, or hermesc behavior). Empirically proven: the change is Android-safe in a native build, but breaks Android OTA reliably.

**How to apply:**

- iOS-only tab bar / layout changes → `_layout.ios.tsx`
- Android's `_layout.tsx` stays frozen and is never touched for iOS work
- Any future shared changes (e.g. adding a new tab) must be applied to BOTH files
- Never push `eas update --branch preview` (Android OTA) after editing `_layout.ios.tsx` — it's iOS-only and Android OTA is unaffected, but habit of always pushing both OTAs causes confusion
