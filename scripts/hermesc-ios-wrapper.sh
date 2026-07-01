#!/bin/bash
# iOS hermesc wrapper — RN 0.81 / hermesc v0.12.0
#
# Invoked via HERMES_CLI_PATH build setting set by the withHermescWrapper plugin.
# Mirrors the Linux wrapper (install-hermesc-wrapper.sh) but targets the CocoaPods
# hermes-engine binary instead of the node_modules linux64-bin one.
#
# The pod hermesc rejects:
#   1. Private class fields/methods  (#field, #method)  → "private properties not supported"
#   2. Class declarations/expressions                   → "invalid statement encountered"
#
# Steps:
#   1. perl rename:  #identifier → ___identifier (covers access + declarations + methods)
#   2. perl delete:  bare field-declaration lines (___x; / ___x =) — NOT methods (have "(")
#   3. Babel:        class declarations → ES5 prototype functions (transform-bundle-classes.cjs)
#
# NOTE on the previous SIGABRT:
#   The SIGABRT ("expo-updates error recovery") seen when this step was first enabled was
#   OTA-specific — expo-updates applied a Babel-regenerated bundle as raw JS and hit the
#   Event.NONE non-configurable property crash (now fixed by eventPhasePolyfill.js).
#   For a full Xcode build, hermesc compiles the Babel output to bytecode before it ever
#   runs, so any regeneration differences are compiled away safely.
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRANSFORM_SCRIPT="${SCRIPT_DIR}/transform-bundle-classes.cjs"
# react-native-xcode.sh sources node-binary.sh which exports $NODE_BINARY with the
# fully-resolved node path.  Use it directly; fall back to PATH lookup only if not set.
NODE_BIN="${NODE_BINARY:-$(command -v node 2>/dev/null || echo 'node')}"
# NOTE: never redirect to /tmp/ here — the EAS macOS sandbox prevents opening /tmp/
# for writing, which causes bash to abort the entire node command (Babel never runs).
# Use 2>&1 to route node output to the Xcode build log (stderr of this script).
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
  # Step 1: rename ALL #identifier → ___identifier
  perl -i -pe 's/#([a-zA-Z_][a-zA-Z0-9_]*)/___$1/g' "$INPUT_JS"
  # Step 2: remove bare field declarations (no "(" = not a method)
  perl -i -ne 'print unless /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/' "$INPUT_JS"
  # Step 3: convert class declarations to ES5 functions via Babel
  if [ -f "$TRANSFORM_SCRIPT" ]; then
    "$NODE_BIN" --max-old-space-size=4096 "$TRANSFORM_SCRIPT" "$INPUT_JS" 2>&1 \
      || echo "[hermesc-ios-wrapper] Babel exit=$?" >&2
  fi
fi

exec "$REAL_HERMESC" "$@"
