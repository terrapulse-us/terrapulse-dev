---
name: react-native-nodemediaclient Android New Arch incompatibility
description: Library fails to compile on Android with newArchEnabled:true; fix via autolinking exclusion and iOS-only require guard
---

## Rule
`react-native-nodemediaclient` cannot be autolinked on Android when `newArchEnabled: true` is set.

**Why:** The library ships a pre-compiled AAR built against the old React Native bridge. Expo autolinking generates `PackageList.java` that imports `cn.nodemediaclient.RCTNodeMediaClientPackage`, but that class is not exposed in the AAR in a way the New Architecture compiler can resolve. Build fails with `error: cannot find symbol` at `:app:compileReleaseJavaWithJavac`.

New Architecture cannot be disabled because MapLibre v11 requires it.

**How to apply:**
1. Add `artifacts/mobile/react-native.config.js`:
   ```js
   module.exports = {
     dependencies: {
       "react-native-nodemediaclient": {
         platforms: { android: null },
       },
     },
   };
   ```
2. In `stream.tsx`, guard the `require()` with `Platform.OS === "ios"` so the JS side never tries to load the unlinked native module on Android:
   ```ts
   if (!isExpoGo && Platform.OS === "ios") {
     try { NodePublisher = require("react-native-nodemediaclient").NodePublisher; } catch {}
   }
   ```
3. `rtmpAvailable` will be `false` on Android → the screen falls back to the copy-key / Streamlabs workflow automatically (already implemented).

Direct RTMP to Twitch therefore works only on iOS dev client / iOS builds. Android users get the copy-key fallback UI.
