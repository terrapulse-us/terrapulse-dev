---
name: Claude tool-calling compliance for specialized vs. generic tools
description: When a Claude tool-calling agent has both a generic tool (e.g. web_search) and a specialized tool that overlaps in capability, the model non-deterministically picks the generic one unless nudged.
---

When an agent loop exposes both a general-purpose tool (web search, free-form reasoning) and a narrower specialized tool that could answer the same question, Claude does not reliably prefer the specialized one on its own — it may answer from prose or call the generic tool instead, and this varies run-to-run even with an identical prompt.

**Why:** observed directly: a system prompt that merely *described* two new specialized tools (cell-coverage check, itinerary builder) got inconsistent compliance — some runs used `web_search` or wrote prose instead of calling them, especially when a competing generic tool existed. Two independent levers fixed it:
1. `temperature: 0` on the `messages.create` call — cuts run-to-run variance in tool selection.
2. Explicit imperative language in the system prompt naming the required tool and forbidding the fallback (e.g. "REQUIRED: call X for Y questions. Do NOT use web_search for this.").
Neither alone was fully reliable in testing; both together produced consistent, correct multi-step tool chains (gather-context tools → specialized tool) across repeated trials.

**How to apply:** when adding a new specialized tool alongside existing general-purpose ones in a Claude tool-calling loop, set `temperature: 0` and add explicit "REQUIRED / do NOT use tool X for this" language to the system prompt up front, rather than waiting to discover non-determinism through flaky e2e tests. Also remember dev servers that build-once-then-start (no watch mode) require a workflow restart before prompt/temperature edits take effect — don't mistake a stale running process for a failed fix.
