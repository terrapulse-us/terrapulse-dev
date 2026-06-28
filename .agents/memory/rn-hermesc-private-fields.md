---
name: RN 0.81 hermesc linux64 private class fields
description: The linux64 hermesc binary bundled with react-native@0.81.5 is v0.12.0 and rejects private class fields — affects eas update on Linux
---

## Rule
When running `eas update` on Linux with react-native@0.81.5, the bundled `hermesc` (linux64-bin, v0.12.0) rejects private class fields (`#field`) in the bundle with "private properties are not supported". This affects 39 files across `src/private/` and `Libraries/` in RN 0.81.5.

**Why:** The linux hermesc shipped in the npm package is an old build (v0.12.0, HBC bytecode 96) that predates private class field support, even though the on-device Hermes runtime supports them fine. This only surfaces during `eas update` (which uses local hermesc to compile bytecode), not during dev or EAS cloud builds.

**How to apply:** A comprehensive pnpm patch is committed at `patches/react-native@0.81.5.patch` (registered in `pnpm-workspace.yaml`). It replaces all `#field` → `___field` across 39 files. This patch covers:
- `src/private/webapis/` — DOMRect, DOMRectReadOnly, DOMRectList, EventTarget, EventHandlerAttributes, Event, CustomEvent, NodeList, HTMLCollection, Performance*, DOM nodes, errors, websockets, xhr
- `Libraries/vendor/emitter/EventEmitter.js` and ~8 other Libraries/ files
- `src/private/devsupport/` — dev tools files

If `pnpm install` is re-run and the patch stops applying (hash mismatch), re-generate via:
```bash
RN_PATCHED="node_modules/.pnpm/react-native@0.81.5_patch_hash=.../node_modules/react-native"
RN_ORIG="node_modules/.pnpm/react-native@0.81.5_@babel+core@7.29.0_.../node_modules/react-native"
# diff -u each changed file and concatenate into patches/react-native@0.81.5.patch
```

**Metro config:** `transformIgnorePatterns` at the top level of `metro.config.js` (NOT `config.transformer.transformIgnorePatterns`) was also adjusted to include `.pnpm` in the allowlist — this is a secondary fix and may not be strictly necessary given the patch, but doesn't hurt.

**babel-preset-expo:** Add as explicit devDependency in `artifacts/mobile/package.json` — pnpm strict resolution prevents Metro from finding it otherwise, causing the first bundling error.
