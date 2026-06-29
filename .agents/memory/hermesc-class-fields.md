---
name: hermesc v0.12.0 class field rejection
description: hermesc v0.12.0 rejects ALL class field syntax (private AND public); only Babel AST transform eliminates them reliably
---

## The rule

hermesc v0.12.0 (RN 0.81) rejects ALL class field declarations:
- Private: `#x;` / `#x = value;` → "private properties not supported"
- Public: `name;` / `x = 0;` → "invalid statement encountered" at the `class X {` line

**Why:** hermesc v0.12.0 predates the class fields proposal in the Hermes compile pipeline.
Any class field declaration (even public) inside a `__d(function(){...})` factory causes the
class declaration to be flagged as invalid.

**How to apply:** Use `scripts/transform-bundle.cjs` (via `scripts/hermesc-ios-wrapper.sh`)
to run `@babel/plugin-transform-class-properties` on the Metro bundle before hermesc sees it.
This moves all field declarations into the constructor as plain assignments. The class body
is left with only methods — which hermesc accepts.

Key details:
- Perl regex rename (#x → ___x) produces public fields that hermesc ALSO rejects. Don't use it.
- Babel transform only takes ~1-2 seconds on a typical Metro bundle.
- `scripts/` has `"type":"module"` so the script must be `.cjs` not `.js`.
- `@babel/*` packages are in `artifacts/mobile/node_modules/@babel/`, not workspace root.
- `loose: true` must be passed to all three plugins to avoid WeakMap usage (not needed here,
  but consistent with how react-native's babel preset configures them).
