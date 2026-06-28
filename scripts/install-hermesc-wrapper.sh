#!/bin/bash
# Installs a hermesc wrapper in every patched react-native directory.
# hermesc linux64 v0.12.0 (bundled with RN 0.81) cannot compile:
#   - private class fields (#field)
#   - public class field declarations (field; / field = value;)
#   - class declarations / class expressions (class X {}, class X extends Y {})
#
# The wrapper:
#   1. Strips private class fields via sed (fast path)
#   2. Converts class declarations to ES5 functions via Babel on the bundle
#      (run AFTER Metro has fully bundled, so class-properties are already gone)
#
# Run automatically as part of `pnpm install` via the root postinstall script.
# Pass --force to reinstall even if already wrapped.

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRANSFORM_SCRIPT="$WORKSPACE_ROOT/scripts/transform-bundle-classes.cjs"

HERMESC_WRAPPER='#!/bin/bash
# Wrapper for hermesc linux64 v0.12.0
# Strips private/public class field syntax and converts class declarations.
REAL_HERMESC="$(dirname "$0")/hermesc.real"
TRANSFORM_SCRIPT="TRANSFORM_SCRIPT_PLACEHOLDER"

INPUT_JS=""
for arg in "$@"; do case "$arg" in *.js) INPUT_JS="$arg" ;; esac; done

if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  # Step 1: strip private class field ACCESS: this.#field → this.___field
  sed -i \
    -e '"'"'s/this\.#\([a-zA-Z_][a-zA-Z0-9_]*\)/this.___\1/g'"'"' \
    "$INPUT_JS"
  # Step 2: remove private field DECLARATIONS and their mangled counterparts
  sed -i \
    -e '"'"'/^[[:space:]]\{1,\}#[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*[;=]/d'"'"' \
    -e '"'"'/^[[:space:]]\{1,\}___[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*[;=]/d'"'"' \
    "$INPUT_JS"
  # Step 3: convert class declarations to ES5 functions via Babel
  # (bundle output has no class properties — they were moved to ctors by Metro)
  if [ -f "$TRANSFORM_SCRIPT" ]; then
    node --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" 2>>/tmp/hermesc-transform.log || echo "[hermesc-wrapper] Node exit=$? file=$INPUT_JS" >>/tmp/hermesc-transform.log
  fi
fi

exec "$REAL_HERMESC" "$@"'

PNPM_STORE="$(pwd)/node_modules/.pnpm"
FORCE="${1:-}"
count=0

for hermesc_bin in "$PNPM_STORE"/react-native@0.81*/node_modules/react-native/sdks/hermesc/linux64-bin/hermesc; do
  [ -f "$hermesc_bin" ] || continue

  if [ -f "${hermesc_bin}.real" ]; then
    if [ "$FORCE" = "--force" ]; then
      # Already wrapped — overwrite the wrapper script with updated content
      printf '%s\n' "${HERMESC_WRAPPER/TRANSFORM_SCRIPT_PLACEHOLDER/$TRANSFORM_SCRIPT}" > "$hermesc_bin"
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
    printf '%s\n' "${HERMESC_WRAPPER/TRANSFORM_SCRIPT_PLACEHOLDER/$TRANSFORM_SCRIPT}" > "$hermesc_bin"
    chmod +x "$hermesc_bin"
    echo "hermesc wrapper installed: $hermesc_bin"
    count=$((count + 1))
  fi
done

echo "Done. Installed $count hermesc wrapper(s)."
