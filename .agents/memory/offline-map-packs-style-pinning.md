---
name: Offline map packs must pin the live map's style URL
description: MapLibre offline packs only serve tiles when the live map requests the exact same style resources; also pack-completion and partial-download gotchas.
---

**Rule:** An offline pack is keyed to the style URL it was created with. If the live map renders a different style (even a visually similar one from another provider), the pack's tiles are never used — saved maps silently do nothing offline.

**Why:** The app once created packs from openfreemap "liberty" while the live map rendered MapTiler styles; every saved map was dead weight. Fix required a shared style-constants module so pack creation and live rendering can't drift, plus a versioned-metadata migration sweep to delete the useless legacy packs.

**How to apply:**
- Keep the pack style URL and live map style URLs in one shared module; never hardcode a style in a download helper.
- Stamp packs with a `styleVersion` in metadata; bump it on any incompatible style change and sweep/re-prompt on launch.
- If the app has multiple map layers, force the packed layer while offline, or the user sees a blank grid.
- Pack existence ≠ pack usable: metadata exists from `createPack` onward, so check `pack.status()` (state "complete" / percentage 100) before reporting "saved", and `resume()` interrupted packs on launch — otherwise a killed download shows as saved forever with no retry path.
- HD/patched style JSON variants are fine only if they never rewrite tile/source URLs (tileSize-only patches keep pinned resources matching live requests).
