# TerraPulse

California off-road trail finder mobile app with live streaming, GPS telemetry, community features, and a leaderboard.

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
- `artifacts/mobile/firestore.rules.community_notes.txt` — source-of-truth security rules for the `community_notes` subcollection; **not deployed automatically** — must be merged into the live rules manually via Firebase Console or CLI.

## Architecture decisions

- Community Notes use a client-side `createdAtFallback: Date.now()` field alongside Firestore's `serverTimestamp()` so the 48h-expiry filter doesn't misfire while the server timestamp is still resolving.
- Firestore security rules are not managed in this repo's deploy flow — they must be applied manually (Console or `firebase deploy --only firestore:rules`) whenever `firestore.rules.community_notes.txt` changes.

## Product

- California off-road trail discovery with an interactive map (MapLibre), turn-by-turn navigation, GPS telemetry, and live streaming.
- Community features: keypoints, and Community Notes — riders report trail hazards/closures in real time while navigating, visible to others on the same trail, with 48h auto-expiry, author-only delete, and an upvote-style "still accurate" confirmation.
- Leaderboard for community engagement.

## User preferences

- After every task, push to GitHub (`git push origin main`) to trigger a new EAS APK build for testing.

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
