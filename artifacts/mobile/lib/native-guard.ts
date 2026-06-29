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
