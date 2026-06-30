---
name: hermesc wrapper private methods gap
description: Old perl step missed private METHOD declarations; blanket #identifier rename is the correct fix; @tanstack/react-query v5 is the main source.
---

## The rule
The hermesc wrapper perl step `s/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/this.___$1/g` only handles ACCESS patterns (`this.#field`). It does NOT handle private METHOD DECLARATIONS like:
```js
#executeFetch(fetchOptions) {
#notify() {
#dispatch(action) {
```
hermesc v0.12.0 rejects ALL `#identifier` syntax — both field declarations and method declarations.

**Fix:** Replace the targeted `this.#field` pattern with a blanket rename:
```perl
s/#([a-zA-Z_][a-zA-Z0-9_]*)/___$1/g
```
This converts EVERYTHING with a `#` prefix to `___` prefix: method declarations, field declarations, and access patterns all in one pass.

**Step 2** then removes renamed field declarations (not methods — methods have `(` not `;`/`=`):
```perl
print unless /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/
```

## Main offender: @tanstack/react-query v5
@tanstack/react-query v5 (released Oct 2023) uses private class methods extensively in `QueryObserver`, `QueryCache`, `MutationCache`, `QueriesObserver`. Its CJS output ships with private methods intact. Because it's accessed via a workspace-level pnpm symlink (`node_modules/@tanstack/react-query`) whose path doesn't contain `.pnpm`, metro's `transformIgnorePatterns` exception list missed it.

**Why:** The `transformIgnorePatterns` exception `(?!\.pnpm)` only matches real store paths. Top-level symlinks look like `workspaceRoot/node_modules/@tanstack/...` — no `.pnpm` in the path — so they were silently excluded from Babel transformation.

**Fix:** Remove the catch-all ignore pattern; only exclude firebase (which breaks when Babel-transformed due to the NONE property issue).
