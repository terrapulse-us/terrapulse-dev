---
name: EAS cloud pnpm isolated linker
description: How to make Babel plugins and Expo config plugins accessible during EAS cloud builds with a pnpm workspace monorepo
---

## Rules

1. **Expo config plugins** (e.g. `@react-native-google-signin/google-signin`) referenced in `app.config.js` `plugins[]` must be resolvable by `require.resolve(module, {paths: [appDir]})` on the EAS cloud runner. If they're only reachable via pnpm workspace symlinks that EAS cloud doesn't create, the build fails with "Failed to resolve plugin … relative to artifacts/mobile". **Fix:** remove unnecessary external config plugins from `app.config.js` — check if `infoPlist` or Android config already covers what the plugin does.

2. **Babel transform plugins** (`@babel/plugin-transform-class-properties`, etc.) must be in the **workspace root `package.json` devDependencies**, not just in `artifacts/mobile/package.json`. EAS cloud uses pnpm with the isolated linker regardless of `.npmrc` `node-linker` setting, and it does NOT reliably create `artifacts/mobile/node_modules` symlinks. Packages in the root `package.json` land in root `node_modules/`, which `require.resolve` walking up from `artifacts/mobile` will find.

**Why:** EAS cloud builds clone the repo and run their own pnpm install. They ignore our `.npmrc` `node-linker=node-modules` and use isolated linker. The virtual store symlinks for workspace members are not reliably created. But root-level packages are always physically present in root `node_modules`.

**How to apply:** Any time a babel plugin, preset, or expo config plugin is added to the mobile app and EAS builds start failing with "Cannot find module" or "Failed to resolve plugin", add the package to the **root `package.json`** `devDependencies` as well.

## Packages currently in root package.json for this reason
- `@babel/core`
- `@babel/plugin-transform-class-properties`
- `@babel/plugin-transform-private-methods`
- `@babel/plugin-transform-private-property-in-object`
- `babel-preset-expo`
