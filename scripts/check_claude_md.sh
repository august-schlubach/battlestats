#!/usr/bin/env bash
# Enforce CLAUDE.md durability rules — it is always-loaded default context.
# Rules: agents/knowledge/agentic-team-doctrine.json -> "claude_md_rules"
# Procedure: agents/runbooks/runbook-claude-md-durability.md
#
# Caps are tunable via env: CLAUDE_MD_WORD_MAX, CLAUDE_MD_LINE_MAX, CLAUDE_MD_ENV_BULLET_MAX.
#
# The word cap is the binding one. The doctrine names "~1,500 words / ~200 lines",
# but this script measured only lines until 2026-08-15 — and lines are the metric
# CLAUDE.md can violate while passing. At the time the gate was audited the file
# was 194 lines (under the 200 cap, so: green) and 6,484 words: 4.3x the budget,
# because single lines had grown to 6,400 characters. A gate that measures the
# metric prose cannot inflate certifies the drift it exists to catch.
# Pass --all to check regardless of staging (default: only when CLAUDE.md is staged).
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
file="$repo_root/CLAUDE.md"
WORD_MAX="${CLAUDE_MD_WORD_MAX:-1500}"
LINE_MAX="${CLAUDE_MD_LINE_MAX:-200}"
ENV_BULLET_MAX="${CLAUDE_MD_ENV_BULLET_MAX:-8}"

# Unless --all, only enforce when CLAUDE.md is part of the staged commit.
if [ "${1:-}" != "--all" ]; then
  if ! git diff --cached --name-only | grep -qx "CLAUDE.md"; then
    exit 0
  fi
fi

[ -f "$file" ] || exit 0

fail=0

words=$(wc -w < "$file" | tr -d ' ')
if [ "$words" -gt "$WORD_MAX" ]; then
  echo "✗ CLAUDE.md is ${words} words (cap ${WORD_MAX})." >&2
  echo "  This is the binding cap: prose can grow without adding a line." >&2
  echo "  Move detail to agents/runbooks/ or .claude/skills/ and leave a pointer." >&2
  fail=1
fi

lines=$(wc -l < "$file" | tr -d ' ')
if [ "$lines" -gt "$LINE_MAX" ]; then
  echo "✗ CLAUDE.md is ${lines} lines (cap ${LINE_MAX})." >&2
  echo "  It is always-loaded context — move detail to agents/runbooks/ or .claude/skills/ and link it." >&2
  fail=1
fi

# Env-var-catalog heuristic: markdown bullets carrying a backticked ALL_CAPS_UNDERSCORE token.
env_bullets=$(grep -cE '^[[:space:]]*[-*].*`[A-Z][A-Z0-9_]{3,}`' "$file" || true)
if [ "$env_bullets" -gt "$ENV_BULLET_MAX" ]; then
  echo "✗ CLAUDE.md has ${env_bullets} env-var-catalog-style bullets (cap ${ENV_BULLET_MAX})." >&2
  echo "  Move env catalogs to agents/runbooks/ops-env-reference.md and link them." >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "  See agents/runbooks/runbook-claude-md-durability.md." >&2
  echo "  Bypass once (not recommended): git commit --no-verify" >&2
  exit 1
fi
exit 0
