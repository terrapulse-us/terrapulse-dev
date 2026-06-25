---
name: Expo SDK native module version pinning
description: Wrong-SDK native module packages cause immediate startup crash on all platforms; how to detect and fix
---

## The problem
If Expo native packages are pinned to a wrong SDK version (e.g. expo-dev-client 56.x with expo ~54.x), the native modules crash at startup on BOTH Android and iOS. The app opens and immediately closes with no error shown.

## Why it's hard to spot
- The EAS build succeeds — this is a runtime mismatch, not a compile error
- ErrorBoundary never fires — the crash happens before React mounts
- The symptom ("closes immediately on open") looks identical to a native module New Arch incompatibility

## Diagnosis
Run `pnpm exec expo install --check` — it reports exact expected versions for your installed expo SDK.

## Fix
Pin every Expo-managed package to the version `expo install --check` recommends. Use `~` (tilde) not `^` (caret) for Expo packages to avoid accidentally upgrading to a wrong major.

**Why:** EAS builds the native runtime from Expo's versioned SDK. Any native module whose JS-side major version doesn't match the native binary version crashes at module initialization.

## SDK 54 correct versions (verified 2026-06-25)
| Package | Wrong (was installed) | Correct |
|---|---|---|
| expo-apple-authentication | 56.0.4 | ~8.0.8 |
| expo-auth-session | 56.0.14 | ~7.0.11 |
| expo-crypto | 56.0.4 | ~15.0.9 |
| expo-dev-client | 56.0.20 | ~6.0.21 |

## Firebase 12.x + React Native persistence
`getReactNativePersistence` does NOT exist in `firebase/auth` for Firebase 12.x — calling it throws at module load time and crashes the app. Use plain `getAuth(app)` (in-memory persistence). There is no working AsyncStorage persistence path in Firebase JS SDK 12.x for React Native without a custom Persistence class.
