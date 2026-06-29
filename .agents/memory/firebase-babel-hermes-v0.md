---
name: Firebase + Babel hermes-v0 read-only NONE bug
description: Babel hermes-v0 class transform makes a Firebase property named 'NONE' non-writable, causing auth/network-request-failed at runtime in Hermes strict mode.
---

# Firebase + Babel hermes-v0 → "Cannot assign to read-only property 'NONE'"

## The rule
Firebase (`firebase`, `@firebase/*`) packages must be excluded from Metro's Babel transformation pipeline. Add a second `transformIgnorePatterns` entry that matches their `.pnpm` paths.

```js
config.transformIgnorePatterns = [
  `${workspaceRoot}/node_modules/(?!(\\.pnpm|react-native|@react-native))`,
  `${workspaceRoot}/node_modules/\\.pnpm\\/(@firebase|firebase)`,  // ← keep Firebase out of Babel
];
```

**Why:** Firebase packages live in `.pnpm`, which is in the first pattern's exception list (meaning they ARE Babel-transformed). The `hermes-v0` profile includes `@babel/plugin-transform-classes` in spec mode, which uses `Object.defineProperty` for class members. This inadvertently makes some Firebase class property named `'NONE'` (in `InMemoryPersistence` or adjacent code) non-writable. At runtime, Hermes strict mode throws `TypeError: Cannot assign to read-only property 'NONE'`. Firebase's `_performFetchWithErrorHandling` catch block wraps this as `auth/network-request-failed`, hiding the real cause.

**How to apply:** Whenever `metro.config.js` `transformIgnorePatterns` is changed, verify Firebase still has its own exclusion entry. Firebase's pre-built CJS (`dist/rn/`) uses standard ES2017+ class syntax that Hermes v0.12.0 handles natively — no Babel transform is needed or wanted.

Also bump `cacheVersion` whenever `transformIgnorePatterns` changes to force Metro to discard all cached transforms.
