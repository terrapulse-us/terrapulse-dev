---
name: EAS macOS sandbox blocks /tmp/ writes in hermesc wrapper
description: On EAS macOS build machines, bash 2>>/tmp/file inside hermesc-ios-wrapper.sh silently aborts the Babel node command — use 2>&1 instead.
---

## Rule
Never use `2>>/tmp/...` (or any file-based output redirect) inside `scripts/hermesc-ios-wrapper.sh`. The EAS macOS build sandbox blocks opening `/tmp/` for writing. When bash cannot open the redirect target, it aborts the entire command — the node/Babel process never runs.

**Why:** This was the root cause of 3 consecutive "invalid statement encountered" iOS build failures. The Babel class transform never ran because bash killed the `"$NODE_BIN" ... "$TRANSFORM_SCRIPT" ...` line before node started. The error was completely silent (the failed redirect itself produced no output visible in the Xcode log).

**How to apply:**
- Use `2>&1` to route node stderr to the wrapper's own stderr → Xcode build log captures it.
- For `||` fallback messages, use `>&2` (e.g. `|| echo "..." >&2`), not `>> file`.
- This applies to ALL commands inside the wrapper, not just the Babel step.
- The Linux wrapper (`install-hermesc-wrapper.sh`) is unaffected — Linux EAS machines allow /tmp/ writes.
