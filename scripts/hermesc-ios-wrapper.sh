#!/bin/bash
# iOS hermesc wrapper — RN 0.81 / hermesc v0.12.0
#
# Invoked via HERMES_CLI_PATH build setting set by the withHermescWrapper plugin.
#
# Applies a safe perl text-substitution pass to strip private class field/method
# syntax (#field, #method) before handing the bundle to the real hermesc.
# This is a pure rename — NO Babel parse/serialize cycle — so it cannot corrupt
# the bundle or cause the expo-updates SIGABRT that the full Babel step caused.
#
# Step 1: rename ALL #identifier → ___identifier (covers accesses, declarations,
#         method names, and static fields in one pass).
# Step 2: delete bare field-declaration lines (___field; / ___field = value;).
#         Method declarations have a "(" after the name and are NOT deleted.
#
# The Babel transform-bundle-classes.cjs step (full re-parse) remains DISABLED.
# It re-serialised the entire 10-30 MB Metro bundle through @babel/generator,
# producing subtly different output that corrupted the startup module and
# triggered expo-updates error recovery → SIGABRT on expo.controller.
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"

INPUT_JS=""
for arg in "$@"; do
  case "$arg" in
    *.js|*.bundle|*.jsbundle) INPUT_JS="$arg" ;;
  esac
done

if [ -n "$INPUT_JS" ] && [ -f "$INPUT_JS" ]; then
  # Step 1: rename ALL #identifier → ___identifier
  # Covers: this.#field → this.___field, #method() {, #field;, static #x = 0
  perl -i -pe 's/#([a-zA-Z_][a-zA-Z0-9_]*)/___$1/g' "$INPUT_JS"
  # Step 2: remove bare field declarations (no "(" = not a method)
  perl -i -ne 'print unless /^\s+___[a-zA-Z_][a-zA-Z0-9_]*\s*[;=]/' "$INPUT_JS"
  if [ -n "${HERMES_WRAPPER_VERBOSE}" ]; then
    echo "[hermesc-ios-wrapper] perl transform applied to $(basename "$INPUT_JS")" >&2
  fi
elif [ -n "${HERMES_WRAPPER_VERBOSE}" ]; then
  echo "[hermesc-ios-wrapper] no .js/.bundle file found in args — skipping transform" >&2
fi

exec "$REAL_HERMESC" "$@"
