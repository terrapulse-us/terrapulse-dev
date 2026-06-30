'use strict';
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
