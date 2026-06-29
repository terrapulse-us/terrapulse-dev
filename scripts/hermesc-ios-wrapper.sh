#!/bin/bash
# iOS hermesc wrapper — RN 0.81 / hermesc v0.12.0
#
# Invoked via HERMES_CLI_PATH build setting set by the withHermescWrapper plugin.
#
# WHY THIS EXISTS:
#   hermesc v0.12.0 rejects ALL class field syntax — private (#x) AND public (x = 0;
#   or bare "name;") — with "private properties not supported" or "invalid statement
#   encountered". Babel's plugin-transform-class-properties moves every field
#   declaration into the constructor as a plain assignment, which hermesc accepts.
#
#   Previous approach (perl regex rename #x → ___x) turned private fields into PUBLIC
#   fields, which hermesc ALSO rejects. The Node.js/Babel approach eliminates them.
#
# HOW:
#   1. Find the bundle file in the hermesc argument list.
#   2. Run scripts/transform-bundle.js (Node.js + @babel/core) on it in-place.
#   3. Hand the transformed bundle to the real hermesc.
#
# PODS_ROOT is always set by the Xcode build environment.
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INPUT_FILE=""
for arg in "$@"; do
  case "$arg" in
    *.js|*.jsbundle)
      if [ -f "$arg" ]; then
        INPUT_FILE="$arg"
      fi
      ;;
  esac
done

if [ -n "$INPUT_FILE" ]; then
  node "$SCRIPT_DIR/transform-bundle.cjs" "$INPUT_FILE" >&2
fi

exec "$REAL_HERMESC" "$@"
