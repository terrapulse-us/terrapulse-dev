---
name: hermesc wrapper private methods gap
description: Raw-text perl renaming of #identifier in the compiled bundle corrupts string literals (hex colors, hash routes) and can delete real code; must use the AST-based Babel transform instead.
---

## The rule
hermesc v0.12.0 rejects ALL `#identifier` syntax in the bundle — both private field declarations (`#field;`) and private method declarations (`#method() {}`), not just `this.#field` access.

**A previous fix used a blanket raw-text perl regex on the whole bundle:**
```perl
s/#([a-zA-Z_][a-zA-Z0-9_]*)/___$1/g
```
followed by a line-deletion pass for anything shaped like a renamed field declaration. **This is wrong and was the root cause of a production bug**: it doesn't distinguish real private-class syntax from `#` occurring anywhere else in the bundle's text — including inside STRING LITERALS. It corrupted hex color strings (`"#fff"` → `"___fff"`, causing washed-out/invalid map colors) and the line-deletion pass could strip real field initializers that coincidentally matched its shape (plausible cause of a `@tanstack/react-query` internal timer field going missing, producing "Cannot read property 'setTimeout' of undefined").

**Correct fix:** rely solely on the AST-based Babel transform (`transform-bundle-classes.cjs`, run by the hermesc wrapper as a single Node process over the fully-assembled bundle) using `@babel/plugin-transform-private-methods`, `@babel/plugin-transform-class-properties`, and `@babel/plugin-transform-private-property-in-object` (all `loose: true`). Babel operates on the parsed AST, so it only touches real private-field/method syntax nodes and never touches string/template literal content. Verified: running it on a synthetic bundle with private fields/methods AND hex-color strings correctly rewrites the former while leaving the latter byte-for-byte intact.

**Gotcha:** the wrapper install script only overwrites an already-installed wrapper when passed `--force`; a plain re-run (e.g. via `postinstall`) will silently keep a stale/buggy wrapper. `postinstall` should always pass `--force` so wrapper script fixes actually take effect on the next `pnpm install`.

## Main offender needing private-method support: @tanstack/react-query v5
@tanstack/react-query v5 (Oct 2023+) uses private class methods extensively in `QueryObserver`, `QueryCache`, `MutationCache`, `QueriesObserver`. Its CJS output ships with private methods intact. Because it's accessed via a workspace-level pnpm symlink (`node_modules/@tanstack/react-query`) whose path doesn't contain `.pnpm`, Metro's `transformIgnorePatterns` exception list can miss it — see `metro-transform-ignore-pnpm-symlinks.md`.
