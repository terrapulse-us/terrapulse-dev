---
name: api.video camera permission + flip on New Arch
description: Camera preview black and flip not working with ApiVideoLiveStreamView on Android New Architecture — causes and confirmed fixes.
---

## Camera preview black (no preview visible)

**Root cause:** api.video's internal `PermissionsManager` (Kotlin) doesn't reliably fire the Android runtime permission dialog on New Architecture. The camera session never starts, so the preview area stays black with no user-visible prompt.

**Fix:** Proactively call expo-camera's `requestCameraPermission()` on mount (inside a `useEffect` gated on `rtmpAvailable`). Track a `camPermDenied` boolean state. Show a tappable dark overlay ("TAP TO ENABLE CAMERA") when denied. Wire `onPermissionsDenied` prop on `ApiVideoLiveStreamView` as a backstop that also sets `camPermDenied=true`.

**Why:** expo-camera's permission hook calls the OS dialog via the Expo module system, which works correctly on New Arch. Once the OS permission is granted the api.video native session can start its preview.

## Camera flip (switch camera button does nothing)

**Root cause:** Same — if the camera session never started (no permission), `liveStream.cameraPosition = value` is a no-op. After the permission fix, camera switching via `@ReactProp` works; the underlying Android setter is `liveStream.cameraPosition = getCameraFacing(value)` which does work at runtime.

**Additional reliability fix:** `key={isStreaming ? "streaming" : cameraFacing}` on `ApiVideoLiveStreamView`. Pre-stream, this forces a full native remount (new camera session) whenever facing changes — guaranteed correct. During streaming the key stays `"streaming"` so the RTMP connection is never dropped.

**How to apply:** Any screen using `ApiVideoLiveStreamView` on Android New Architecture needs both the proactive permission request and the key pattern for camera flip.
