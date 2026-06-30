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

# 1. Reinstall hermesc wrappers (must be done once per Codespace, or after pnpm install)
bash scripts/install-hermesc-wrapper.sh --force

# 2. Clear the transform log so you can check it after
> /tmp/hermesc-transform.log

# 3. Run the update
cd artifacts/mobile
MAPTILER_API_KEY=<key> EXPO_TOKEN=$EXPO_TOKEN npx eas-cli update \
  --branch preview \
  --message "description" \
  --non-interactive

# 4. Check the log — should be empty on success, errors appear if transform failed
cat /tmp/hermesc-transform.log
```

**Why MAPTILER_API_KEY must be set explicitly:** `app.config.js` reads `process.env.MAPTILER_API_KEY` at bundle time. EAS env vars/secrets are only substituted during `eas build` (native builds), not during `eas update` (JS-only bundles). Without it set in the shell, `extra.maptilerApiKey` is empty in the OTA bundle.

## Hermesc wrapper — critical for Codespace OTA

Linux hermesc v0.12.0 rejects ALL `class` syntax (declarations, expressions, inside functions). The wrapper installs a shell shim + Babel transform that converts class syntax to ES5 before hermesc sees it.

**The wrapper is installed in `node_modules/.pnpm/` — NOT git-tracked.** After any `pnpm install` in the Codespace, re-run:
```bash
bash scripts/install-hermesc-wrapper.sh --force
```

If classes still fail, check `/tmp/hermesc-transform.log` for `[hermesc-wrapper] Missing required Babel deps` — this means `STORE_DIR` is wrong or Babel packages are missing. The script uses `path.resolve(__dirname, '..', 'node_modules', '.pnpm')` which works in any environment.

## OTA update application (two-open rule)

1. First open after `eas update` publishes: app downloads the new bundle silently
2. Kill app completely (swipe from app switcher)
3. Second open: new bundle is applied

## Working APK vs new native builds

The working APK was an **old native build + OTA-applied JS**. New native APK builds triggered from GitHub Actions may crash if EAS secrets aren't properly set or if the native module combination differs. Prefer OTA updates for JS-only changes over new APK builds when the current APK is stable.
