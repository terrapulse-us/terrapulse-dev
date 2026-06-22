---
name: Expo SDK native module version pinning
description: Wrong native module major version causes hard crash on Android app open — how to diagnose and fix
---

## The problem
If a native Expo package (e.g. expo-file-system) is pinned to a wrong major version (56.x when SDK 54 expects ~19.x), the Android runtime finds an incompatible native binary at startup and kills the process immediately. The app opens and closes with no error shown.

## Why it's hard to spot
- The EAS build succeeds — this is a runtime mismatch, not a compile error
- ErrorBoundary never fires — the crash happens before React mounts
- The symptom ("closes immediately on open") looks identical to a native module New Arch incompatibility

## Diagnosis
Check installed versions against what Expo SDK expects:
```js
const bundled = require('node_modules/expo/bundledNativeModules.json');
// compare against package.json dependencies
```

## Fix
Pin every Expo-managed package to the version in `bundledNativeModules.json`. Use `~` (tilde) ranges not `^` (caret) for Expo packages to avoid accidentally installing a wrong major version.

**Why:** EAS builds the native runtime from Expo's versioned SDK. Any native module whose JS-side major version doesn't match the native binary version will crash at module initialization.
