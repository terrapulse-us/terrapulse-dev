#!/bin/bash
# iOS hermesc wrapper — RN 0.81 / hermesc v0.12.0
# Invoked via HERMES_CLI_PATH build setting set by the withHermescWrapper plugin.
# Renames private class members (#field → ___field) so hermesc can compile them.
#
# WHY RENAME NOT REMOVE:
#   Removing "#field;" lines breaks multi-line initializers:
#     #x = (function() {   ← removed
#       return 42;         ← left orphaned → syntax error
#     })();
#   Renaming keeps all lines intact and produces valid public class members.
#
# PODS_ROOT is always set by the Xcode build environment.
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
  # Step 1: Rename private field/method ACCESS expressions
  #   this.#field  →  this.___field
  #   obj.#field   →  obj.___field
  perl -i -pe 's/\.#([a-zA-Z_][a-zA-Z0-9_]*)/.___$1/g' "$INPUT_FILE"

  # Step 2: Rename private field/method DECLARATIONS in class bodies.
  #   #field;              →  ___field;
  #   #field = value;      →  ___field = value;
  #   #method() {}         →  ___method() {}
  #   static #field;       →  static ___field;
  #   get #prop() {}       →  get ___prop() {}
  # Anchored to line START (after optional modifiers) so strings/templates are safe.
  perl -i -pe 's/^(\s+(?:(?:static|async|get|set)\s+)*)#([a-zA-Z_][a-zA-Z0-9_]*)/$1___$2/g' "$INPUT_FILE"
fi

exec "$REAL_HERMESC" "$@"
