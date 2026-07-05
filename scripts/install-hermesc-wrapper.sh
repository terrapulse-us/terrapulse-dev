#!/bin/bash
# Installs a hermesc wrapper in every patched react-native directory.
# hermesc v0.12.0 (bundled with RN 0.81) cannot compile:
#   - private class fields (#field)
#   - public class field declarations (field; / field = value;)
#   - class declarations / class expressions (class X {}, class X extends Y {})
#
# The wrapper converts ALL of the above to ES5-compatible syntax via a single
# Babel AST transform run on the fully-assembled Metro bundle (see
# transform-bundle-classes.cjs). This MUST be AST-based, not a raw text/regex
# pass: an earlier version used a blanket `perl -pe 's/#(\w+)/___$1/g'` which
# renamed every "#identifier" in the ENTIRE bundle text, including inside
# string literals — e.g. hex colors like "#fff" became "___fff" (MapLibre then
# rejected them as invalid colors), and a follow-up line-deletion pass could
# strip real field initializers that happened to match the same shape,
# leaving objects missing properties they need at runtime (e.g. a
# @tanstack/react-query internal timer field, causing "Cannot read property
# 'setTimeout' of undefined"). Babel operates on the parsed AST, so it only
# ever touches real private-field/method syntax nodes — never string content.
#
# Works on both Linux (linux64-bin) and macOS (osx-bin).
# Run automatically as part of `pnpm install` via the root postinstall script.
# Pass --force to reinstall even if already wrapped.

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRANSFORM_SCRIPT="$WORKSPACE_ROOT/scripts/transform-bundle-classes.cjs"

# Detect absolute path to node at install time so the wrapper works even when
# Gradle forks hermesc with a stripped PATH (no `node` in PATH on EAS servers).
NODE_BIN="$(command -v node 2>/dev/null || which node 2>/dev/null || echo 'node')"
echo "hermesc wrapper: using node at $NODE_BIN"

# Build wrapper template with resolved paths baked in.
# NODE_BIN_PLACEHOLDER and TRANSFORM_SCRIPT_PLACEHOLDER are substituted below.
HERMESC_WRAPPER='#!/bin/bash
# Wrapper for hermesc v0.12.0 (RN 0.81) — cross-platform (Linux + macOS)
# Converts private/public class field syntax and class declarations via a
# Babel AST transform (see transform-bundle-classes.cjs). Deliberately NOT a
# raw text/regex pass — a previous version used a blanket perl
# `s/#(\w+)/___$1/g` which also renamed "#" occurrences inside string
# literals (e.g. hex colors "#fff" -> "___fff") and could delete real code
# that coincidentally matched its "field declaration" line heuristic.
# node and transform script paths are baked in at install time (not from PATH).
REAL_HERMESC="$(dirname "$0")/hermesc.real"
NODE_BIN="NODE_BIN_PLACEHOLDER"
TRANSFORM_SCRIPT="TRANSFORM_SCRIPT_PLACEHOLDER"

INPUT_JS=""
for arg in "$@"; do case "$arg" in *.js|*.bundle) INPUT_JS="$arg" ;; esac; done

if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  # Convert class declarations, class fields (public/private), and private
  # methods to ES5-compatible syntax via Babel on the fully-assembled bundle.
  # (bundle output has no class properties — they were moved to ctors by Metro)
  if [ -f "$TRANSFORM_SCRIPT" ] && [ -f "$NODE_BIN" ]; then
    "$NODE_BIN" --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" 2>>/tmp/hermesc-transform.log || echo "[hermesc-wrapper] Node exit=$? file=$INPUT_JS" >>/tmp/hermesc-transform.log
  elif [ -f "$TRANSFORM_SCRIPT" ]; then
    # Fallback: try bare `node` in case the baked path is wrong
    node --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" 2>>/tmp/hermesc-transform.log || echo "[hermesc-wrapper] node-fallback exit=$? file=$INPUT_JS" >>/tmp/hermesc-transform.log
  fi
fi

exec "$REAL_HERMESC" "$@"'

PNPM_STORE="$WORKSPACE_ROOT/node_modules/.pnpm"
FORCE="${1:-}"
count=0

# Substitute both placeholders in one pass
make_wrapper() {
  local w="$HERMESC_WRAPPER"
  w="${w/NODE_BIN_PLACEHOLDER/$NODE_BIN}"
  w="${w/TRANSFORM_SCRIPT_PLACEHOLDER/$TRANSFORM_SCRIPT}"
  printf '%s\n' "$w"
}

# Wrap hermesc for all platforms present in the pnpm store.
# linux64-bin: Linux CI / dev / OTA builds
# osx-bin:     EAS iOS cloud builders (macOS)
for platform in linux64-bin osx-bin; do
  for hermesc_bin in "$PNPM_STORE"/react-native@0.81*/node_modules/react-native/sdks/hermesc/$platform/hermesc; do
    [ -f "$hermesc_bin" ] || continue

    if [ -f "${hermesc_bin}.real" ]; then
      if [ "$FORCE" = "--force" ]; then
        # Already wrapped — overwrite the wrapper script with updated content
        make_wrapper > "$hermesc_bin"
        chmod +x "$hermesc_bin"
        echo "hermesc wrapper updated: $hermesc_bin"
        count=$((count + 1))
      else
        echo "hermesc wrapper already installed: $hermesc_bin"
      fi
      continue
    fi

    # Fresh install: only wrap the real binary (>1MB)
    size=$(stat -c%s "$hermesc_bin" 2>/dev/null || stat -f%z "$hermesc_bin" 2>/dev/null)
    if [ "${size:-0}" -gt 1000000 ]; then
      cp "$hermesc_bin" "${hermesc_bin}.real"
      make_wrapper > "$hermesc_bin"
      chmod +x "$hermesc_bin"
      echo "hermesc wrapper installed: $hermesc_bin"
      count=$((count + 1))
    fi
  done
done

echo "Done. Installed $count hermesc wrapper(s)."
