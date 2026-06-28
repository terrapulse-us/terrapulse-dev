---
name: RN 0.81 hermesc private class fields workaround
description: hermesc linux64 v0.12.0 (bundled with react-native@0.81.5) rejects both private class fields (#field) and ANY class field declaration (field; / field = value;). Documents the two-part fix.
---

## Problem
hermesc linux64 v0.12.0 (bundled with RN 0.81.5) cannot compile:
1. `this.#field` — private property access
2. `#field;` / `#field = value;` — private field declarations  
3. `field;` / `field = value;` — ANY public class field declarations

This surfaces as "private properties are not supported" errors during `eas update` (OTA build) even though EAS cloud builds work fine (they use a different hermesc).

## Fix: hermesc wrapper script

Install a bash wrapper at `sdks/hermesc/linux64-bin/hermesc` (rename real binary to `hermesc.real`). The wrapper uses sed to:
1. Replace `this.#identifier` → `this.___identifier` (field access)
2. DELETE lines matching `^[spaces]#identifier[spaces][;=]` (private field declarations)
3. DELETE lines matching `^[spaces]___identifier[spaces][;=]` (converted public field declarations from pnpm patch)

Deleting declaration lines is safe — JS does not require class fields to be pre-declared; assignments in the constructor via `this.___field = x` work fine without them.

**Why not rename declarations?** Renaming `#x;` → `___x;` still leaves a class field declaration that hermesc 0.12.0 cannot parse.

## Persistence problem

Every `pnpm install` potentially creates a NEW patched react-native directory with a different hash, discarding the wrapper. Two mitigations:
1. `scripts/install-hermesc-wrapper.sh` — finds all `react-native@0.81*/hermesc` binaries and installs the wrapper if not already present
2. Root `package.json` `"postinstall": "sh scripts/install-hermesc-wrapper.sh"` — runs automatically after every `pnpm install`

**Trigger**: Adding/removing deps to `artifacts/mobile/package.json` can change the pnpm patch hash for react-native, creating a new directory.

## pnpm patch

`patches/react-native@0.81.5.patch` — 39-file patch converting `#field` → `___field` in the compiled JS sources (Libraries/ and src/private/). This handles files that DON'T go through Babel (transformIgnorePatterns excludes node_modules by default).

The patch changes field NAMES but not declarations; the wrapper deletes declarations. Both are needed.

## What doesn't work

- **Babel plugins** (`@babel/plugin-transform-class-properties` etc.): declaring them in `artifacts/mobile/package.json` as devDeps and running `pnpm install` keeps timing out. Also caused a partial install that shifted the pnpm patch hash.  
- Babel plugins ARE available transitively via `babel-preset-expo` for `private-methods` and `private-property-in-object` but NOT for `class-properties`.

## Key distinction: EAS cloud build vs OTA update

EAS cloud build (`eas build`) uses a newer hermesc on Expo's servers — no issue there. Only `eas update` (OTA, runs on the local machine) uses the bundled linux64 hermesc, which is the ancient v0.12.0.
