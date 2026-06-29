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

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

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
