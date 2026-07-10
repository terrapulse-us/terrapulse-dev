# TerraPulse

Nationwide (all 50 states, 402 trails) off-road trail finder mobile app with live streaming, GPS telemetry, community features, and a leaderboard.

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

- `artifacts/mobile/app/(tabs)/map.tsx` — main map screen: trails, navigation, keypoints, and Community Notes (hazard/closed/flooded/washed-out/custom trail reports with 48h expiry + upvote confirmation), stored in Firestore at `trails/{trailId}/community_notes/{noteId}`.
- `artifacts/mobile/lib/firebase.ts` — Firebase app/auth/firestore/storage init.
- `artifacts/mobile/firestore.rules.txt` — full source-of-truth Firestore security rules (users, trails, photos, events, community_notes, live_streams); **not deployed automatically** — must be pasted into the live rules manually via Firebase Console (Build > Firestore Database > Rules) or the Firebase CLI.
- `artifacts/mobile/app/(tabs)/assistant.tsx` — AI Trip Assistant chat tab: streaming SSE chat UI, tool-in-progress indicators, safety disclaimer banner, per-user conversation persistence.
- `artifacts/api-server/src/routes/assistant.ts` — Claude tool-calling agent loop (conversations/messages CRUD + SSE message streaming, `temperature: 0`). Tools live in `artifacts/api-server/src/lib/tools/`: trail briefing + live weather, campground lookup (RIDB/Recreation.gov), deterministic vehicle-fit check, Tavily web search, cell-coverage estimate (`cell-coverage.ts`, OpenCellID tower density), itinerary builder (`itinerary.ts`, zod-validated structured output).
- `artifacts/mobile/lib/offline-maps.ts` — offline map download helper extracted from `map.tsx`'s existing flow; reused by the Assistant tab's coverage-warning banner.
- `artifacts/mobile/lib/trail-routes.ts` — polyline data for trails, keyed by trail id, `Record<string, RoutePoint[]>`. Hand-curated section: the original 8 CA trails (`ca-1`/`ca-4`/`ca-6`/`ca-17` real USFS centerlines; `ca-3`/`ca-5`/`ca-7`/`ca-20` confirmed landmark/waypoint routes — no public GPX exists for those BLM/State Parks areas). Below an `AUTO-GENERATED` marker: 21 nationwide routes produced by `scripts/src/trail-pipeline/codegen-routes.ts` from USFS/OSM name-matched hits — geometrically validated but **not yet manually spot-checked** (Phase 2 review pending); regenerate via that script after flipping a trail's status in the manifest below.
- `lib/trail-data/route-status.json` — per-trail manifest (`route`|`area` classification × status: `pending`/`auto-candidate`/`verified`/`landmark`/`area-boundary`/`not-found`/`no-data`) driving the nationwide trail-line pipeline; source of truth for what's been fetched, validated, and reviewed. See `scripts/src/trail-pipeline/` for the fetch/validate/codegen tooling (fetch-route.ts, fetch-area.ts, validate-route.ts, classify-trails.ts, codegen-routes.ts) and draft GeoJSON outputs in `scripts/data/routes/` and `scripts/data/areas/` (gitignored/untracked, regenerable).
- `artifacts/mobile/lib/usfs-api.ts` — queries live USFS EDW `EDW_MVUM_02` (roads/trails) and `EDW_TrailNFSPublish_01` ArcGIS services; the old `EDW_MotorVehicleUse_01`/`EDW_TrailNFS_01` endpoints this previously used are retired (404). Field-schema translation layer preserves legacy UPPER_CASE property names for `trail-guide.ts` compatibility.
- `artifacts/mobile/lib/blm-api.ts` — BLM OHV designated-area boundary polygons, queried live around the map's current focus (selected trail, else GPS, else a CA-center fallback) whenever the user toggles the BLM overlay in `map.tsx`. Uses `recreation/BLM_Natl_Recs_poly` layer 0 filtered to `FET_SUBTYPE = 'OHV Designated Area'` — the old `BLM_Natl_OHV_Areas` service is fully retired (404).

## Architecture decisions

- Community Notes use a client-side `createdAtFallback: Date.now()` field alongside Firestore's `serverTimestamp()` so the 48h-expiry filter doesn't misfire while the server timestamp is still resolving.
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

- Do NOT automatically push to GitHub `main` after a task. Ask for explicit confirmation before running `git push origin main` — a past auto-push caused confusion (2026-07-05). If the user wants an EAS build triggered, confirm first, then push.

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
