---
name: PMTiles offline spike
description: Status and gotchas for the Phase 4 PMTiles single-file offline maps spike (Labs toggle in map layer sheet)
---

# PMTiles offline spike (Labs)

Status: code shipped, **awaiting user device field test**. Region download pipeline must NOT be built until the spike passes on device.

- Spike: `artifacts/mobile/lib/pmtiles-spike.ts` + LABS section in map.tsx MAP LAYERS sheet. Downloads the Protomaps Florence sample (`https://pmtiles.io/protomaps(vector)ODbL_firenze.pmtiles`, ~6.6 MB, verified live with "PMTiles" magic bytes) and renders it via `VectorSource url="pmtiles://<abs-path>"`.
- URL-form uncertainty (device-only): local archives use `pmtiles://` + absolute path (file:// scheme stripped). If the spike fails on device, first OTA iteration is the alternate form `pmtiles://file:///...`.
- maplibre-react-native v11 `Layer` style-spec props: `"source-layer"` is wired through to the native `sourceLayer` prop, and `VectorSource` clones children with its own source id — idiomatic usage confirmed against library source.
- Field-test gotcha: the airplane-mode confirmation must be done while already on the Topo layer (ideally near a saved trail pack); on other layers the offline layer-force remounts the map and the base style may never finish loading, so spike layers can't mount — a false FAIL.

**Why:** single-file PMTiles archives would replace thousands of individually cached tiles for whole-region offline downloads.
**How to apply:** if the user reports the Florence test passed, build the region pipeline on this foundation; if it failed, iterate the URL form via OTA before concluding the native handler is absent.
