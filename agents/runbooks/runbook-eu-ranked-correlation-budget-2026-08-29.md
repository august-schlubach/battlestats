# EU ranked correlation: the budget the fan-out exposed (2026-08-29)

**Status:** shipped.
**Predecessors:** `runbook-ops-alert-remediation-2026-08-28.md` (the fan-out),
`runbook-correlation-warm-budget-and-per-realm-alerting-2026-08-26.md` (the 780s
sizing and the realm-scoped locks).

This closes the 08-28 follow-up that read *"EU correlation duration is still
unmeasured. After the fan-out lands, the three per-metric durations for EU are
the first honest measurement of what was censored at 900s."* They are now
measured, and one of the three does not fit.

## The alert

```
[battlestats] ops ALERT: warm_player_correlations_task missing on eu; 2 gunicorn timeouts
```

Two conditions, and **neither one names the actual defect.**

| Code | Verdict |
|---|---|
| `celery_task_realm_failing:warships.tasks.warm_player_correlations_task:eu` | True of the window, already self-clearing, not the problem. |
| `gunicorn_worker_timeouts` (2, limit 2) | Deploy artifact. Watch, do not remedy. |

## Condition 1 is an artifact of the deploy, and will not recur

`snapshot_service_health.sh` builds the per-realm success axis by grepping
`Finished <task> realm=<r>` and prefixing `warships.tasks.`. The 24h window ended
11:01 UTC on 08-29 and straddled the v5.6.4 deploy at 04:46:

- `Finished warm_player_correlations_task realm=asia` — 08-28 16:58 → asia 1
- `Finished warm_player_correlations_task realm=na` — 08-29 00:54 → na 1
- eu's only pre-deploy attempt was 08-28 08:46, which raised
  `SoftTimeLimitExceeded` at 09:01 and is outside the window anyway → eu 0

Post-deploy the parent is a **pure dispatcher**: it logs `Starting … realm=<r>`,
enqueues three messages, and returns in ~5ms without ever logging a `Finished`
line — by design, and pinned by
`test_the_dispatcher_emits_no_per_realm_success_line`. So from 08-30 the parent
reads 0/0/0, and `celery_task_realm_failing` cannot trip on it at all: the rule
needs a realm succeeding while another does not.

**The per-realm correlation signal has MOVED, not vanished.** It now lives on the
three subtask names — `warm_player_wr_survival_correlation_task`,
`warm_player_ranked_wr_battles_correlation_task`,
`warm_player_clan_battle_wr_battles_correlation_task` — each of which logs its
own `Finished … realm=<r>`. Read those rows in the digest, not the parent's.
No code changed for this condition.

## Condition 2 is a deploy artifact

Both `[CRITICAL] WORKER TIMEOUT` lines are at **05:01:23 and 05:01:36** — 13
seconds apart, under a gunicorn parent that started at the 04:46 deploy, inside
the 05:00–05:11 cold-cache correlation storm. Two workers dying in the same
quarter-minute is a shared-resource stall, not a slow handler. The digest named
`/api/fetch/clan_data/1000101335:active` and
`/api/fetch/clan_members/1000101335`; that is an attribution heuristic reporting
whoever happened to be browsing, and chasing that clan would have wasted the
investigation. It fired at exactly the boundary (2 of 2). Watch tomorrow.

## The real defect: eu `ranked_wr_battles` does not fit 780s

The 08-26 sizing measured 389–500s per realm — but on a sample where the three
metrics still shared one budget, so it understated the heaviest of them. Split
out by the fan-out, the eu ranked aggregation alone is:

| realm | ranked_wr_battles | wr_survival | clan_battle_wr_battles | tracked pop (ranked) |
|---|---|---|---|---|
| na | 600s | 1.9s | 22s | 57,541 |
| asia | 597s | 1.5s | 33s | 71,908 |
| **eu** | **708s / 757s (successes)** | 2.2s | 48s | **102,558** |

eu is the tail because its ranked population is ~1.8× na's. The other two
metrics are nowhere near the limit.

On 08-29 eu ranked soft-limited **six times** — 05:21, 09:00, 13:07, 14:07,
14:39, 14:54 — before completing at 15:08 in 708s. Each killed attempt spent
13 minutes of a 3-slot background pool producing nothing, and the on-view
dispatch path re-queued it every time the fresh key stayed cold: roughly **80
minutes of background occupancy for zero output.** Raising the budget here
*reduces* pool contention rather than adding to it. That is the argument that
makes this defensible against the standing note that the background pool is
contended.

