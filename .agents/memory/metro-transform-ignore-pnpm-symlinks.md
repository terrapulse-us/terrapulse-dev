---
name: Metro transformIgnorePatterns and pnpm symlinks
description: How pnpm's top-level symlinks break Metro's transformIgnorePatterns when anchored to workspaceRoot + (?!\.pnpm)
---

## The rule

When anchoring `transformIgnorePatterns` to `workspaceRoot/node_modules/`, you MUST also exempt
`react-native` and `@react-native` from ignoring — not just `.pnpm`.

**Why:** pnpm creates top-level hoisted symlinks at:
  `workspaceRoot/node_modules/react-native`  →  `.pnpm/react-native@x.y.z/.../react-native`

Metro resolves `require('react-native')` and finds it via the **symlink path** (before following the link).
The symlink path is `workspaceRoot/node_modules/react-native/Libraries/.../DOMRectReadOnly.js`.
A pattern `(?!\.pnpm)` matches `react-native` (since it is not `.pnpm`) → file flagged IGNORED →
Babel skips it → private class fields pass unchanged into hermesc → build failure.

**How to apply:** Use this pattern instead:

```js
config.transformIgnorePatterns = [
  `${workspaceRoot}/node_modules/(?!(\\.pnpm|react-native|@react-native))`,
];
```

The `workspaceRoot` prefix still prevents the "second-segment" problem (the pattern cannot
match at the second `node_modules/` inside `.pnpm/<pkg>@ver/node_modules/` because those paths
don't have the full `workspaceRoot/node_modules/` prefix there).

Also bump `config.cacheVersion` whenever this changes to flush Metro's transform cache.
