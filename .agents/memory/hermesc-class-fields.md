---
name: hermesc v0.12.0 class field rejection
description: hermesc v0.12.0 rejects ALL class field syntax (private AND public); confirmed fix is hermes-v0 Babel profile + disabled EAS cache
---

## The rule

hermesc v0.12.0 (RN 0.81) rejects ALL class field declarations:
- Private: `#x;` / `#x = value;` → "private properties not supported"
- Public: `name;` / `x = 0;` → "invalid statement encountered" at the `class X {` line

**Why:** hermesc v0.12.0 predates the class fields proposal in the Hermes compile pipeline.
Any class field declaration (even public) inside a `__d(function(){...})` factory causes the
class declaration to be flagged as invalid.

## Confirmed working fix

`artifacts/mobile/babel.config.js`:
```js
presets: [['babel-preset-expo', {
  unstable_transformImportMeta: true,
  unstable_transformProfile: 'hermes-v0',   // <-- this is the key
}]],
plugins: [
  ['@babel/plugin-transform-class-properties', { loose: true }],
  ['@babel/plugin-transform-private-methods', { loose: true }],
  ['@babel/plugin-transform-private-property-in-object', { loose: true }],
],
```

`unstable_transformProfile: 'hermes-v0'` forces babel-preset-expo to use the v0 profile which
includes transform-class-properties, transform-private-methods, transform-private-property-in-object,
AND transform-classes. This fully converts class syntax to ES5 before hermesc sees the bundle.
The three explicit plugins are belt-and-suspenders. They are direct devDependencies in
`artifacts/mobile/package.json` so pnpm guarantees they are installed on every EAS build.

## Critical: disable EAS cache

`eas.json` must have `"cache": { "disabled": true }` on all profiles. Without this, EAS reuses
a cached JS bundle and Babel changes have NO effect — identical error line numbers across
multiple builds is the diagnostic sign that EAS cache is the culprit.

## What did NOT work

- Perl regex rename (`#x` → `___x`): produces public fields that hermesc also rejects.
- `loadFromStore()` directory scanning in babel.config.js: fragile, may silently return null on EAS.
- Metro `cacheVersion` bump alone: only invalidates Metro's local cache, not EAS's remote cache.
- hermesc wrapper via `HERMES_CLI_PATH` / `withHermescWrapper` plugin: too complex, not reliable enough.
- Adding class-properties plugin only to plugins array (without `unstable_transformProfile: 'hermes-v0'`):
  EAS's own bundle cache prevented the fix from being applied.

## Key details

- babel-preset-expo `hermes-stable` profile (hermes-v1.js) intentionally omits class-properties
  because Hermes v1 supports class fields natively — but hermesc v0.12.0 is NOT Hermes v1.
- `loose: true` required for all three class-field plugins (consistent with how react-native configures them).
- metro.config.js `transformIgnorePatterns` must NOT ignore react-native or .pnpm — react-native
  core files (DOMRect, MessageQueue, PixelRatio, etc.) have class fields that need transforming.
