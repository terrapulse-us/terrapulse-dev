---
name: EAS branch and build workflow
description: How TerraPulse builds and OTA updates are delivered — branch mapping and Codespace workflow.
---

## Branch mapping

- **Android** → `preview` branch
- **iOS** → `production` branch

## Workflow

- **Replit** = code editing only. Never run EAS commands here.
- **Codespace** = all EAS commands (builds and OTA updates).
- User applies Replit changes in Codespace manually (sed or copy), then commits and pushes.

## OTA update commands (run from `artifacts/mobile` in Codespace)

JS-only changes can be pushed as OTA without a new build:

```bash
# Android only
eas update --branch preview --message "..."

# iOS only
eas update --branch production --message "..."

# Both platforms
eas update --branch preview --message "..." && eas update --branch production --message "..."
```

OTA requires two app opens to apply.

## New native build (when native code changes)

Push to GitHub from Codespace — the EAS GitHub Action triggers automatically on push to `main`.

**Why:** git histories diverged between Replit and Codespace (59↓128↑), so Replit Git panel cannot push directly. All git operations go through Codespace.
