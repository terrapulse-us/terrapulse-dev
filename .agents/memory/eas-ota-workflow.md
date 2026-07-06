---
name: EAS OTA update workflow
description: How to correctly publish OTA updates, and why Replit code changes don't reach GitHub builds automatically.
---

## Replit ↔ GitHub git divergence

Replit checkpoint commits are pushed to Replit's own git remote. If a Codespace or other clone tracks a **different** `origin/main` (GitHub), the two histories can diverge silently. However, when Replit's `origin` remote is configured to point directly at the GitHub repo (check with `git remote -v`), pushing `git push origin main` from Replit itself DOES reach GitHub directly — verify with `git ls-remote origin main` rather than assuming a Codespace round-trip is required.

**Why it matters:** `eas build` and `eas update` both run from GitHub Actions and bundle from whatever is on `main` at trigger time. Code changes not yet pushed to GitHub `main` are invisible to them, regardless of which machine does the pushing.

## OTA update is NOT auto-triggered by push — workflow_dispatch only

The repo's OTA workflow (`.github/workflows/eas-update.yml`, named "EAS OTA Update") is defined with `on: workflow_dispatch` only — **pushing to `main` does not publish an OTA update.** Only the native APK/IPA build workflows (`eas-build-android.yml`, `eas-build-ios.yml`) auto-trigger on push to `main`/`release/**`.

**Why it matters:** it's easy to assume (as a past session did, incorrectly) that "push to main → GitHub Actions delivers the OTA" the same way it does for builds. It doesn't. After pushing a JS-only fix, you must separately trigger the OTA workflow:
- GitHub UI: repo → Actions → "EAS OTA Update" → Run workflow → choose `channel` (preview=Android, production=iOS) and `platform`.
- Or via GitHub API: `POST /repos/{owner}/{repo}/actions/workflows/eas-update.yml/dispatches` with `{"ref":"main","inputs":{"channel":"preview","platform":"android","message":"..."}}`, authenticated with a token that has `actions:write` (a token embedded in the repo's own `origin` remote URL, if present, already has this scope — extract it from `git remote -v` without printing it, don't hardcode/log the token value).

**How to apply:** whenever a JS/TS-only mobile fix needs to reach an already-installed EAS build, the flow is: (1) commit + push to GitHub main, (2) confirm with the user, then manually dispatch "EAS OTA Update" for the right channel/platform — do not tell the user "it will update automatically" after just a push.

## Channel vs branch flag — this repo's workflow uses `--channel`

An earlier version of this note claimed `--channel` was removed from `eas update` and `--branch` must always be used. That does not match the current `eas-update.yml`, which calls `eas update --channel <channel>` successfully (confirmed via multiple successful past Action runs). Don't assume the old `--branch`-only claim still holds — check the actual workflow YAML in `.github/workflows/eas-update.yml` for the current invocation before giving instructions, since this has changed at least once.

## Channel ↔ Branch linking (critical one-time setup, if using --branch)

EAS channels and branches are separate concepts. A channel (what the APK subscribes to) must be explicitly mapped to a branch. Without this link, `checkForUpdateAsync()` always returns `isAvailable: false` even when updates exist.

```bash
npx eas-cli channel:edit preview --branch preview
npx eas-cli channel:edit production --branch production
```

Symptoms of a broken link: OTA badge shows enabled indefinitely with no update ever detected.

## Hermesc wrapper — critical for CI/Codespace OTA builds

Linux hermesc v0.12.0 rejects ALL `class` syntax (declarations, expressions, inside functions). `eas-update.yml` runs `scripts/install-hermesc-wrapper.sh --force` as a step for this reason — if a custom workflow/build skips this, class syntax will crash on-device with no visible error (expo-updates silently rolls back to the embedded bundle).

## OTA update application (two-open rule)

With `checkAutomatically: "ON_LOAD"` and an explicit JS-side `checkForUpdateAsync()`:
1. First open after publish: app checks, downloads, and calls `reloadAsync()` automatically — usually applies in one open.
2. If auto-reload doesn't fire, fallback: first open downloads in background, fully kill the app (swipe from app switcher), second open applies the new bundle.

## Badge visibility in _layout.tsx

- Gray `APK | en:true` = embedded build, enabled, no update available (or the workflow was never dispatched)
- Gray `APK | en:false` = expo-updates disabled (check channel config + eas.json)
- Red `ERR: ...` = `checkForUpdateAsync()` threw — message tells you why
- Green `OTA-v2: xxxxxxxx` = running OTA bundle successfully

## Diagnosing "isAvailable always false"

1. Confirm the OTA workflow was actually dispatched for the right channel — check GitHub Actions run history for `eas-update.yml`, not just that `main` was pushed.
2. `npx eas-cli channel:view preview` — confirm the channel is linked to the right branch (if using branch-based publish).
3. Confirm `eas.json` preview profile has the matching `"channel"` value.
4. Confirm OTAs exist: `npx eas-cli update:list --branch preview --limit 3` (or check the Actions run logs directly).

## Working APK vs new native builds

A stable installed APK is often an **old native build + OTA-applied JS**. New native APK builds triggered from GitHub Actions may crash if EAS secrets aren't properly set or the native module combination differs. Prefer an OTA update for JS-only changes over a new APK build when the current APK is stable — but remember the OTA still needs its own manual dispatch.
