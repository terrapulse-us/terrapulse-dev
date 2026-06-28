#!/bin/bash
# Installs a hermesc wrapper in every patched react-native directory.
# hermesc linux64 v0.12.0 (bundled with RN 0.81) cannot compile private class
# fields (#field) or any class field declarations. This wrapper strips them via
# sed before invoking the real binary.
#
# Run automatically as part of `pnpm install` via the root postinstall script.

HERMESC_WRAPPER='#!/bin/bash
# Wrapper for hermesc linux64 v0.12.0 — strips private/public class field syntax.
REAL_HERMESC="$(dirname "$0")/hermesc.real"
INPUT_JS=""
for arg in "$@"; do case "$arg" in *.js) INPUT_JS="$arg" ;; esac; done
if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  sed -i \
    -e '"'"'s/this\.#\([a-zA-Z_][a-zA-Z0-9_]*\)/this.___\1/g'"'"' \
    "$INPUT_JS"
  sed -i \
    -e '"'"'/^[[:space:]]\{1,\}#[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*[;=]/d'"'"' \
    -e '"'"'/^[[:space:]]\{1,\}___[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*[;=]/d'"'"' \
    "$INPUT_JS"
fi
exec "$REAL_HERMESC" "$@"'

PNPM_STORE="$(pwd)/node_modules/.pnpm"
count=0

for hermesc_bin in "$PNPM_STORE"/react-native@0.81*/node_modules/react-native/sdks/hermesc/linux64-bin/hermesc; do
  [ -f "$hermesc_bin" ] || continue
  # Skip if already wrapped (real binary backup already exists)
  if [ -f "${hermesc_bin}.real" ]; then
    echo "hermesc wrapper already installed: $hermesc_bin"
    continue
  fi
  # Only wrap if this is the real binary (>1MB)
  size=$(stat -c%s "$hermesc_bin" 2>/dev/null || stat -f%z "$hermesc_bin" 2>/dev/null)
  if [ "${size:-0}" -gt 1000000 ]; then
    cp "$hermesc_bin" "${hermesc_bin}.real"
    printf '%s\n' "$HERMESC_WRAPPER" > "$hermesc_bin"
    chmod +x "$hermesc_bin"
    echo "hermesc wrapper installed: $hermesc_bin"
    count=$((count + 1))
  fi
done

echo "Done. Installed $count hermesc wrapper(s)."
