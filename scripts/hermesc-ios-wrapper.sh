#!/bin/bash
# iOS hermesc wrapper — RN 0.81 / hermesc v0.12.0
# Invoked via HERMES_CLI_PATH build setting set by the withHermescWrapper
# Expo config plugin. Strips private class field syntax (#field) from the JS
# bundle before passing it to the real hermesc binary.
#
# PODS_ROOT is always set by the Xcode build environment.
# The real binary is the one placed by the "Replace Hermes for the right
# configuration" CocoaPods build phase — we intentionally do NOT touch it.
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"

INPUT_FILE=""
for arg in "$@"; do
  case "$arg" in
    *.js|*.jsbundle)
      if [ -f "$arg" ]; then INPUT_FILE="$arg"; fi
      ;;
  esac
done

if [ -n "$INPUT_FILE" ]; then
  # 1. Replace this.#field access with this.___field
  perl -i -pe 's/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/this.___$1/g' "$INPUT_FILE"
  # 2. Strip bare private field declarations (#field; or #field = ...)
  perl -i -ne 'print unless /^\s+#[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/' "$INPUT_FILE"
fi

exec "$REAL_HERMESC" "$@"
