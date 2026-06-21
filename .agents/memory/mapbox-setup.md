---
name: Mapbox offline maps setup
description: How @rnmapbox/maps is configured in this pnpm monorepo Expo project, including web stub and EAS build token handling.
---

## What was done
Replaced `react-native-maps` (Google Maps, online-only) with `@rnmapbox/maps` (Mapbox, supports offline tile packs).

## Key decisions

**Why:** Google Maps has no offline tile download API for React Native. Mapbox `offlineManager.createPack()` lets users pre-download trail map tiles before heading into no-cell-service terrain.

**How to apply:** Any future map work should use `@rnmapbox/maps` APIs, not `react-native-maps`.

## Setup details

### Metro config (`artifacts/mobile/metro.config.js`)
- Must include `watchFolders` and `nodeModulesPaths` for pnpm workspace resolution
- Must stub `@rnmapbox/maps` on web platform → `stubs/rnmapbox-maps.web.js`
  - Without the stub, Metro web bundle crashes on `mapbox-gl/dist/mapbox-gl.css` import from Mapbox's web entry

### App config (`artifacts/mobile/app.config.js`)
- Converted from `app.json` to `app.config.js` to support dynamic env var reads
- Plugin config reads `process.env.MAPBOX_DOWNLOAD_TOKEN` for the SDK download token
- `extra.mapboxPublicToken` reads `process.env.MAPBOX_PUBLIC_TOKEN` and passes it to the app
- In app code: `MapboxGL.setAccessToken(Constants.expoConfig?.extra?.mapboxPublicToken ?? "")`

### EAS build
- `MAPBOX_DOWNLOAD_TOKEN` (sk.eyJ...) must be available as an EAS secret during Android/iOS builds
- The `@rnmapbox/maps` plugin uses it to configure `gradle.properties` for the Mapbox Android SDK download
- `RNMapboxMapsDownloadToken` plugin option is deprecated; new way is `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` env var, but old way still works

### Offline tile pack API
```ts
await MapboxGL.offlineManager.createPack(
  { name, styleURL: MapboxGL.StyleURL.Outdoors, minZoom: 8, maxZoom: 16, bounds: [[neLon, neLat], [swLon, swLat]] },
  progressCallback,
  errorCallback
);
const existing = await MapboxGL.offlineManager.getPack(name);
```

### Requires new EAS build
`@rnmapbox/maps` is a native module. JS changes are live via Metro but the map won't work until a new APK/IPA is built with the native Mapbox SDK compiled in.
