#!/bin/bash
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRANSFORM_SCRIPT="${SCRIPT_DIR}/transform-bundle-classes.cjs"
NODE_BIN="$(command -v node 2>/dev/null || echo 'node')"

INPUT_JS=""
for arg in "$@"; do
  case "$arg" in
    *.js|*.bundle|*.jsbundle) INPUT_JS="$arg" ;;
  esac
done

if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  perl -i -pe 's/#([a-zA-Z_][a-zA-Z0-9_]*)/___$1/g' "$INPUT_JS"
  perl -i -ne 'print unless /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/' "$INPUT_JS"
  if [ -f "$TRANSFORM_SCRIPT" ]; then
    "$NODE_BIN" --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" \
      2>>/tmp/hermesc-ios-transform.log \
      || echo "[hermesc-ios-wrapper] Babel exit=$? file=$INPUT_JS" >> /tmp/hermesc-ios-transform.log
  fi
fi

exec "$REAL_HERMESC" "$@"
