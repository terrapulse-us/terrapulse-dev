---
name: MapLibre v10 → v11 migration
description: API rename map for upgrading @maplibre/maplibre-react-native from v10 to v11 (RN 0.81 compatible)
---

## Why v11
MapLibre v10 has no New Architecture support and crashes at runtime on RN 0.81.5
even with `setAccessToken(null)`. v11 is a full New Architecture rewrite targeting
`react-native >= 0.80.0, expo >= 54.0.0`.

## API rename table (v10 → v11)
| v10 | v11 |
|-----|-----|
| `import MapLibreGL from "..."` | named imports `{ Map, Camera, ... }` |
| `MapLibreGL.setAccessToken(null)` | REMOVE — not needed |
| `MapLibreGL.MapView` | `Map` |
| `MapLibreGL.Camera` ref type | `CameraRef` |
| Camera `centerCoordinate` prop | `center` |
| Camera `zoomLevel` prop | `zoom` |
| `cameraRef.current?.setCamera({centerCoordinate, zoomLevel, animationDuration})` | `flyTo({center, zoom, duration})` |
| `fitBounds([ne],[sw], padding, dur)` | `fitBounds([w,s,e,n], {padding:{top,right,bottom,left}, duration})` |
| `MapLibreGL.UserLocation visible={bool}` | `UserLocation` (no visible prop) |
| `MapLibreGL.PointAnnotation coordinate onSelected` | `Marker lngLat onPress` |
| `MapLibreGL.ShapeSource shape={...}` | `GeoJSONSource data={...}` |
| `MapLibreGL.LineLayer style={{lineColor,...}}` | `Layer type="line" paint={{"line-color",...}}` |
| `MapLibreGL.offlineManager.getPack(name)` | `OfflineManager.getPacks()` + filter by metadata |
| `offlineManager.createPack({name, styleURL, bounds:[[],[]]})` | `OfflineManager.createPack({mapStyle, bounds:[w,s,e,n], metadata})` |

**Why:** MapLibre changed from a Mapbox-compatible API to a more standard MapLibre GL JS-aligned API.
