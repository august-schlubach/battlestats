# Knowledge Base

This directory is the durable markdown layer for project knowledge that should survive beyond a single task or chat.

Use it for:

- Upstream API investigations and current behavior notes.
- Verified system behavior that is expensive to rediscover.
- Architecture or operational constraints that affect future implementation choices.
- Research handoff notes where the next query should resume from a known state.

Preferred file shape:

- Title
- Last verified date
- Why this matters
- Current conclusion
- Evidence
- Reproduction steps
- Implications for this repo
- Open questions / next checks

Suggested naming:

- `wows-statsbydate-status.md`
- `player-detail-refresh-behavior.md`
- `docker-local-runtime-notes.md`

Rule of thumb: if a future query would otherwise have to rediscover the same fact pattern from scratch, write it here.
