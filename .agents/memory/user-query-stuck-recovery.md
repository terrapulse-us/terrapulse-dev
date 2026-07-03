---
name: user_query tool stuck ("prompt already pending this turn")
description: What to do when the clarifying-question tool fails repeatedly and blocks a scoping decision.
---

The `user_query` tool can get stuck mid-session, failing every call with an
error like "a user prompt is already pending this turn," even across
separate turns/messages. Retrying it repeatedly does not help.

**Why it matters:** work can't stall waiting for a clarification that will
never arrive. The task still needs to move forward.

**How to apply:** after 1-2 failed retries, stop calling the tool and make
the most reasonable independent design decision instead — favor the
option that is safest, most backward-compatible, and easiest to extend
later. Then clearly disclose in the final summary (and in the commit
message) that the decision was made autonomously because the
clarification couldn't be obtained, what alternative was chosen and why,
and what the natural follow-up would be if the user wants something
different. Validating the autonomous decision with the architect
(code_review skill, `evaluate_task`) before finalizing is a good
substitute for the missing user sign-off.
