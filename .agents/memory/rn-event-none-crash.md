---
name: RN 0.81 Event.NONE non-configurable crash
description: TypeError on login — event-target-shim can't redefine Event phase constants in RN 0.81+
---

## The rule
Patch `react-native/src/private/webapis/dom/events/Event.js` to add `configurable: true, writable: true` to all 8 `Object.defineProperty` calls for the phase constants (`NONE`, `CAPTURING_PHASE`, `AT_TARGET`, `BUBBLING_PHASE`) on both `Event` and `Event.prototype`.

**Why:** RN 0.81+ defines these constants without `configurable` or `writable` (both default `false`). When any auth flow triggers `fetch()`, the chain `fetch → abort-controller → event-target-shim` tries to redefine these same constants on the global `Event` object and throws `TypeError: Cannot assign to read only property 'NONE'`. Firebase auth, Google Sign-In, or any `fetch`-based login will crash.

**How to apply:** The fix lives in `patches/react-native@0.81.5.patch`. If upgrading RN, re-check whether the new version's `Event.js` still lacks `configurable: true` in those `defineProperty` calls. Also bump `cacheVersion` in `metro.config.js` after any patch change.

## OTA-specific gotcha (critical)
The pnpm patch is applied at EAS **native build** time. OTA bundles produced from the Codespace do NOT automatically carry the patch — metro's transform cache may serve the old unpatched Event.js even if the source file looks correct.

**Symptoms:** Native APK works fine; applying any OTA immediately brings back the crash.

**Fix for OTA:** Use the `Object.defineProperty` interceptor in `polyfills/eventPhasePolyfill.js` — it runs in the Metro serializer polyfill layer (before ANY module code), so it intercepts Event.js's defineProperty calls at bundle evaluation time:

```js
(function () {
  var _orig = Object.defineProperty.bind(Object);
  var EVENT_PHASES = { NONE: true, CAPTURING_PHASE: true, AT_TARGET: true, BUBBLING_PHASE: true };
  Object.defineProperty = function (target, prop, descriptor) {
    if (EVENT_PHASES[prop]) {
      descriptor = { configurable: true, writable: true, enumerable: !!descriptor.enumerable, value: descriptor.value };
    }
    return _orig(target, prop, descriptor);
  };
})();
```

**Do NOT** use `if (typeof Event === 'undefined') return` in the polyfill — `Event` is NOT a global at polyfill time in Hermes (it's a module, defined when Event.js is first required). That guard always early-returns and the polyfill does nothing.

**Do NOT** try to fix this in `native-guard.ts` or other module-level code — by the time any module runs, Event.js has already defined the constants as non-configurable, and `Object.defineProperty` with a new descriptor will throw.

## Also bump cacheVersion
After changing the polyfill or the patch, bump `config.cacheVersion` in `metro.config.js` (e.g. `hermesc-compat-v13`) to force metro to discard cached transforms and re-bundle from patched source.

## pnpm store path confusion
With pnpm, there may be TWO react-native installations in `.pnpm/` with different `patch_hash` values. The one metro uses is the symlink target of `artifacts/mobile/node_modules/react-native`. Check with `readlink artifacts/mobile/node_modules/react-native` and `grep -c "configurable: true" <that path>/src/private/webapis/dom/events/Event.js` — should return 8.
