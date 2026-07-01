---
name: EAS OTA update workflow
description: How to correctly publish OTA updates from the Codespace, and why Replit code changes don't reach GitHub builds.
---

## Replit ↔ GitHub git divergence

Replit checkpoint commits are pushed to Replit's own git remote. The Codespace tracks a **different** `origin/main` (GitHub). The two histories diverge silently — Replit commits never appear in the Codespace's `git log`, and vice versa.

**Why it matters:** `eas build` and `eas update` both run from the Codespace and bundle from the Codespace's local files. Code changes made only in Replit are invisible to EAS builds.

**Rule:** All code changes that must reach EAS (builds or OTA) must be committed and pushed from the Codespace, or manually applied there before running `eas update`.

## Correct OTA delivery flow — ALWAYS commit and push

**The only reliable way to publish OTA updates is: commit in Codespace → `git push origin main` → GitHub Actions delivers the OTA.**

Manual `eas update` from the Codespace working tree silently produces corrupted hermesc bundles. The OTA publishes successfully (visible in `update:list`) but crashes on-device and expo-updates rolls back to the embedded bundle with no visible error. The badge stays gray.

```bash
# In Codespace — make your changes, then:
cd /workspaces/terrapulse-dev
git add artifacts/mobile/app/whatever-you-changed.tsx
git commit -m "Your change description"
git push origin main
# GitHub Actions eas-ota-update.yml handles the rest (~2-3 min)
```

The GitHub Actions workflow (`eas-ota-update.yml`) installs the hermesc wrapper cleanly on a fresh checkout, sets `MAPTILER_API_KEY` from secrets, and runs `eas update --branch preview` reliably.

**Manual `eas update` is unreliable** — even with `install-hermesc-wrapper.sh --force` and `MAPTILER_API_KEY` set, the interactive Codespace shell doesn't reproduce the clean transform pipeline that Actions gets. Do not use it as the primary delivery mechanism.

**Why `--branch` not `--channel`:** The `--channel` flag was removed from `eas update` in newer eas-cli versions (confirmed broken in eas-cli ≥ 10.x). Always use `--branch <branchname>`. The branch must be linked to the channel (see Channel ↔ Branch linking section below).

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
