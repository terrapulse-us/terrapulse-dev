---
name: api.video Kotlin 2.x compatibility patch
description: @api.video/react-native-livestream@2.0.2 fails Android build with Kotlin 2.x; correct pnpm patch applied
---

## Problem
`@api.video/react-native-livestream@2.0.2` fails Android build when compiled
with Kotlin 2.x (project uses 2.1.20, required by Expo SDK 54 + RN 0.81).

5 event files declare `private val viewTag: Int` as a constructor parameter.
This shadows `Event.viewTag` from the supertype.

Kotlin 2.x errors (two distinct errors, same root cause):
- "hides member of supertype and needs 'override' modifier" (if field is open)
- OR "is final and cannot be overridden" + "var cannot be overridden by val" (if field is final)

In RN 0.81, `Event.viewTag` is a non-open var, so the second pair of errors applies.

## Wrong fix (first attempt)
`override val viewTag: Int` — fails because Event.viewTag is `final var`:
you cannot override a final property, and val cannot override var.

## Correct fix
Rename the constructor parameter from `private val viewTag: Int` to plain
`tag: Int` (no `val` = no property creation, no shadowing at all).
Update the super-constructor call to `Event<...>(tag)`.
The `dispatch` body uses `viewTag` which now resolves to the supertype field.

Patch location: `patches/@api.video__react-native-livestream@2.0.2.patch`
pnpm-workspace.yaml `patchedDependencies` entry wires the patch automatically.

**Why:** Library written for Kotlin 1.9.x; no Kotlin 2.x compatible release as of June 2026.

**How to apply:** Already applied. If the library releases a fix, check if the
shadowing is gone natively; if so, remove the patchedDependencies entry.
