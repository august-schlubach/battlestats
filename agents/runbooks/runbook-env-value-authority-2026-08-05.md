# Runbook: Environment-value authority and drift detection

_Created: 2026-08-05_
_Lifecycle: evergreen · Owner: platform_
_Context: a disk-growth investigation lost time three separate ways to one error class — a production value asserted by something that was not its authority. This runbook fixes the instances, names the rule, and wires the check that catches the next one._

## Purpose

Establish **where a production configuration value comes from**, and make a violation detectable instead of discoverable. Read this before writing any doc, runbook, commit message, or analysis that states a live env value; and before proposing that a production setting be reduced or reversed.

## TL;DR

- **Authority order**: `server/deploy/deploy_to_droplet.sh` (git-tracked pins) → live `/etc/battlestats-*.env` (manual edits, survive deploys) → **nothing else**. A code default is *not* the live value. Prose in another doc is *not* the live value. Behavior inferred from data shape is *not* evidence a gate is on.
- **Every stated value carries its authority**: `prod=105 since 2026-07-24, pinned in deploy_to_droplet.sh`. A bare number is the drift pattern.
- **Run `server/scripts/check_env_drift.sh`** when touching env-gated behavior or any doc naming an env var. Checks 1 and 3 gate; check 2 is a standing backlog.
- **`set_env_value` edits in place** (`sed`) or appends — it never regenerates the file. Unpinned `/etc` values therefore **survive deploys**. This is a visibility problem, not an outage risk, until a droplet rebuild.

## The three failures this came from (2026-08-05)

| # | What was asserted | What was true | Cost |
|---|---|---|---|
| 1 | `CLAUDE.md` + archive runbook + `ops-env-reference`: retention **92 days** | **105 days** (`deploy_to_droplet.sh:705`), deliberately sized to sustain the 90d rolling read | An audit agent ranked "cut retention to 75d" as a remediation — proposing the rollback of a committed roadmap item. Two rounds of correction. |
| 2 | `BATTLE_OBSERVATION_COMPACT_KEEP` = 3 (the code default), inferred from its absence in the deploy script | **1**, set in live `/etc` | The agent's top-ranked lever (~3.3 GB) did not exist. |
| 3 | 07-19 audit F6: the 180d `battles_json` prune is "visibly working", inferred from the light long-inactive tail | `PRUNE_BATTLES_JSON_ENABLED=0` — **it has never run** | A ~2 GB unbounded ratchet was recorded as "no large waste here". |

All three are the same shape: **a live behavior established by something other than its authority.** Note that #1 and #3 were written by prior sessions and believed by later ones; the estate self-propagates a wrong value once it is written down.

## The rule

> A production configuration value may be stated only with its **authority** and the **date observed**. Prefer a pointer over a copied number.

Good (the form that survived this session untouched — `CLAUDE.md`, `SHIP_LEADERBOARD_WINDOW_DAYS`):

> **prod=45** since 2026-07-24, pinned in `server/deploy/deploy_to_droplet.sh`; the code default stays 30 — read the deploy script, not `data.py`, for the live value.

Bad:

> retention is 92 days

For a value where code default and prod differ, `ops-env-reference.md` uses: `` `KEY` (code default 0; **prod=1**) ``.

**Corollary for analysis and remediation.** Before proposing that a setting be reduced, reversed, or removed, establish *why it holds its current value*. A setting sized for a roadmap commitment is not slack to reclaim. Check the runbooks and `agents/work-items/`, or ask.

## The check

```bash
server/scripts/check_env_drift.sh [host]            # default battlestats.online
server/scripts/check_env_drift.sh --strict [host]   # also gate on check 2
```

Read-only; SSHes for `/etc/battlestats-server.env` and reconciles it three ways.

| Check | What it finds | Gates by default? |
|---|---|---|
| **1. Pinned but divergent** | The deploy script pins a value production is ignoring. The dangerous case. | **Yes** |
| **2. Live but unpinned** | Behavior keys the repo never pins. Infra/secret keys are excluded (they belong in Pass). Keys *described in docs* are highlighted — the repo asserts behavior it cannot verify. | No — informational |
| **3. Docs contradicting production** | A doc states a value-shaped number that is not the live one. **This is the check that would have caught 92-vs-105.** | **Yes** |

**Why check 2 does not gate.** Pinning the ~25-key backlog is a separate reviewable change with its own deploy risk, and a permanently-red gate gets ignored — which is the failure mode this script exists to prevent. Run `--strict` once the backlog is pinned so it cannot regrow.

