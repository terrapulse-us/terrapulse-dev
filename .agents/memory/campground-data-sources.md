---
name: Campground data source quirks
description: Non-obvious API behaviors of RIDB, USFS EDW, and OSM Overpass when fetching campground data
---

# Campground data source quirks

- **RIDB `/facilities` ignores the `facilitytype` query param** (verified live): a `facilitytype=Campground` request still returns permit offices, visitor centers, venues, generic "Facility" records. Must filter client-side on `FacilityTypeDescription === "Campground"`.
  - **Why:** without the filter, permit offices render as campground markers and get baked into 24h caches.
  - **How to apply:** any new consumer of `fetchRidbCampsNear` (or raw RIDB facilities) must apply this filter; if a poisoned cache shipped, bump the cache key.
- **USFS EDW returns the literal string `"none"` / `"N/A"` for empty attribute fields** (openstatus, season dates) rather than null — normalize to null before display. Also: `f=json` responses use LOWERCASE attribute keys even though `outFields` is uppercase.
- **RIDB and USFS EDW share upstream data** — cross-source duplicates are near-total with identical names. Dedupe radius of ~1 km is needed (0.5 km misses real dupes; RIDB coordinates are often imprecise). Prefer the RIDB record as canonical (carries the recreation.gov reservation link), enrich with USFS season/status/fee.
- **Overpass campsite queries:** reuse the existing 5-endpoint `Promise.any` race helper in the OSM lib (single-endpoint fetches regress reliability; AbortController is unreliable on Android New Arch). `out center tags N;` gives way centers + node lat/lon in one query.
