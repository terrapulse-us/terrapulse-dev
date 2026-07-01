---
name: iOS hermesc uses pod hermesc, not node_modules osx-bin
description: iOS Xcode builds use $PODS_ROOT/hermes-engine/destroot/bin/hermesc; osx-bin in node_modules is irrelevant for iOS; withHermescWrapper plugin sets HERMES_CLI_PATH to redirect hermesc-ios-wrapper.sh
---

## Rule
iOS Xcode builds invoke hermesc via `react-native-xcode.sh` line:
```bash
[ -z "$HERMES_CLI_PATH" ] && HERMES_CLI_PATH="$HERMES_ENGINE_PATH/destroot/bin/hermesc"
```
This points to `$PODS_ROOT/hermes-engine/destroot/bin/hermesc` — the CocoaPods pod binary, NOT `node_modules/.pnpm/react-native@.../sdks/hermesc/osx-bin/hermesc`.

Wrapping `osx-bin/hermesc` via `install-hermesc-wrapper.sh` has NO EFFECT on iOS builds.

**Why:** The iOS build sequence on EAS is:
1. `pnpm install` → `eas-build-post-install` (wraps node_modules hermesc)
2. `expo prebuild` (generates ios/ via config plugins)
3. `pod install` (installs `hermes-engine` pod with its own hermesc)
4. Xcode build → `react-native-xcode.sh` → calls pod hermesc

The pod hermesc is installed in step 3, after our wrapper runs in step 1.

## How to apply
The `withHermescWrapper` Expo config plugin (`plugins/withHermescWrapper.js`) adds a Podfile `post_install` hook that sets `HERMES_CLI_PATH` in the Xcode project build settings to `scripts/hermesc-ios-wrapper.sh`. The script pre-processes the bundle with perl before calling `$PODS_ROOT/hermes-engine/destroot/bin/hermesc`.

**Critical:** `./plugins/withHermescWrapper` MUST be registered in `app.config.js` plugins array. If it is not, `HERMES_CLI_PATH` is never set, Xcode calls the pod hermesc directly, and the perl pre-processing never runs.

## hermesc-ios-wrapper.sh
- Applies perl step 1: `s/#([a-zA-Z_][a-zA-Z0-9_]*)/___$1/g` (rename all #x → ___x)
- Applies perl step 2: delete bare field declaration lines `___x;` / `___x =`
- Does NOT run `transform-bundle-classes.cjs` — the Babel re-parse/serialize step corrupted the Metro bundle and caused expo-updates SIGABRT on startup.
