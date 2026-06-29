---
name: RN 0.81 Event.NONE non-configurable crash
description: TypeError on login — event-target-shim can't redefine Event phase constants in RN 0.81+
---

## The rule
Patch `react-native/src/private/webapis/dom/events/Event.js` to add `configurable: true, writable: true` to all 8 `Object.defineProperty` calls for the phase constants (`NONE`, `CAPTURING_PHASE`, `AT_TARGET`, `BUBBLING_PHASE`) on both `Event` and `Event.prototype`.

**Why:** RN 0.81+ defines these constants without `configurable` or `writable` (both default `false`). When any auth flow triggers `fetch()`, the chain `fetch → abort-controller → event-target-shim` tries to redefine these same constants on the global `Event` object and throws `TypeError: Cannot assign to read only property 'NONE'`. Firebase auth, Google Sign-In, or any `fetch`-based login will crash.

**How to apply:** The fix lives in `patches/react-native@0.81.5.patch`. If upgrading RN, re-check whether the new version's `Event.js` still lacks `configurable: true` in those `defineProperty` calls. Also bump `cacheVersion` in `metro.config.js` after any patch change.
