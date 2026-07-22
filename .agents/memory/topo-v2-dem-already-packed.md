---
name: topo-v2 offline packs already contain DEM
description: Why offline 3D topo needed no pack format change or styleVersion bump
---

# topo-v2 offline packs already contain DEM tiles

MapTiler's topo-v2 style declares a `terrain_rgb` source whose URL is the **same tileset** (`terrain-rgb-v2/tiles.json`) that `buildTerrain3dStyle` injects for 3D terrain. MapLibre offline packs download every source in the pinned style, so existing v2 packs already hold the DEM tiles needed for offline 3D topo.

**Why:** this means offline 3D required only persisting the built topo3d style JSON (document dir) and loading it when offline — no new pack content, no `styleVersion` bump, no re-download for users, fully OTA-safe.
**How to apply:** before adding sources to the offline pack style or bumping pack versions, diff the candidate source URLs against what topo-v2 already declares — the tileset may already be packed. Also note topo-v2 source max zooms: planet z15, contours/terrain_rgb z14 — pack maxZoom 16 over-covers all of them.
