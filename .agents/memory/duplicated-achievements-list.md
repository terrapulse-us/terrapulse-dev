---
name: Duplicated ALL_ACHIEVEMENTS list across profile screens
description: TerraPulse mobile defines the achievement/badge catalog independently in two files; adding a badge in one does not propagate to the other.
---

`artifacts/mobile/app/(tabs)/profile.tsx` (own profile) and `artifacts/mobile/app/user/[uid].tsx` (viewing another user's profile) each hardcode their own `ALL_ACHIEVEMENTS` array with the same badge ids/titles/descriptions/icons. They are not shared from a common module.

**Why:** `beta_explorer` was added to `profile.tsx`'s list (and to the actual grant logic) but never added to `[uid].tsx`'s list, so the badge was correctly stored in Firestore but silently invisible whenever anyone viewed another user's profile — with no error, since the achievement id just wasn't recognized for display.

**How to apply:** Whenever adding, renaming, or removing an achievement/badge, update both `ALL_ACHIEVEMENTS` arrays (grep the codebase for the achievement id and for `ALL_ACHIEVEMENTS` to catch both). Ideally extract a shared `achievements` constant/module used by both screens to prevent future drift — flag this as a worthwhile refactor if touching this area again.
