---
name: EAS OTA update workflow
description: How to correctly publish OTA updates from the Codespace, and why Replit code changes don't reach GitHub builds.
---

## Replit ↔ GitHub git divergence

Replit checkpoint commits are pushed to Replit's own git remote. The Codespace tracks a **different** `origin/main` (GitHub). The two histories diverge silently — Replit commits never appear in the Codespace's `git log`, and vice versa.

**Why it matters:** `eas build` and `eas update` both run from the Codespace and bundle from the Codespace's local files. Code changes made only in Replit are invisible to EAS builds.

**Rule:** All code changes that must reach EAS (builds or OTA) must be committed and pushed from the Codespace, or manually applied there before running `eas update`.

## Correct `eas update` flow

```bash
cd /workspaces/terrapulse-dev
git pull origin main           # get latest code into Codespace
pnpm install                   # ensure Babel plugins are available locally
cd artifacts/mobile
MAPTILER_API_KEY=<key> EXPO_TOKEN=$EXPO_TOKEN npx eas-cli update \
  --branch preview \
  --message "description" \
  --non-interactive
```

**Why MAPTILER_API_KEY must be set explicitly:** `app.config.js` reads `process.env.MAPTILER_API_KEY` at bundle time. EAS env vars/secrets are only substituted during `eas build` (native builds), not during `eas update` (JS-only bundles). Without it set in the shell, `extra.maptilerApiKey` is empty in the OTA bundle.

## OTA update application (two-open rule)

1. First open after `eas update` publishes: app downloads the new bundle silently
2. Kill app completely (swipe from Android recents)
3. Second open: new bundle is applied

## Working APK vs new native builds

The working APK was an **old native build + OTA-applied JS**. New native APK builds triggered from GitHub Actions may crash if EAS secrets aren't properly set or if the native module combination differs. Prefer OTA updates for JS-only changes over new APK builds when the current APK is stable.
