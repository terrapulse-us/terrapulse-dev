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

## Babel plugin loading without pnpm install

To load Babel plugins that exist in the pnpm store as transitive deps but are NOT declared as direct deps of the mobile package (and thus not linked), use a `loadFromStore(pkgName)` helper in `babel.config.js` that:
1. `encode` the package name: `pkgName.replace(/@/g, '').replace(/\//g, '+')`
2. `readdirSync(node_modules/.pnpm)` and find entries starting with `@<encoded>@` or `<encoded>@`
3. `require(path.join(storeDir, match, 'node_modules', pkgName))`

This works because pnpm stores all downloaded packages in the content-addressable store regardless of whether they're declared as direct deps. No `pnpm install` needed.

Plugins loaded this way in `artifacts/mobile/babel.config.js`:
- `@babel/plugin-transform-class-properties` (loose: true)
- `@babel/plugin-transform-private-methods` (loose: true)
- `@babel/plugin-transform-private-property-in-object` (loose: true)

These transform ALL class field syntax (private `#field`, public `field;`, public `field = value;`, computed `[KEY] = value;`) to constructor assignments BEFORE hermesc sees the bundle. This is the definitive fix for the hermesc limitation.

## Failure cascade pattern

hermesc reports "invalid statement encountered" at a CLASS DECLARATION when its parser previously failed on something inside an earlier class body. This cascades: one unhandled class field causes ALL subsequent class declarations to fail.

Root classes that must be clean: DOMRectReadOnly, DOMRect, Event, CustomEvent (react-native src/private) — any unhandled class field in these causes hundreds of cascade errors.

## hermesc bundle post-transform (DEFINITIVE FIX for `eas update`)

Adding `@babel/plugin-transform-classes` to `babel.config.js` (for individual source files during Metro transform) CANNOT work due to pnpm isolated module caches. When class-properties and transform-classes both run in a Metro worker, they each load a SEPARATE instance of `@babel/helper-create-class-features-plugin` → registration coordination fails → "Missing class properties transform".

**Solution: run the transforms on the ASSEMBLED BUNDLE OUTPUT** in the hermesc wrapper, before passing to `hermesc.real`. In a single Node.js process all plugins share the same `require()` cache → same helper instance → registration works.

Script: `scripts/transform-bundle-classes.cjs` (must be `.cjs` — `scripts/` package.json has `"type": "module"`).

Plugin order in the bundle transform (critical):
1. `@babel/plugin-transform-class-properties` (loose: true) — moves static/instance fields
2. `@babel/plugin-transform-class-static-block` — static { } blocks
3. `@babel/plugin-transform-classes` (loose: true) — class declarations → functions
4. `@babel/plugin-transform-async-to-generator` — async/await → generator
5. `@babel/plugin-transform-async-generator-functions` — async function*

The hermesc wrapper (`scripts/install-hermesc-wrapper.sh`, installs via postinstall) now calls:
```bash
node --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" 2>>/tmp/hermesc-transform.log || ...
```
Run with `--force` to update already-installed wrappers: `bash scripts/install-hermesc-wrapper.sh --force`

## loadFromStore encoding bug

WRONG: `pkgName.replace(/@/g, '').replace(/\//g, '+')` 
- `@babel/plugin-foo` → `babel+plugin-foo` → looks for `@babel+plugin-foo@` → NO MATCH

CORRECT: `pkgName.replace(/\//g, '+')` only
- `@babel/plugin-foo` → `@babel+plugin-foo` → looks for `@babel+plugin-foo@` → MATCH ✓

pnpm store dirs are `@scope+package@version_...` — the leading `@` is part of the directory name, NOT removed.

## plugin-transform-classes required

`@babel/plugin-transform-class-properties` handles class FIELD declarations (moves to constructor).
`@babel/plugin-transform-classes` handles the class DECLARATION SYNTAX itself (converts to function).

If a class has NO fields (only getters/setters), class-properties has nothing to transform, and the class declaration remains. hermesc 0.12.0 fails on `class X extends Y.Z {}` even with an empty body.

Fix: add `@babel/plugin-transform-classes` (loose: true) to convert ALL class syntax to function form.

## metro.config.js cacheVersion pattern

Metro caches transform results persistently keyed by Babel config hash. Changing babel.config.js does NOT necessarily invalidate the cache if the config hash didn't change (e.g., if plugins returned null and were filtered out silently). 

Reliable cache bust: set `config.cacheVersion = 'some-new-string'` in metro.config.js. Bump this string whenever babel.config.js changes.
