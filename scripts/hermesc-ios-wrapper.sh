#!/bin/bash
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRANSFORM_SCRIPT="${SCRIPT_DIR}/transform-bundle-classes.cjs"
NODE_BIN="${NODE_BINARY:-$(command -v node 2>/dev/null || echo 'node')}"
echo "[hermesc-ios-wrapper] NODE_BIN=${NODE_BIN}" >&2
echo "[hermesc-ios-wrapper] TRANSFORM exists: $([ -f "${TRANSFORM_SCRIPT}" ] && echo YES || echo NO)" >&2
INPUT_JS=""
for arg in "$@"; do
  case "$arg" in
    *.js|*.bundle|*.jsbundle) INPUT_JS="$arg" ;;
  esac
done
echo "[hermesc-ios-wrapper] INPUT_JS=${INPUT_JS}" >&2
if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  perl -i -pe 's/#([a-zA-Z_][a-zA-Z0-9_]*)/___$1/g' "$INPUT_JS"
  perl -i -ne 'print unless /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/' "$INPUT_JS"
  if [ -f "$TRANSFORM_SCRIPT" ]; then
    "$NODE_BIN" --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" 2>&1       || echo "[hermesc-ios-wrapper] Babel exit=$?" >&2
  fi
fi
exec "$REAL_HERMESC" "$@"
