'use strict';
// Intercept Object.defineProperty BEFORE any modules run.
// When react-native/Event.js defines NONE/CAPTURING_PHASE/AT_TARGET/BUBBLING_PHASE
// as non-configurable, this intercept silently forces configurable+writable=true,
// so event-target-shim (used by fetch -> abort-controller) can redefine them
// without throwing "TypeError: Cannot assign to read-only property 'NONE'".
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
