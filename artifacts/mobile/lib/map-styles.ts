import Constants from "expo-constants";

// Shared MapTiler style config. Extracted from map.tsx so lib/offline-maps.ts
// can create offline packs from the SAME style the live map renders — packs
// made from a different style pin useless resources (the original bug: packs
// downloaded openfreemap liberty while the map rendered MapTiler styles, so
// saved maps never worked offline).

export const MAPTILER_KEY: string =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.maptilerApiKey ?? (process.env.EXPO_PUBLIC_MAPTILER_KEY ?? "");

export function mtStyle(id: string): string {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

// MapTiler Outdoor v2 — contours, hiking/offroad routes, rich terrain detail
export const STANDARD_STYLE_URL = mtStyle("outdoor-v2");
// MapTiler Hybrid — high-res satellite imagery + road/label overlay
export const SATELLITE_STYLE_URL = mtStyle("hybrid");
// MapTiler Topo v2 — topographic focus with elevation contours
export const TOPO_STYLE_URL = mtStyle("topo-v2");
// Terrain 3D drapes hybrid satellite over the terrain DEM (injected at
// runtime in map.tsx). This URL is only the flat fallback if that fetch fails.
export const TERRAIN3D_STYLE_URL = SATELLITE_STYLE_URL;

// Offline packs are ALWAYS created from the topo style (the app's default map
// layer). When connectivity drops, map.tsx forces the layer back to "topo" so
// the packed resources exactly match what the live map requests. Packing
// per-active-layer instead would make offline behavior depend on which layer
// happened to be active at download time.
export const OFFLINE_PACK_STYLE_URL = TOPO_STYLE_URL;
