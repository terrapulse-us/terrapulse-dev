#!/bin/bash
# Wrapper for CocoaPods hermes-engine hermesc (RN 0.81 / hermesc v0.12.0)
# Strips private class field syntax that hermesc cannot compile.
# Installed by the withHermescWrapper Expo config plugin during pod install.
REAL_HERMESC="$(dirname "$0")/hermesc.real"
INPUT_JS=""
for arg in "$@"; do case "$arg" in *.js) INPUT_JS="$arg" ;; esac; done
if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  perl -i -pe 's/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/this.___$1/g' "$INPUT_JS"
  perl -i -ne 'print unless /^\s+#[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/ || /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/' "$INPUT_JS"
fi
exec "$REAL_HERMESC" "$@"
