---
name: HaishinKit 1.x / iOS SDK 26 incompatibility
description: HaishinKit 1.x (used by @api.video/react-native-livestream 2.x) is incompatible with Xcode 26 / iOS SDK 26 due to removed AVFoundation APIs — no post_install flag can fix it.
---

## Rule
Disable iOS autolinking for `@api.video/react-native-livestream` in `react-native.config.js` when building with Xcode 26 / iOS SDK 26.

```js
// react-native.config.js
module.exports = {
  dependencies: {
    "@api.video/react-native-livestream": {
      platforms: { ios: null },
    },
  },
};
```

**Why:** HaishinKit 1.x (pinned by api.video 2.x) uses AVFoundation APIs that were removed in iOS SDK 26. Swift compiler flags (`SWIFT_VERSION=5`, `SWIFT_STRICT_CONCURRENCY=minimal`) set via `post_install` hook do not help — the failures are missing symbols, not concurrency warnings. Xcodebuild exits with status 65. The only fix without waiting for the library to update is to exclude it from the iOS build entirely.

**How to apply:** Keep the `ios: null` exclusion in place. The stream screen (`app/(tabs)/stream.tsx`) already gracefully falls back to a "copy RTMP URL → use Streamlabs/OBS" UI when `ApiVideoLiveStreamView` is null. Android keeps full direct RTMP streaming. Re-enable when api.video/HaishinKit ships iOS 26 SDK compatibility.

**Critical JS-side guard:** Setting `ios: null` in `react-native.config.js` only prevents native linking — the JS module is still bundled and `require()` still succeeds. Without a `Platform.OS === "android"` guard around the require, `rtmpAvailable` becomes `true` on iOS and the app crashes with "Unimplemented component: ...mView" when it tries to render the unlinked native view. Always gate the require on platform:

```ts
if (!isExpoGo && Platform.OS === "android") {
  try { ApiVideoLiveStreamView = require("@api.video/react-native-livestream").ApiVideoLiveStreamView; } catch {}
}
```

**Side note:** CocoaPods does NOT allow multiple `post_install` blocks. Any Expo config plugin that injects Podfile code must insert inside the existing `post_install` block using a `.replace()` on `post_install do |installer|`, not append a new block.
