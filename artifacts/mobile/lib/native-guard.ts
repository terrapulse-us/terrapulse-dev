import { TurboModuleRegistry } from "react-native";

const _orig = TurboModuleRegistry.getEnforcing.bind(TurboModuleRegistry);

(TurboModuleRegistry as { getEnforcing: unknown }).getEnforcing = <T extends object>(
  name: string
): T => {
  try {
    return _orig(name) as T;
  } catch {
    if (__DEV__) {
      console.warn(
        `[TerraPulse] Native module "${name}" not found.\n` +
          `Your installed app binary is outdated — reinstall from the latest build to enable this feature.`
      );
    }
    return new Proxy({} as T, {
      get: (_t, prop) => {
        if (prop === "then") return undefined;
        return () => undefined;
      },
    });
  }
};

// Fix RN 0.81 Event phase constants — defined without configurable/writable,
// causing event-target-shim (fetch -> abort-controller) to throw
// "TypeError: Cannot assign to read only property 'NONE'" during any auth/fetch.
try {
  const phases = [["NONE",0],["CAPTURING_PHASE",1],["AT_TARGET",2],["BUBBLING_PHASE",3]];
  for (const [name, value] of phases) {
    for (const target of [Event, Event.prototype]) {
      try {
        Object.defineProperty(target, name, { configurable: true, writable: true, value });
      } catch {}
    }
  }
} catch {}
