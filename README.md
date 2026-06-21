# TerraPulse

California off-road trail finder mobile app with live streaming, GPS telemetry, community features, and a leaderboard.

[![EAS Android APK Build](https://github.com/mclaporteterrapulses-team/terrapulse/actions/workflows/eas-build-android.yml/badge.svg)](https://github.com/mclaporteterrapulses-team/terrapulse/actions/workflows/eas-build-android.yml)

> **Note:** Replace `mclaporteterrapulses-team/terrapulse` in the badge URL above with your actual GitHub username and repository name after pushing to GitHub.

## Stack

- React Native (Expo SDK 54)
- Express 5 API server
- PostgreSQL + Drizzle ORM
- pnpm workspaces, Node.js 24, TypeScript 5.9

## Building Android APKs

EAS builds run in the cloud via GitHub Actions — they cannot run inside Replit.

**Automatic builds:** Every push to `main` or a `release/**` branch triggers a `preview` APK build automatically via GitHub Actions.

**Manual builds:** Go to GitHub repo → Actions → "EAS Android APK Build" → Run workflow.

See [`artifacts/mobile/BUILDING.md`](artifacts/mobile/BUILDING.md) for full setup instructions including how to add the required `EXPO_TOKEN` secret.

EAS project: `5e42857a-9f58-4c15-8b0b-571dd97b3189` | owner: `mclaporteterrapulses-team`
