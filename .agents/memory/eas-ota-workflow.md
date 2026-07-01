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

# 3. Run the update (use --branch, NOT --channel — --channel flag was removed in newer eas-cli)
cd artifacts/mobile
MAPTILER_API_KEY=<key> EXPO_TOKEN=$EXPO_TOKEN npx eas-cli update \
  --branch preview \
  --message "description" \
  --non-interactive

# 4. Check the log — should be empty on success, errors appear if transform failed
cat /tmp/hermesc-transform.log
```

**Why MAPTILER_API_KEY must be set explicitly:** `app.config.js` reads `process.env.MAPTILER_API_KEY` at bundle time. EAS env vars/secrets are only substituted during `eas build` (native builds), not during `eas update` (JS-only bundles). Without it set in the shell, `extra.maptilerApiKey` is empty in the OTA bundle.

**Why `--branch` not `--channel`:** The `--channel` flag was removed from `eas update` in newer eas-cli versions (confirmed broken in eas-cli ≥ 10.x). Always use `--branch <branchname>`. The branch must be linked to the channel (see below).

## Channel ↔ Branch linking (critical one-time setup)

EAS channels and branches are separate concepts. A channel (what the APK subscribes to) must be explicitly mapped to a branch (where OTAs are published). Without this link, `checkForUpdateAsync()` always returns `isAvailable: false` even when updates exist on the branch.

**Fix:** Run once per channel:
```bash
npx eas-cli channel:edit preview --branch preview
npx eas-cli channel:edit production --branch production
```

**Why this isn't automatic:** EAS creates the channel/branch pair when you first build, but the link can get broken or was never set for channels created before EAS CLI enforced it. Symptoms: badge shows `APK | enabled:true` indefinitely, no ERR in badge, `checkForUpdateAsync()` returns `isAvailable: false`.

## Hermesc wrapper — critical for Codespace OTA

Linux hermesc v0.12.0 rejects ALL `class` syntax (declarations, expressions, inside functions). The wrapper installs a shell shim + Babel transform that converts class syntax to ES5 before hermesc sees it.

**The wrapper is installed in `node_modules/.pnpm/` — NOT git-tracked.** After any `pnpm install` in the Codespace, re-run:
```bash
bash scripts/install-hermesc-wrapper.sh --force
```

If classes still fail, check `/tmp/hermesc-transform.log` for `[hermesc-wrapper] Missing required Babel deps` — this means `STORE_DIR` is wrong or Babel packages are missing.

## OTA update application (two-open rule)

With `checkAutomatically: "ON_LOAD"` and the explicit JS-side `checkForUpdateAsync()` in `_layout.tsx`:
1. First open after `eas update` publishes: app checks, downloads, and calls `reloadAsync()` automatically
2. App restarts with the new bundle — badge turns green immediately in one open cycle

If auto-reload doesn't fire (isUpdatePending never becomes true), the fallback is:
1. First open: OTA downloads in background
2. Kill app completely (swipe from app switcher)
3. Second open: new bundle is applied

## Badge visibility in _layout.tsx

The OTA badge (`_layout.tsx`) uses both passive (`useUpdates()` hook) and active (`checkForUpdateAsync()`) approaches:
- Gray `APK | en:true` = embedded build, enabled, no update available
- Gray `APK | en:false` = expo-updates disabled (check channel config + eas.json)
- Red `ERR: ...` = `checkForUpdateAsync()` threw — message tells you why
- Green `OTA-v2: xxxxxxxx` = running OTA bundle successfully

## Diagnosing "isAvailable always false"

1. Run `npx eas-cli channel:view preview` — confirm the channel is linked to the `preview` branch
2. If not linked: `npx eas-cli channel:edit preview --branch preview`
3. Confirm `eas.json` preview profile has `"channel": "preview"` explicitly
4. Confirm OTAs exist: `npx eas-cli update:list --branch preview --limit 3`

## Working APK vs new native builds

The working APK was an **old native build + OTA-applied JS**. New native APK builds triggered from GitHub Actions may crash if EAS secrets aren't properly set or if the native module combination differs. Prefer OTA updates for JS-only changes over new APK builds when the current APK is stable.
