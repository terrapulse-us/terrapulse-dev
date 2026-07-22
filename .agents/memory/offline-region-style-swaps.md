---
name: Offline region style swaps
description: Rules for MapView key-remount style swaps driven by connectivity (offline regions feature)
---

Rule 1: Any map style swap driven by the connectivity probe must debounce the offline→online transition (~30s, longer than the probe interval) before dropping the offline style. Going offline can apply immediately.
**Why:** The JS connectivity hook probes every ~25s; a single successful blip at a region edge would otherwise remount the MapView back and forth, teleporting the camera each time.
**How to apply:** Derive a debounced `regionOnline` from `useOnline()` and key the deactivation decision on it, not on the raw value.

Rule 2: A camera target stored at style-activation time must SURVIVE deactivation — the remount back to the base map should start at the last known focus, never a hardcoded default center.
**Why:** MapView key changes destroy the camera; clearing the target on deactivate reset users to the California default from wherever they were (architect-flagged field defect).

Rule 3: Effects whose dependency arrays reference state declared later in the component throw a TDZ ReferenceError at render time (closures over later-declared setters are fine — they run post-render). Place such effects below the declarations they list as deps. map.tsx declares `userLocation`/`mapStyleLoaded` hundreds of lines into the component.

Rule 4: Client-side pruning of downloaded content against a server catalog must no-op when the catalog is empty — an empty result means "fetch failed / unknown", not "delete everything".
