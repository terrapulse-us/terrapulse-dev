---
name: flex:1 Text collapse in content-sized RN cards
description: Fixing Android text wrap with flex:1 can collapse cards in flex-start columns; pair with alignSelf stretch
---

Two halves of one rule for React Native rows containing wrapping Text:

1. A Text inside a `flexDirection:"row"` without `flex:1` is measured at intrinsic single-line width on Android — it wraps visually but siblings below are positioned using the stale one-line height, causing overlapping/clipped content. Fix: `flex:1` (+ explicit `lineHeight`, `alignItems:"flex-start"` on the row).

2. BUT if that row lives in a content-sized container (e.g. a chat card in a column with `alignItems:"flex-start"`), adding `flex:1` removes the text's intrinsic width contribution and the whole card collapses to icon-width (one character per line). Fix: give the card a definite width — `alignSelf:"stretch"` (capped by any `maxWidth:%`).

**Why:** shipped the flex:1 fix alone via OTA and the assistant chat cards collapsed to ~80px; both halves must ship together.

**How to apply:** whenever adding `flex:1` to Texts, check every ancestor up to a definite-width container; any `alignItems:"flex-start"`/content-sized ancestor needs `alignSelf:"stretch"` or explicit width. Also: `maxWidth` in an earlier style-array entry is dead if a later entry (e.g. shared bubble style) sets its own. For long ALL-CAPS button labels in flex:1 buttons use `numberOfLines={1} adjustsFontSizeToFit minimumFontScale` (Android ignores letterSpacing when fitting — drop letterSpacing if it still clips).
