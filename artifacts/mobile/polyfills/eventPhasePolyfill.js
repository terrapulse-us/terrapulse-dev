'use strict';
// Polyfill: make Event phase constants configurable+writable before any module loads.
// Prevents "TypeError: Cannot assign to read-only property 'NONE'" that crashes the
// app at startup when event-target-shim tries to write Event.NONE in RN 0.81.x.
// Runs in the Metro serializer polyfill layer — before any user/library module code.
(function () {
  if (typeof Event === 'undefined') return;
  var phases = { NONE: 0, CAPTURING_PHASE: 1, AT_TARGET: 2, BUBBLING_PHASE: 3 };
  var targets = [Event, Event.prototype];
  Object.keys(phases).forEach(function (key) {
    targets.forEach(function (target) {
      if (!target) return;
      try {
        var desc = Object.getOwnPropertyDescriptor(target, key);
        if (desc && (!desc.configurable || !desc.writable)) {
          Object.defineProperty(target, key, {
            configurable: true,
            writable: true,
            value: phases[key],
          });
        }
      } catch (_) {}
    });
  });
})();