**The digest structurally cannot see this.** `celery_task_realm_failing` is a
"0 successes in 24h" rule. eu had six failures *and one success*, so the correct
code never fired and will not fire on any day eu completes even once. This was
found by hand in the worker journal. A regression will be invisible the same way
— verify by the absence of `SoftTimeLimitExceeded`, never by tomorrow's mail.
Fixing the detector was deliberately **not** bundled here: it is a second change
that would muddy attribution on the budget change.

## The fix, and the constraint that shaped it

```
CORRELATION_METRIC_WARM_TASK_OPTS   780s soft / 840s hard  →  1080s / 1200s
CORRELATION_METRIC_WARM_LOCK_TIMEOUT                        →  1320s (new)
PLAYER_{RANKED,CLAN_BATTLE}_WR_BATTLES_CORRELATION_REFRESH_DISPATCH_TIMEOUT
                                     900s                   →  1200s
```

**The blocking constraint was the lock, not the limit.** `_run_locked_task`'s TTL
is `RESOURCE_TASK_LOCK_TIMEOUT` (900s), shared with ~20 other callers. Raising
the soft limit past it without touching the lock would let the lock lapse
mid-run, and the on-view path at `tasks.py:queue_player_ranked_wr_battles_
correlation_refresh` could start a **second identical 20-minute aggregation** on
the same 3-slot pool — the duplicate-warm class the realm-scoped locks were
introduced on 08-26 to remove. **Soft limit and lock TTL move together, or not at
all.**

So `_run_locked_task` gained an optional `lock_timeout` (defaulting to `None` →
`RESOURCE_TASK_LOCK_TIMEOUT`, leaving every other caller untouched), and the
three correlation metric tasks pass `CORRELATION_METRIC_WARM_LOCK_TIMEOUT`
explicitly. Invariant preserved: **1080 < 1200 ≤ 1320.**

The dispatch dedup keys moved with it for the same reason: they are cleared in
the task's `finally`, so their TTL is only a safety net — but a net shorter than
the run it guards lets a second enqueue land mid-aggregation.

na and asia gain headroom they do not currently need. That is accepted: there is
no per-realm budget knob, and inventing one for a single tail realm is more
machinery than the problem earns.

### Tests

`warships/tests/test_correlation_warm_budgets.py`, 17 passing:

- `test_each_metric_task_passes_the_longer_lock_ttl` — the load-bearing one; a
  task that forgets the explicit `lock_timeout=` reopens the duplicate-warm hole.
- `test_run_locked_task_defaults_to_the_resource_ttl` — the new parameter did not
  move the default for the other callers.
- `test_on_view_dispatch_dedup_outlives_the_hard_limit`.
- `test_per_metric_budget_fits_under_its_lock_ttl` — comparand changed from
  `RESOURCE_TASK_LOCK_TIMEOUT` to the new constant.
- `test_the_dispatcher_budget_is_not_a_bound_on_the_metrics` — replaces
  `test_combined_budget_exceeds_the_per_metric_budget`, whose ordering became
  false when the per-metric soft limit passed the parent's 900s. Inverting it
  back would silently re-cap the metrics at the dispatcher's number.

## Verification

**Not tomorrow's mail** — the digest cannot see this condition. Read the journal:

```bash
ssh root@battlestats.online 'journalctl -u battlestats-celery-background \
  --since "24 hours ago" --no-pager \
  | grep -E "warm_player_ranked_wr_battles_correlation_task" \
  | grep -E "Finished|SoftTimeLimit"'
```

Expect `Finished warm_player_ranked_wr_battles_correlation_task realm=eu` on each
Beat fire and **no** `SoftTimeLimitExceeded`. A single success is not proof: eu
succeeded once on 08-29 too. The claim is that failures stop, so look at the
ratio across a full day.

## Follow-ups

- **1080s is ~1.43× the slowest observed success, and every killed run is
  censored** — the true eu tail is still unknown. If eu ranked starts landing
  above ~1000s, the answer is the query, not another budget raise.
- **The "0 successes in 24h" rule cannot see a task that fails most runs and
  succeeds once.** A ratio-based or duration-based condition would have caught
  eu ranked on 08-27. Scoped to the digest writer, deliberately not bundled here.
- **`gunicorn_error_paths` still invites misattribution** — carried forward
  unchanged from 08-28: reporting the timeout timestamps alongside the paths
  would let a reader see a 13-second cluster without reaching for the journal.
