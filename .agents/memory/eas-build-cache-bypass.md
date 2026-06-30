---
name: EAS build cache bypasses postinstall
description: EAS caches node_modules on pnpm-lock.yaml hash; postinstall skipped on cache hit; workaround and PNPM_STORE bug.
---

## The rule
Never rely on root `postinstall` in `package.json` to run hermesc wrapper updates on EAS builds. EAS caches the entire `node_modules` directory keyed on `pnpm-lock.yaml` content hash. When that hash hasn't changed, `pnpm install` is skipped entirely — and so is `postinstall`.

**Why:** EAS build cache is content-addressed on the lock file. If you change wrapper scripts but not dependencies, the cache key is unchanged and EAS serves stale node_modules including the old hermesc binary wrapper.

**How to apply:** Put any hermesc wrapper (re)installation in the `eas-build-post-install` script inside `artifacts/mobile/package.json`. EAS documentation states this hook runs unconditionally after the install phase, whether fresh or cached:
```json
"eas-build-post-install": "bash ../../scripts/install-hermesc-wrapper.sh --force"
```

## PNPM_STORE path bug
`install-hermesc-wrapper.sh` used `PNPM_STORE="$(pwd)/node_modules/.pnpm"`. When called from `artifacts/mobile/` (EAS post-install working dir), `$(pwd)` points to the mobile subdirectory, not the workspace root — hermesc is never found.

**Fix:** `PNPM_STORE="$WORKSPACE_ROOT/node_modules/.pnpm"` where `WORKSPACE_ROOT` is computed via `dirname "$0"/..` from the script's own location, which is always correct regardless of calling directory.

## Diagnostic signal
Identical hermesc error line numbers across multiple builds = EAS cache hit = wrapper not being updated.
