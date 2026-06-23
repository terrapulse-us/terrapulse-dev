---
name: api.video Kotlin 2.x compatibility patch
description: @api.video/react-native-livestream@2.0.2 fails to compile with Kotlin 2.x; pnpm patch applied
---

## Problem
`@api.video/react-native-livestream@2.0.2` fails Android build when compiled with Kotlin 2.x (project uses 2.1.20).

5 event files declare `private val viewTag: Int` as a constructor parameter that hides the supertype `Event.viewTag` without `override`. Kotlin 1.x warned; Kotlin 2.x errors.

Error:
```
'viewTag' hides member of supertype 'Event' and needs an 'override' modifier.
```

Files affected:
- `android/.../events/OnConnectionFailedEvent.kt`
- `android/.../events/OnConnectionSuccessEvent.kt`
- `android/.../events/OnDisconnectEvent.kt`
- `android/.../events/OnPermissionsDeniedEvent.kt`
- `android/.../events/OnStartStreamingEvent.kt`

## Fix
`pnpm patch` applied; patch at `patches/@api.video__react-native-livestream@2.0.2.patch`.
Change: `private val viewTag` → `override val viewTag` in all 5 files.
`pnpm-workspace.yaml` `patchedDependencies` entry auto-applies patch on install.

**Why:** Library was written for Kotlin 1.9.x; project uses Kotlin 2.1.20 (required by Expo SDK 54 + RN 0.81). Library has not released a Kotlin 2.x compatible version as of June 2026.

**How to apply:** Already applied. If upgrading the library, recheck if the new version fixes this natively; if so, remove the patch entry from pnpm-workspace.yaml.
