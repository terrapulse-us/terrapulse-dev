---
name: explore tool only searches the local codebase
description: the `explore` subagent tool cannot do live web research — it will confidently answer from repo files instead, which looks like real research but isn't
---

The `explore` tool's subagent has access to codebase search/read tools only, no web access. If you dispatch it with a question like "find real-world coordinates for X", it will search the repo, find any existing (possibly fabricated) data on the topic, and report those values back as if they were freshly researched — with no indication it didn't go to the web.

**Why:** this is a silent failure mode — the response looks confident and well-formatted, but it's just echoing whatever placeholder/fabricated data already exists in the codebase, defeating the entire point of asking for external verification.

**How to apply:** for any task requiring live web information (current coordinates, prices, docs, news), use `webSearch`/`webFetch` (via code_execution, see `web-search` skill) or a subagent explicitly built for web research — never the generic `explore` tool. Only use `explore` for "how does the code do X" questions.
