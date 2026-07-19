# TerraPulse

Nationwide (all 50 states, 538 trails: 462 OHV + 76 hiking) off-road and hiking trail finder mobile app with live streaming, GPS telemetry, community features, and a leaderboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mobile/app/(tabs)/map.tsx` — main map screen: trails, navigation, keypoints, and Community Notes (hazard/closed/flooded/washed-out/custom trail reports with 48h expiry + upvote confirmation), stored in Firestore at `trails/{trailId}/community_notes/{noteId}`. Also the SOS beacon system: `sos_beacons/{uid}` docs with live position sync, plus per-beacon chat (`sos_beacons/{uid}/messages`) and "Rescue is on the way" responders (`sos_beacons/{uid}/responders`) — both live-subscribed while the beacon detail sheet is open; the beacon OWNER additionally keeps both subscriptions alive whenever their own beacon is active, driving an unread badge on the SOS button (messages from others + responders, marked seen when own sheet opens) and a "Rescue Is On The Way!" alert on new responders (baseline-on-first-snapshot prevents spurious alerts; sosActive is memory-only so badge/alerts don't survive app restart). Tapping the active SOS button now opens the owner's own beacon sheet (deactivate lives inside). Owner best-effort deletes both subcollections on deactivate. GET DIRECTIONS offers an in-app straight-line guide (dashed line + HUD with live distance, target tracks beacon movement, auto-clears when beacon deactivates) or opening the platform maps app.
- `artifacts/mobile/app/(tabs)/garage.tsx` — My Garage tab (replaced Ranks/leaderboard): My Rides (vehicle fleet CRUD with star-to-favorite + vehicleSpecs mirror for AI assistant), Offline Maps (moved from Profile), My Crew (Wingman Mode + per-member live-location sharing), all backed by Firestore `users/{uid}/vehicles`, `users/{uid}/crew`.
- `artifacts/mobile/lib/firebase.ts` — Firebase app/auth/firestore/storage init.
- `artifacts/mobile/firestore.rules.txt` — full source-of-truth Firestore security rules (users, trails, photos, events, community_notes, live_streams); **not deployed automatically** — must be pasted into the live rules manually via Firebase Console (Build > Firestore Database > Rules) or the Firebase CLI.
- `artifacts/mobile/app/(tabs)/assistant.tsx` — AI Trip Assistant chat tab: streaming SSE chat UI, tool-in-progress indicators, safety disclaimer banner, per-user conversation persistence.
- `artifacts/api-server/src/routes/assistant.ts` — Claude tool-calling agent loop (conversations/messages CRUD + SSE message streaming, `temperature: 0`). Tools live in `artifacts/api-server/src/lib/tools/`: trail briefing + live weather, campground lookup (RIDB/Recreation.gov), deterministic vehicle-fit check, Tavily web search, cell-coverage estimate (`cell-coverage.ts`, OpenCellID tower density), itinerary builder (`itinerary.ts`, zod-validated structured output).
- `artifacts/mobile/lib/offline-maps.ts` — offline map download helper (used by map.tsx SAVE MAP, auto-download-on-navigate, and the Assistant tab's coverage-warning banner). Packs pin `OFFLINE_PACK_STYLE_URL` (MapTiler topo-v2 from `lib/map-styles.ts`) with `styleVersion: 2` metadata and route-aware bounds (route bbox +0.1° pad, else point ±0.2°); `migrateLegacyOfflinePacks()` deletes pre-fix packs (they downloaded openfreemap liberty, which the live map never renders — saved maps never worked offline); `resumeIncompleteOfflinePacks()` + status-checked `isTrailAreaDownloaded()` handle interrupted downloads; `saveTrailSnapshot()`/`loadTrailSnapshot()` persist per-trail overlay snapshots (BLM OHV GeoJSON + SMA/MVUM ArcGIS export PNGs in EPSG:3857 + meta.json bounds) to `Paths.document/offline/{trailId}/`, rendered offline via MapLibre `ImageSource`.
- `artifacts/mobile/lib/map-styles.ts` — single source of truth for MapTiler style URLs (standard/satellite/topo/terrain3d + offline pack style), shared by map.tsx and offline-maps.ts.
- `artifacts/mobile/lib/use-online.ts` — JS-only connectivity hook (gstatic generate_204 probe, 25s interval + AppState resume; defaults online). No netinfo native module — OTA constraint.
- `artifacts/mobile/lib/offline-cache.ts` — AsyncStorage read-through cache (`cacheGet`/`cacheSet`, 400KB per-entry guard). Seeds Firestore listeners for offline cold-start: user trails + community notes (map.tsx), vehicles + crew (garage.tsx) — the "live" flag pattern prevents a late cache read from clobbering fresher snapshot data.
- `artifacts/mobile/lib/trail-routes.ts` — polyline data for trails, keyed by trail id, `Record<string, RoutePoint[]>`. Hand-curated section: the original 8 CA trails (`ca-1`/`ca-4`/`ca-6`/`ca-17` real USFS centerlines; `ca-3`/`ca-5`/`ca-7`/`ca-20` confirmed landmark/waypoint routes — no public GPX exists for those BLM/State Parks areas). Below an `AUTO-GENERATED` marker: 21 nationwide routes produced by `scripts/src/trail-pipeline/codegen-routes.ts` from USFS/OSM name-matched hits — geometrically validated but **not yet manually spot-checked** (Phase 2 review pending); regenerate via that script after flipping a trail's status in the manifest below.
- `lib/trail-data/route-status.json` — per-trail manifest (`route`|`area` classification × status: `pending`/`auto-candidate`/`verified`/`landmark`/`area-boundary`/`not-found`/`no-data`) driving the nationwide trail-line pipeline; source of truth for what's been fetched, validated, and reviewed. See `scripts/src/trail-pipeline/` for the fetch/validate/codegen tooling (fetch-route.ts, fetch-area.ts, validate-route.ts, classify-trails.ts, codegen-routes.ts) and draft GeoJSON outputs in `scripts/data/routes/` and `scripts/data/areas/` (gitignored/untracked, regenerable).
- `artifacts/mobile/lib/usfs-api.ts` — queries live USFS EDW `EDW_MVUM_02` (roads/trails) and `EDW_TrailNFSPublish_01` ArcGIS services; the old `EDW_MotorVehicleUse_01`/`EDW_TrailNFS_01` endpoints this previously used are retired (404). Field-schema translation layer preserves legacy UPPER_CASE property names for `trail-guide.ts` compatibility.
- `artifacts/mobile/lib/blm-api.ts` — BLM OHV designated-area boundary polygons, queried live around the map's current focus (selected trail, else GPS, else a CA-center fallback) whenever the user toggles the BLM overlay in `map.tsx`. Uses `recreation/BLM_Natl_Recs_poly` layer 0 filtered to `FET_SUBTYPE = 'OHV Designated Area'` — the old `BLM_Natl_OHV_Areas` service is fully retired (404). Also hosts the land-ownership (SMA) raster overlay config: `BLM_Natl_SMA_Cached_with_PriUnk` (all categories), `BLM_Natl_SMA_Cached_BLM_Only` (BLM-only), and `smaExportTiles()` dynamic export tiles for custom category subsets (`SMA_CATEGORIES` carries real renderer colors + sub-layer ids); the old `BLM_Natl_SMA_Limited_Areas` service is retired (404). `map.tsx` renders an interactive land-ownership legend popout (first child of bottomStack, so it can't overlap RECORD) with per-category checkboxes + ALL / BLM ONLY quick buttons. USFS MVUM overlay in `map.tsx` likewise uses `EDW_MVUM_02` export tiles (old cached `EDW_MotorVehicleUse_01` tile service retired). ArcGIS gotcha: retired services return HTTP 200 with an error JSON body — verify tile fetches, not status codes.

## Architecture decisions

- Offline experience: firebase JS SDK on RN has no Firestore disk persistence, so offline cold-start data comes from the AsyncStorage read-through cache in `lib/offline-cache.ts`. While offline, map.tsx forces the topo layer (only style packed offline), swaps live ArcGIS raster overlays for saved snapshot PNGs, serves cached OHV boundaries, and shows an OFFLINE banner. Navigating a trail auto-downloads its pack + overlay snapshot (fire-and-forget, no-op when already saved). The trail detail SAVE MAP button shows a green OFFLINE READY state when a completed current-format pack exists.

- Community Notes use a client-side `createdAtFallback: Date.now()` field alongside Firestore's `serverTimestamp()` so the 48h-expiry filter doesn't misfire while the server timestamp is still resolving.
- Crew / friend request flow: sender writes `friendRequests/{id}` (top-level) + `users/{toUid}/notifications/{id}`; recipient accepts/declines in Profile → Alerts tab, which writes mutual `users/{uid}/crew/{memberId}` docs + a `friend_accepted` notification back to sender. All three collections covered in `firestore.rules.txt`.
- Profile tab sections: gallery / specs / achievements / rides / settings / notifications. "Search Trails" row and the old "maps" section removed. Settings tab has deactivate (sets `deactivated:true, isPublic:false` + logs out) and delete-account (opens mailto to mclaporte@terrapulse.fun). Alerts tab shows friend requests with Accept/Decline actions.
- Firestore security rules are not managed in this repo's deploy flow — they must be applied manually (Console or `firebase deploy --only firestore:rules`) whenever `firestore.rules.community_notes.txt` changes.
- AI Assistant (Phase 1) trusts the client-supplied `X-User-Id` header (Firebase UID) at face value with no server-side token verification — documented as an explicit Phase 1 tradeoff in the OpenAPI spec. Real exposure: the SSE endpoint is an unauthenticated Claude proxy (token-cost abuse risk), and since Firebase UIDs are visible to other users via Firestore community documents, cross-user conversation reads are practical, not just theoretical. **Verifying the Firebase ID token server-side should be the first item in Phase 2.**
- Express/Node always lowercases incoming header names, but Orval-generated Zod header schemas keep the OpenAPI spec's original casing (e.g. `"X-User-Id"`). Route handlers must normalize (`req.headers["x-user-id"]`) into the schema's expected key before calling `.safeParse()`, or validation always fails silently as a 400.
- AI Assistant (Phase 2): cell-coverage warnings and itinerary cards are gated deterministically server-side (e.g. the download-offline-map offer only fires when the computed coverage level is patchy/poor — never inferred from model prose), and `present_itinerary` tool input is zod-validated with schema errors fed back to Claude as `is_error` tool results. Reliability for getting Claude to actually call `check_cell_coverage`/`present_itinerary` (instead of `web_search` or plain prose) required both `temperature: 0` and explicit "REQUIRED" imperative language in the system prompt — see memory for the general lesson.
- Nationwide trail-line policy (user-confirmed): real route polylines only where public geometry exists (USFS EDW / OSM name-matched, or confirmed landmark waypoints); open riding areas (SVRAs/OHV parks/dunes) get a real BLM boundary polygon where BLM data covers that land, otherwise just the point — **never a fabricated loop**. Of 402 trails: 76 are "route"-classified (linear trails) and 326 "area"-classified (riding areas), tracked per-trail in `lib/trail-data/route-status.json`. Auto-candidate routes require a Phase 2 manual visual spot-check before being considered `verified`; a `validate-route.ts` geometric check (min 3 pts, gap/length plausibility) already rejects the worst false positives, but sparse 3-4 point fragments (e.g. a 0.5mi fragment of a much longer named trail system) can still pass that check and slip through — always sanity-check point count/mileage against what the trail is actually known to be before promoting or merging.
- "Mark as Complete" gating applies to **all** trails, not just ones with a mapped route: route trails unlock via following the route on the map (`navigateTrail`); route-less "area" trails (no "Follow this trail") unlock instead when a recorded ride (`map.tsx`'s general RECORD/STOP ride tracker) passes within 1.5 miles of the trail's point — proximity is the substitute proof-of-visit when there's no path to follow.

## Product

- Nationwide off-road trail discovery (all 50 states, 402 trails) with an interactive map (MapLibre), turn-by-turn navigation, GPS telemetry, and live streaming.
- Community features: keypoints, and Community Notes — riders report trail hazards/closures in real time while navigating, visible to others on the same trail, with 48h auto-expiry, author-only delete, and an upvote-style "still accurate" confirmation.
- Leaderboard for community engagement.
- AI Trip Assistant — chat with a Claude-powered agent for trail briefings + live weather, campground lookups, a deterministic vehicle-fit check against the user's saved rig specs, general web search (with cited sources), cell-coverage warnings (with an offer to download the offline map for that trail), and multi-day itinerary cards. Replaces the removed Live Stream tab.

## User preferences

- Do NOT automatically push to GitHub `main` after a task, and do NOT ask about it. The user handles all git pushes themselves. If the user wants an EAS build triggered, confirm first, then push.

## Building Android APKs

[![EAS Android APK Build](https://github.com/<your-username>/<your-repo>/actions/workflows/eas-build-android.yml/badge.svg)](https://github.com/<your-username>/<your-repo>/actions/workflows/eas-build-android.yml)

EAS builds cannot run inside Replit (git sandbox). To build APKs:
1. Export this repo to GitHub via the Replit Git panel ("Push to GitHub")
2. Add `EXPO_TOKEN` secret to the GitHub repo (from expo.dev → Account Settings → Access Tokens)
3. **Automatic:** Every push to `main` (or `release/**`) triggers a `preview` APK build automatically
4. **Manual trigger:** Go to GitHub repo → Actions → "EAS Android APK Build" → Run workflow (choose profile)
5. **expo.dev dashboard:** Link GitHub repo at expo.dev → project → GitHub tab, then trigger a build

See `artifacts/mobile/BUILDING.md` for full step-by-step instructions.

EAS project: `5e42857a-9f58-4c15-8b0b-571dd97b3189` | owner: `mclaporteterrapulses-team`

## Gotchas

- EAS builds must be triggered from GitHub or expo.dev — `eas build` cannot run inside Replit due to git sandbox restrictions. See `artifacts/mobile/BUILDING.md`.
- EAS CLI login (`eas login`) fails in Replit shell; use `EXPO_TOKEN` env var instead.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
