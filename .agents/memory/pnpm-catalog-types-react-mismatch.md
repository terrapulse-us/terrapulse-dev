---
name: pnpm catalog @types/react must match the pinned react version
description: A pnpm-workspace.yaml catalog entry for @types/react that doesn't match the catalog's own react version causes duplicate @types/react installs and cross-package ref-type incompatibility errors in tsc.
---

In a pnpm workspace with a shared `catalog:` block, if `react`/`react-dom` are pinned to an exact version (e.g. `19.1.0`, required for Expo/React Native compatibility) but `@types/react`/`@types/react-dom` are left at a looser, newer range (e.g. `^19.2.0`), pnpm will resolve two different `@types/react` copies across the workspace. Packages whose transitive deps (e.g. Radix UI) pin against the older runtime end up structurally incompatible with packages typed against the newer one — surfacing as confusing `tsc` errors like mismatched ref/callback branded types (e.g. `VoidOrUndefinedOnly`) in unrelated component files (calendar/spinner-style components), not as an obvious "duplicate dependency" message.

**Why:** React's minor-version type declarations aren't always structurally identical (ref handling changed between 19.1 and 19.2), so TypeScript treats the two `@types/react` installations as nominally different even though both claim to be "React 19".

**How to apply:** When you see cross-package/component ref-type incompatibility errors in a pnpm workspace using a `catalog:`, first check `pnpm-workspace.yaml` for a version skew between `react`/`react-dom` and their `@types/*` counterparts. Align the `@types/*` catalog entries to the same version as the pinned runtime `react`/`react-dom` (not vice versa — the runtime pin is usually constrained by a specific consumer like Expo/RN), then `pnpm install` and re-run typecheck. Do not just add per-package overrides; fixing the catalog itself keeps all workspace packages honest about which React types actually match their runtime.
