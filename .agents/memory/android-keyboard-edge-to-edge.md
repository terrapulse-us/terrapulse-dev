---
name: Android keyboard handling under Expo SDK 54 edge-to-edge
description: Why keyboards cover inputs on Android and the JS-only KAV fix pattern
---

Expo SDK 54 enforces edge-to-edge on Android, which disables the OS's automatic `adjustResize` window behavior — the keyboard just overlays the app, covering bottom-anchored inputs. `softwareKeyboardLayoutMode` in app config has no effect (and changing it would need a native build anyway).

**Fix (OTA-safe, JS-only):** `KeyboardAvoidingView` with `behavior="padding"` on BOTH platforms, including inside RN `<Modal>` (wrap: Modal > KAV flex:1 > backdrop > sheet). Do not leave behavior undefined on Android.

**Why `padding` is safe everywhere:** KAV adds only the measured overlap between its own frame and the keyboard (`max(frameBottom − keyboardTop + offset, 0)`), so if the window ever does resize, the padding is ~0 — no double-compensation.

**How to apply:** any screen or modal with a text input needs its own KAV; bottom-sheet modals with `maxHeight: "%"` work because the % resolves against the KAV-shrunken parent. Android only fires `keyboardDidShow` (no will-show), so the shift lands after the keyboard animation — slightly jumpy but correct. KAV cannot counteract system window panning; inputs near the top of the screen that still get hidden need scroll-into-view on focus instead.
