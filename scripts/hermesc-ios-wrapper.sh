#!/bin/bash
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"

INPUT_JS=""
for arg in "$@"; do
  case "$arg" in
    *.js|*.bundle|*.jsbundle) INPUT_JS="$arg" ;;
  esac
done

if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  perl -i -pe 's/#([a-zA-Z_][a-zA-Z0-9_]*)/___$1/g' "$INPUT_JS"
  perl -i -ne 'print unless /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/' "$INPUT_JS"
fi

exec "$REAL_HERMESC" "$@"
