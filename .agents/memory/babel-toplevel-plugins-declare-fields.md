---
name: Babel top-level plugins vs TS declare fields
description: Class-feature plugins in babel.config.js top-level plugins array run before preset TS stripping and break node_modules .ts sources with `declare` class fields.
---

**Rule:** Never put class-feature plugins (`@babel/plugin-transform-class-properties`, `transform-private-methods`, `transform-private-property-in-object`) in the top-level `plugins` array of an Expo/Metro babel.config.js. Rely on `unstable_transformProfile: 'hermes-v0'` in babel-preset-expo, which includes the same transforms internally ordered after the TypeScript transform.

**Why:** Top-level plugins run before ALL presets. Any node_modules package that ships raw `.ts` source using TypeScript `declare` class fields (e.g. expo-file-system's `ExpoFileSystem.ts`, pulled in by the File/Directory API) then fails export/bundling with "TypeScript 'declare' fields must first be transformed by @babel/plugin-transform-typescript". The bug lies dormant until some import first pulls such a file into the bundle.

**How to apply:**
- Keep the mobile babel config preset-only; hermes-v0 profile + the hermesc wrapper's AST bundle transform already cover the hermesc v0.12.0 class-syntax rejection.
- The "inline preset listed first" ordering trick passes a direct `@babel/core` transform test but still fails inside Metro's real transformer pipeline — don't trust the direct-babel repro alone; verify with an actual `npx expo export --platform android`.
- Metro `--clear` does not help here; it's an ordering problem, not a cache problem.
- The @babel/plugin-transform-* deps in the mobile package.json must STAY installed even though the config no longer references them — the hermesc wrapper's bundle transform requires them at build time and silently skips if missing.
