---
name: MapLibre RN v11 Camera defaultSettings vs controlled props
description: Using center/zoom as controlled props on Camera causes re-render conflicts; use defaultSettings for initial position.
---

## Rule

Never set `center` and `zoom` as direct props on `<Camera>` for the initial/default map position. Use `defaultSettings` instead.

```tsx
// WRONG — fights flyTo and trackUserLocation on every re-render
<Camera ref={cameraRef} center={[-119.4, 36.7]} zoom={7} />

// CORRECT — only used on first render, never conflicts
<Camera ref={cameraRef} defaultSettings={{ center: [-119.4, 36.7], zoom: 7 }} />
```

**Why:** In MapLibre RN v11, `center` and `zoom` are animated/controlled props. Every React re-render (triggered by any state change — setUserLocation, setFollowUser, etc.) causes the Camera to re-animate back to those static values. This overrides `flyTo()` calls and fights `trackUserLocation`, making it appear that: (1) the user location dot is missing (camera snaps away from it), (2) auto-fly on sign-in doesn't work, and (3) follow mode doesn't hold.

**How to apply:** Use `defaultSettings` for the initial map view. Use `cameraRef.current?.flyTo(...)` for all programmatic camera moves. Use `trackUserLocation` for GPS follow mode. The `pitch` prop is safe as a controlled prop since it's only changed intentionally by the user (layer switch).
