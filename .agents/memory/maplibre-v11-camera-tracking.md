---
name: MapLibre RN v11 Camera tracking prop
description: The correct prop name and values for GPS follow/tracking mode in MapLibre RN v11 Camera.
---

## Rule

Use `trackUserLocation` on Camera, **not** `followUserLocation` (which is the old RN or web MapLibre API).

```tsx
<Camera
  ref={cameraRef}
  trackUserLocation={followUser ? "course" : undefined}
/>
```

Valid values: `"default"` (centers user) | `"heading"` (compass bearing) | `"course"` (direction of travel bearing) | `undefined` (disabled).

There is **no** `followZoomLevel` or `followPitch` prop. To set a specific zoom when engaging tracking, manually call `cameraRef.current?.flyTo({ center: [lng, lat], zoom: 14 })` first, then flip the `trackUserLocation` prop.

**Why:** MapLibre RN v11 rewrote the Camera component. The `followUserLocation` / `followZoomLevel` / `followPitch` prop set that existed in older MapLibre RN versions (and MapBox RN) was removed. TypeScript will error with "Property 'followUserLocation' does not exist on type CameraProps" at compile time.

**How to apply:** Any time you need GPS follow/tracking on the map camera in this app, use `trackUserLocation` with the values above. Always do a `flyTo` first to ensure the zoom level is correct before handing off to native tracking.
