# TerraPulse

Nationwide off-road and hiking trail finder mobile app (all 50 states, 538 trails: 462 OHV + 76 hiking): interactive map with turn-by-turn navigation, GPS telemetry, offline maps, community features (keypoints, Community Notes hazard reports, crew/friends, SOS beacons), and a Claude-powered AI Trip Assistant (trail briefings + weather, campgrounds, vehicle-fit checks, web search, cell-coverage warnings, itineraries).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run region:build <key>` — rebuild/upload an offline region (bump `version` in `scripts/src/regions/defs.ts` first)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9; Expo RN mobile app (MapLibre RN v11); Express 5 API; PostgreSQL + Drizzle; Zod (`zod/v4`); Orval codegen from OpenAPI; Firebase (auth + Firestore + storage) for user data.

## Where things live

- `artifacts/mobile/app/(tabs)/map.tsx` — main map screen: trails, navigation, keypoints, Community Notes (48h expiry, Firestore `trails/{trailId}/community_notes`), SOS beacons (`sos_beacons/{uid}` + chat/responders subcollections, unread badge, in-app directions), ride recording, map layers/filters/overlays, offline behavior.
- `artifacts/mobile/app/(tabs)/garage.tsx` — My Garage: My Rides (Firestore `users/{uid}/vehicles`), Offline Maps (regions + saved trail packs), My Crew (`users/{uid}/crew`), FIND MODS / FIND GEAR AI product search (`/api/mods/search`), Saved Campsites (camping mode, Firestore `users/{uid}/campsites` — saved from the map's campground detail sheet SAVE button; doc id = camp id with "/"→"_"; card tap deep-links to map via `focusLat`/`focusLng`/`focusCampsite=1`; saved sites always render as map markers even outside the 40-mi fetch radius or offline). Offline-region split (user-confirmed): map REGIONS toolbar list = discover/download; Garage shows downloaded regions only (manage/delete + empty state pointing to map).
- `artifacts/mobile/app/(tabs)/assistant.tsx` — AI Trip Assistant chat (SSE streaming); server side in `artifacts/api-server/src/routes/assistant.ts` with tools in `artifacts/api-server/src/lib/tools/`.
- `artifacts/mobile/app/adventure.tsx` — post-login start page: activity pills, AI prompt, animated time-of-day sky. Sets AsyncStorage `adventure.mode`/`adventure.remember`.
- `artifacts/mobile/context/ActivityModeContext.tsx` — global offroad/camping/hiking mode; drives tab titles/icons in BOTH `(tabs)/_layout.tsx` AND `_layout.ios.tsx` (keep in sync), garage sections, community copy, assistant mode, and per-mode map filters.
- `artifacts/mobile/lib/map-styles.ts` — single source of truth for MapTiler style URLs; 3D style builders + hillshade enhancement live in map.tsx.
- `artifacts/mobile/lib/offline-maps.ts` — per-trail offline packs (MapTiler topo-v2, `styleVersion: 2`) + vector overlay snapshots + offline 3D topo style persistence.
- `artifacts/mobile/lib/regions.ts` — offline regions (full offline basemap + terrain per region, PMTiles): catalog fetch, download/delete, `buildRegionStyle`. Server pipeline: `scripts/src/regions/` (defs + build-region), served from object storage via `artifacts/api-server/src/routes/storage.ts`. 4 regions live: moab, sedona, johnson-valley, rubicon (~75-130 MB each).
- `artifacts/mobile/lib/use-online.ts` — JS-only connectivity probe (no netinfo native module — OTA constraint).
- `artifacts/mobile/lib/offline-cache.ts` — AsyncStorage read-through cache seeding Firestore listeners for offline cold-start (Firebase JS SDK on RN has no Firestore disk persistence).
- `artifacts/mobile/lib/trail-routes.ts` — trail polylines: 8 hand-curated CA trails + auto-generated nationwide routes (below the `AUTO-GENERATED` marker; regenerate via `scripts/src/trail-pipeline/codegen-routes.ts`).
- `lib/trail-data/route-status.json` — per-trail route/area classification + status manifest; source of truth for the trail-line pipeline (`scripts/src/trail-pipeline/`).
- `artifacts/mobile/lib/usfs-api.ts` / `blm-api.ts` — live USFS EDW + BLM ArcGIS queries (trail networks, MVUM, OHV boundaries, land-ownership overlay).
- `artifacts/mobile/lib/campgrounds.ts` — merged campground layer (RIDB canonical > USFS EDW > BLM > OSM Overpass; dedupe ~1 km + normalized names, 24h cache `camps_merged_v2_*`). Map shows one CAMPGROUNDS toggle color-coded by kind (brown developed / green reservable / orange dispersed), auto-enabled once in camping mode; detail sheet has season/fees/amenity chips + RESERVE/WEBSITE links. RIDB `/facilities` ignores `facilitytype` — filtered client-side by `FacilityTypeDescription`.
- `artifacts/mobile/firestore.rules.txt` — source-of-truth Firestore security rules. **Not deployed automatically** — paste into Firebase Console (or `firebase deploy --only firestore:rules`) after every change.

## Policies & decisions

- **Trail-line policy (user-confirmed):** real route polylines only where public geometry exists (USFS EDW / OSM name-matched, or confirmed landmark waypoints); riding areas get a real BLM boundary polygon or just the point — **never a fabricated loop**. Auto-candidate routes need a manual visual spot-check before promotion to `verified`; sparse fragments can pass the geometric validator, so sanity-check point count/mileage against the known trail.
- **"Mark as Complete" gating:** route trails unlock by following the route; route-less area trails unlock when a recorded ride passes within 1.5 miles of the trail point.
- **Auth (Phase 1 tradeoff):** the API trusts the client-supplied `X-User-Id` header with no server-side token verification. The SSE assistant endpoint is effectively an unauthenticated Claude proxy. **Verifying the Firebase ID token server-side is the first Phase 2 item.**
- **Assistant reliability:** coverage warnings/itinerary cards are gated deterministically server-side, never inferred from model prose; `present_itinerary` input is zod-validated with errors fed back as `is_error` tool results.
- Community Notes store a client-side `createdAtFallback` alongside `serverTimestamp()` so the 48h-expiry filter works while the server timestamp resolves.
- Friend requests: `friendRequests/{id}` + recipient notification; accept writes mutual `users/{uid}/crew/{memberId}` docs.

## User preferences

- Do NOT automatically push to GitHub `main` after a task, and do NOT ask about it. The user handles all git pushes themselves. If the user wants an EAS build triggered, confirm first, then push.

## Deployment & builds

- **Production API:** `https://terrapulse-us.replit.app` — baked into OTA updates via the `app.config.js` `extra.apiServerUrl` fallback (Replit dev overrides it via `EXPO_PUBLIC_DOMAIN`). **API-server changes only reach phones after republishing the deployment** — restarting the dev workflow is not enough.
- **OTA updates:** run from the Codespace after `git pull` — `eas update --branch preview` (Android) AND `eas update --branch production` (iOS). Two app opens to apply.
- **EAS builds:** cannot run inside Replit (git sandbox) — trigger from GitHub Actions ("EAS Android APK Build" workflow) or expo.dev. `eas login` fails in Replit; use `EXPO_TOKEN`. Full steps: `artifacts/mobile/BUILDING.md`. EAS project: `5e42857a-9f58-4c15-8b0b-571dd97b3189` | owner: `mclaporteterrapulses-team`.

## Gotchas

- Rebuilding an offline region without bumping `version` in `scripts/src/regions/defs.ts` breaks byte-size checks against already-downloaded files — always bump.
- Retired ArcGIS services return HTTP 200 with an error JSON body — verify tile/query responses, not status codes.
- Keep `(tabs)/_layout.tsx` (Android) and `_layout.ios.tsx` in sync; Android layout is frozen against iOS-only changes (OTA crash history).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- Durable build/EAS/MapLibre lessons live in `.agents/memory/` (hermesc wrappers, MapLibre v11 quirks, offline map rules, etc.).
