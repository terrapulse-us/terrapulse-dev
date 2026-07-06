---
name: sourcing real trail line geometry vs landmark waypoints
description: how to get accurate trail polylines for a CA off-road app — USFS has real geometry, BLM/State Parks generally don't
---

For California off-road trail overlays, data availability splits sharply by land manager:

- **USFS (National Forest) trails**: the EDW ArcGIS services (`EDW_MVUM_02` for motorized roads/trails, `EDW_TrailNFSPublish_01` for the national trail system) expose real, surveyed centerline geometry via a public REST API, queryable by name or bbox with `outFields=*&f=geojson`. Multi-segment trails are split by `bmp`/`emp` (begin/end mile point) — sort by `bmp` and concatenate; adjacent segments' endpoint coordinates usually match exactly, confirming correct chaining. Simplify with Douglas-Peucker (epsilon ~0.0003–0.0006 in degrees) before storing, since raw pulls can be 1000+ points.
- **BLM riding areas / CA State Parks SVRAs / historic routes** (e.g. Johnson Valley, Ocotillo Wells, Hollister Hills): no public line-level GPX/API exists for named technical trails. `blm-api.ts`-style BLM sources only expose area boundary polygons, not trail centerlines. The best available real data is a handful of confirmed landmark/waypoint coordinates from web search (trailheads, named obstacles, ranger stations) — enough to correctly place and shape a route, but not a surveyed track. The Mojave Road is an exception: it's documented with a dense public waypoint table (~15-18 named landmarks) since it's a historic route with published guides.

**Why:** knowing this split up front avoids wasted effort trying to find an API for areas that don't have one, and sets the right expectation (real anchor points, honestly labeled as non-surveyed) instead of fabricating false precision.

**How to apply:** for any new CA trail needing real geometry, check land manager first. USFS → query EDW services directly. BLM/State Parks/historic route → web search for named landmark coordinates and build from those, documenting the provenance difference in code comments.
