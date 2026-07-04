---
name: Firestore nested arrays and large-array field placement
description: Firestore rejects arrays-of-arrays; large per-record arrays should live in a separate subcollection doc, not the list-queried parent doc.
---

Firestore write calls (`addDoc`/`setDoc`/`updateDoc`) throw "Nested arrays are not supported" if any field value is an array whose elements are themselves arrays (e.g. `number[][]` such as `[[lat,lon,alt,speed,ts], ...]`). Arrays of primitives or arrays of maps/objects are fine — only array-of-array is rejected.

**Why:** A ride-recording feature that stored GPS points as `EncodedPoint[]` (tuples) on the ride document passed typecheck and looked correct in code review, but every write would have thrown at runtime — caught only by an explicit architect review pass before shipping, not by tests or typecheck.

**How to apply:**
- If you need a compact array of tuples, flatten it into a single flat array with a fixed stride (e.g. `[lat,lon,alt,speed,ts, lat,lon,alt,speed,ts, ...]`) and encode/decode with stride math, or use an array of small objects instead.
- If a document is fetched as part of a list query (e.g. ride history with `limit(N)` + `onSnapshot`), don't put a large per-record array (GPS tracks, logs) directly on that doc — every list snapshot re-downloads it for every record. Put it in a subcollection doc (e.g. `rides/{id}/track/data`) fetched only by the detail screen, and remember to add matching Firestore security rules (`read`/`create`) for the new subcollection path.
- Also remember: Firestore security rules changes in this repo are not auto-deployed (see replit.md) — any new `update`/`delete`/subcollection rule must be manually pasted into the Firebase Console (or `firebase deploy --only firestore:rules`) before the corresponding client feature works, even after the OTA ships.
