---
name: PMTiles offline spike
description: Status and gotchas for the PMTiles single-file offline-region spikes (Labs toggle in map layer sheet) — Florence v1 PASSED, Moab full-region v2 awaiting field test
---

# PMTiles offline spike (Labs)

Spike v1 (Florence, 3 debug layers): **PASSED on device** (user field test, July 2026) with the primary URL form `pmtiles://<abs-path>` (file:// stripped) — local single-file PMTiles vector rendering is confirmed viable in the current binaries.

Spike v2 (Moab full region): built July 2026, **awaiting device field test**. `artifacts/mobile/lib/region-spike.ts` + LABS "MOAB REGION TEST" toggle in map.tsx. Downloads ~23 MB from the dev api-server (`/api/storage/public-objects/regions/...`): Protomaps vector extract (z0-15, ODbL), terrarium DEM archive (z0-12, public domain AWS elevation tiles), Noto glyphs, sprite v4 light. Builds the full ~70-layer `@protomaps/basemaps` light style client-side and REPLACES `mapStyle` entirely while active.

Remaining device unknowns v2 tests:
- raster-dem source over `pmtiles://` (terrarium, tileSize 256, maxzoom 12 — MapLibre overzooms z13+ cleanly)
- `file://` glyph + sprite URLs in a style JSON
- full-style render perf on-device

Key decisions / gotchas:
- **Font names sanitized to remove spaces** ("Noto Sans Regular" → "NotoSansRegular") in both the on-disk glyph dirs and every `text-font` reference (deep-walk — text-font can be a `case` expression, not just an array). This eliminates the file:// percent-encoding ambiguity entirely; never store glyph dirs with spaces.
- Any full mapStyle swap in map.tsx (either direction) must call `setMapStyleLoaded(false)` first — Android silently fails to register sources added before `onDidFinishLoadingStyle` (existing layer-picker pattern).
- Offline layer-force (offline → topo) is safe: the region style short-circuits the mapStyle useMemo before the switch.
- Field test requires the Replit workspace AWAKE (phone downloads from dev apiServerUrl); toggle-off deletes all files so each retest re-downloads.
- Region artifacts are regenerable: `scripts/src/region-spike/` (`region:terrain`, `region:upload`); pmtiles CLI from go-pmtiles releases; vector via `pmtiles extract https://build.protomaps.com/<date>.pmtiles --bbox=...`.

**Why:** single-file PMTiles archives replace thousands of individually cached tiles for whole-region offline downloads, with redistribution-safe licensing (ODbL Protomaps + public-domain terrain — MapTiler tiles must NOT be redistributed).
**How to apply:** if the user reports the Moab test passed, build the region pipeline (architect plan: Drizzle claim/heartbeat job for autoscale, bbox caps/quotas since X-User-Id is unverified) + real download UI. If it fails, isolate which unknown broke (hillshade missing → raster-dem/pmtiles; no labels/icons → file:// glyphs/sprites; blank map → style JSON) and iterate OTA.