**Check 3 is a heuristic.** It reads numbers only from value-shaped positions (`**105**`, `(92)`, `prod=45`, `= 30`) and only from the segment of the line belonging to that key, so a line documenting several keys no longer cross-flags. Residual false positives are possible; confirm by hand. The fix is always to name the authority, not to reword around the check.

Wired into the `doctrine-precommit` skill as requirement 6.

## State as of 2026-08-05

- **Check 1: clean.** Every deploy-script pin is winning in production.
- **Check 2: ~40 unpinned behavior keys**, of which ~25 are described in docs. Includes `BATTLE_OBSERVATION_COMPACT_KEEP`, `HOT_PLAYERS_ENABLED`/`_MAX`, `FLOOR_REFRESH_BATTLES_JSON_ENABLED`, the whole `BATTLE_OBSERVATION_FLOOR_*` tuning family, `RECAPTURE_LAPSED_*`, `SHIP_BADGE_TIERS`, `CLAN_CRAWL_CORE_ONLY`. **Open follow-up.**
- **Check 3: clean**, after this tranche fixed six `(0)`-vs-`prod=1` lines in `ops-env-reference.md` plus the retention text in three files.

## What this tranche changed

| File | Change |
|---|---|
| `CLAUDE.md` | Added `BATTLE_HISTORY_ARCHIVE_RETENTION_DAYS` **prod=105** with authority + the 90d-target rationale. It was absent from always-loaded context entirely — the most consequential capacity constant, unstated. |
| `agents/runbooks/ops-env-reference.md` | Retention 92→105 with authority, measured fill dates, and "not a disk lever". Six `(0)` → `(code default 0; **prod=1**)` fixes. |
| `runbook-battle-history-archive-prune-2026-06-17.md` | Title + 4 body sites 92→105; corrected fill-date construction; noted the old cost estimate understated the plateau ~14 GB. |
| `runbook-db-table-audit-2026-07-19.md` | **F6 corrected** — the prune has never run; recorded the error class. |
| `agents/knowledge/agentic-team-doctrine.json` | One rule each to `pre_commit_requirements`, `decision_rules`, `claude_md_rules`. |
| `.claude/skills/doctrine-precommit/SKILL.md` | Requirement 6: env-value authority. |
| `server/scripts/check_env_drift.sh` | New. |

## How to re-measure

```bash
server/scripts/check_env_drift.sh
# spot-check a single key end to end:
grep -n 'set_env_value BATTLE_HISTORY_ARCHIVE_RETENTION_DAYS' server/deploy/deploy_to_droplet.sh
ssh root@battlestats.online 'grep BATTLE_HISTORY_ARCHIVE_RETENTION_DAYS /etc/battlestats-server.env'
```

## Validation

- `set_env_value` semantics read directly from `server/deploy/deploy_to_droplet.sh:448-459` — `grep -q "^KEY="` then `sed -i` in place, else append. Confirms unpinned values survive deploys.
- Retention 105 confirmed two ways: deploy script line 705, and the live `/etc` on battlestats.online.
- `PRUNE_BATTLES_JSON_ENABLED=0` and `BATTLE_OBSERVATION_COMPACT_KEEP=1` confirmed the same two ways.
- Script exercised against production: default exit 0, `--strict` exit 1, check 3 clean after the doc fixes.
- Not validated: whether a droplet rebuild would actually lose the unpinned keys. Inferred from `set_env_value` reading an existing file; no rebuild was performed.

## Follow-ups

1. **Pin the documented-but-unpinned keys** (check 2, ~25 keys) in `deploy_to_droplet.sh` with their current live values, then switch the gate to `--strict`. Separate commit; each pin is a potential behavior change if a live value was never intended.
2. **Extend `DOC_PATHS`** beyond `CLAUDE.md` + `ops-env-reference.md` once check 3 is stably clean — the runbook corpus carries values too.
3. **Consider a no-SSH mode** (deploy-script ↔ docs only) so the check can run in CI, where SSH to the droplet is not available.

## Related

- `agents/work-items/db-growth-capacity-2026-08-05.md` — the investigation that surfaced this
- `agents/runbooks/runbook-db-table-audit-2026-07-19.md` — F6 corrected here; its "Item 10 env-gate alignment" was an earlier, narrower pass at the same problem
- `agents/runbooks/ops-env-reference.md` — the catalog
- `agents/runbooks/runbook-claude-md-durability.md` — why CLAUDE.md stays thin
