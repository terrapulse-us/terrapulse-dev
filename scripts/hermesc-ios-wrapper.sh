#!/bin/bash
# iOS hermesc wrapper — RN 0.81 / hermesc v0.12.0
#
# Invoked via HERMES_CLI_PATH build setting set by the withHermescWrapper plugin.
#
# DIAGNOSTIC: Babel pre-transform DISABLED.
# The transform-bundle.cjs step re-parsed and re-serialized the entire 10-30 MB
# Metro bundle through @babel/generator, producing subtly different output even
# when no class fields were found — enough to corrupt a startup module and trigger
# expo-updates error recovery (SIGABRT on expo.controller.errorRecoveryQueue).
#
# The macOS hermesc in Pods (osx-bin) is a newer build than the Linux one and
# handles class-field syntax that the Linux v0.12.0 rejects. iOS builds succeeded
# on TestFlight before the wrapper was added to the iOS path; re-enabling the
# transform broke startup.
#
# If a future build fails with "private properties not supported" / "invalid
# statement encountered" from hermesc, the Babel step can be re-enabled here.
REAL_HERMESC="${PODS_ROOT}/hermes-engine/destroot/bin/hermesc"

if [ -n "${HERMES_WRAPPER_VERBOSE}" ]; then
  echo "[hermesc-ios-wrapper] Calling real hermesc (transform skipped)" >&2
  echo "[hermesc-ios-wrapper] hermesc: ${REAL_HERMESC}" >&2
fi

exec "$REAL_HERMESC" "$@"
