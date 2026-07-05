---
name: Expo web preview crashes on load for this app
description: Why the Playwright-based testing skill / app_preview screenshot tool can't be used against this mobile app's web bundle.
---

This Expo app's web bundle (served over `$REPLIT_EXPO_DEV_DOMAIN`) crashes
immediately on load with `Uncaught Error: Cannot read properties of undefined
(reading 'getEnforcing')`, thrown from `artifacts/mobile/lib/native-guard.ts`
because `TurboModuleRegistry.getEnforcing` does not exist under
`react-native-web`. This is pre-existing (confirmed present before any
AI-assistant-feature work) and not something introduced by feature changes —
the app relies on native-only modules (MapLibre, camera, etc.) that were never
expected to run on the web target.

**Why it matters:** the `testing` skill's `runTest()` (Playwright, browser-based)
and the `screenshot` tool's `app_preview` mode both drive the web bundle via a
browser. Neither can render or interact with this app in its current state —
every screenshot/test attempt will show the same crash screen, not the actual
UI.

**How to apply:** for this project, validate feature work via direct API/backend
testing (curl through `localhost:80/...`, checking workflow logs) plus careful
code review of the RN screen code, rather than browser-based e2e. Don't spend
turns trying `runTest()` or `screenshot(app_preview)` against this app expecting
it to reflect real mobile behavior — it won't, until someone invests in fixing
web-target native-module compatibility (out of scope unless explicitly asked).
