---
name: ArcGIS raster overlay sourcing
description: Detecting retired ArcGIS services and rendering non-cached services as raster tiles via the export endpoint
---

# ArcGIS raster overlay sourcing

**Rule 1 — retired services fail silently.** Federal ArcGIS servers (BLM gis.blm.gov, USFS apps.fs.usda.gov) return HTTP 200 with an `{"error":{"code":404,"message":"Service not found"}}` JSON body when a service is retired. A raster overlay pointed at a dead tile URL renders nothing with no error — the map just looks like the overlay is off.

**Why:** Both the BLM SMA overlay and the USFS MVUM overlay silently broke this way (services retired upstream ~2026). Users saw a toggle that "did nothing".

**How to apply:** When verifying an ArcGIS service, never trust HTTP status alone — check the JSON body for an `error` key, or fetch an actual tile and confirm `content_type` is `image/png`. Periodically re-verify any hardcoded federal ArcGIS URL when an overlay "stops working".

**Rule 2 — non-cached services can still be raster tile sources.** If `MapServer?f=json` shows `singleFusedMapCache: false` / no `tileInfo`, the `/tile/{z}/{y}/{x}` endpoint won't exist. Use the export endpoint as a tile template instead — MapLibre (Native and GL JS) expands `{bbox-epsg-3857}`:

```
.../MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&transparent=true&format=png32&f=image
```

Set `tileSize={512}` to match `size=512,512`. Optional `&layers=show:ID,ID` filters sub-layers server-side (verified to genuinely change output — compare tile md5s). Slower than a fused cache (dynamic render per tile), so prefer a cached service when one exists and use export only for non-cached services or custom sub-layer subsets.

**Rule 3 — MapLibre RN won't refresh a changed `tiles` array on a same-id source.** Key AND id the `RasterSource` by a stable hash of the selection (sorted) to force a remount when the tile URL changes.
