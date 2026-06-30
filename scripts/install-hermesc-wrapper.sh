#!/bin/bash
# Installs a hermesc wrapper in every patched react-native directory.
WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRANSFORM_SCRIPT="$WORKSPACE_ROOT/scripts/transform-bundle-classes.cjs"

# Detect absolute path to node at install time so the wrapper works even when
# Gradle forks hermesc with a stripped PATH (no `node` in PATH on EAS servers).
NODE_BIN="$(command -v node 2>/dev/null || which node 2>/dev/null || echo 'node')"
echo "hermesc wrapper: using node at $NODE_BIN"

HERMESC_WRAPPER='#!/bin/bash
REAL_HERMESC="$(dirname "$0")/hermesc.real"
NODE_BIN="NODE_BIN_PLACEHOLDER"
TRANSFORM_SCRIPT="TRANSFORM_SCRIPT_PLACEHOLDER"
INPUT_JS=""
for arg in "$@"; do case "$arg" in *.js|*.bundle) INPUT_JS="$arg" ;; esac; done
if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  perl -i -pe '"'"'s/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/this.___$1/g'"'"' "$INPUT_JS"
  perl -i -ne '"'"'print unless /^\s+#[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/ || /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/'"'"' "$INPUT_JS"
  if [ -f "$TRANSFORM_SCRIPT" ] && [ -f "$NODE_BIN" ]; then
    "$NODE_BIN" --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" 2>>/tmp/hermesc-transform.log || echo "[hermesc-wrapper] Node exit=$? file=$INPUT_JS" >>/tmp/hermesc-transform.log
  elif [ -f "$TRANSFORM_SCRIPT" ]; then
    node --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" 2>>/tmp/hermesc-transform.log || echo "[hermesc-wrapper] node-fallback exit=$? file=$INPUT_JS" >>/tmp/hermesc-transform.log
  fi
fi
exec "$REAL_HERMESC" "$@"'

PNPM_STORE="$(pwd)/node_modules/.pnpm"
FORCE="${1:-}"
count=0

make_wrapper() {
  local w="$HERMESC_WRAPPER"
  w="${w/NODE_BIN_PLACEHOLDER/$NODE_BIN}"
  w="${w/TRANSFORM_SCRIPT_PLACEHOLDER/$TRANSFORM_SCRIPT}"
  printf '%s\n' "$w"
}

for platform in linux64-bin osx-bin; do
  for hermesc_bin in "$PNPM_STORE"/react-native@0.81*/node_modules/react-native/sdks/hermesc/$platform/hermesc; do
    [ -f "$hermesc_bin" ] || continue
    if [ -f "${hermesc_bin}.real" ]; then
      if [ "$FORCE" = "--force" ]; then
        make_wrapper > "$hermesc_bin"; chmod +x "$hermesc_bin"
        echo "hermesc wrapper updated: $hermesc_bin"; count=$((count + 1))
      else
        echo "hermesc wrapper already installed: $hermesc_bin"
      fi
      continue
    fi
    size=$(stat -c%s "$hermesc_bin" 2>/dev/null || stat -f%z "$hermesc_bin" 2>/dev/null)
    if [ "${size:-0}" -gt 1000000 ]; then
      cp "$hermesc_bin" "${hermesc_bin}.real"
      make_wrapper > "$hermesc_bin"; chmod +x "$hermesc_bin"
      echo "hermesc wrapper installed: $hermesc_bin"; count=$((count + 1))
    fi
  done
done
echo "Done. Installed $count hermesc wrapper(s)."
