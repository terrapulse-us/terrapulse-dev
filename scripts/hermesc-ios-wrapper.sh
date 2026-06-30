#!/bin/bash
# iOS hermesc wrapper — Babel pre-transform DISABLED (see comment for why)
# The Babel re-serialization of the full Metro bundle was corrupting startup
# code → Hermes fatal error → expo-updates SIGABRT. osx hermesc handles
# class fields natively; this wrapper now just calls it directly.
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"
exec "$REAL_HERMESC" "$@"
