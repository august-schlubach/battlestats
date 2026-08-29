# Runbook: Ops Alert Remediation, 2026-08-28

_Created: 2026-08-28_
_Context: the 2026-08-28 ops ALERT tripped four conditions; investigation via the new `/ops-alert` skill found one real defect, one detector false positive, and one already-fixed item misattributed by the writer._
_QA: reviewed 2026-08-28; see QA Notes._

## QA Notes

_Reviewed 2026-08-28 against /home/august/code/battlestats. 30 assertions checked, 5 corrected._

### Resolved

- **I2: "Keep the task name … unchanged"** -> actual: the dispatcher would still run `logger.info("Finished warm_player_correlations_task realm=%s: %s", …)` (`server/warships/tasks.py:1949`), and the service-health writer derives per-realm successes by grepping exactly that string: `grep -aoE 'Finished [a-z_0-9]+ realm=[a-z]+'` (`server/scripts/snapshot_service_health.sh:88-90`). A dispatcher that keeps the line would be tallied as the realm's success and `celery_task_realm_failing` would go **falsely green** while the real work failed -> I2 now requires the dispatcher to emit no `Finished … realm=` line, and I1 pins the exact log format the writer parses.

- **I1: no routing step** -> actual: `CELERY_TASK_ROUTES` pins both existing per-metric tasks to `background` (`server/battlestats/settings.py:343,347`) and `test_both_per_metric_correlation_warmers_route_to_background` guards them as a pair (`server/warships/tests/test_correlation_warm_budgets.py:26-38`); its docstring records that the clan-battle task was **unrouted and landed on `default`**, the exact defect a new unrouted task would reproduce -> I1 gained an explicit `settings.py` route step, and I4 extends the pair test to a triple.

- **I4: existing budget tests not accounted for** -> actual: `test_correlation_tasks_carry_the_new_budgets` asserts the soft limits of all three named tasks (`server/warships/tests/test_correlation_warm_budgets.py:84-94`) and `test_combined_warmer_exceeds_a_single_metric` asserts `PLAYER_CORRELATIONS_WARM_TASK_OPTS > CORRELATION_METRIC_WARM_TASK_OPTS` (:78-82). Neither *fails* after the change, but the second one's premise dies with the serial execution it describes -> I4 now names both, adds the new task to the first, and requires the second's rationale to be rewritten rather than left asserting a now-meaningless ordering.

- **I2: `startup_warm_caches_task` call site uncounted** -> actual: it dispatches `warm_player_correlations_task` as one of four warmers, realm-inner, with deliberate `spacing` so "twelve DB-heavy tasks don't burst against a 2-vCPU managed Postgres at once" (`server/warships/tasks.py:3266,3262-3265`). After fan-out the same loop yields **18** DB-heavy tasks, and the three correlation metrics per realm arrive unspaced -> recorded in I2 with the decision to leave the call site alone, and the reason.

- **I3: the exemption's cost was unstated** -> actual: `celery_task_realm_failing` requires at least one realm to be succeeding before it fires (`server/scripts/daily_ops_email.py:665-668`, pinned by `test_a_task_with_no_successes_anywhere_does_not_double_report`, `server/warships/tests/test_daily_ops_email.py:923-934`). So for an exempt task that is broken in **every** realm, both Celery rules stay silent and the only cover is `snapshot_stale:crawl-yield:{r}` at 168h -> F2 and I3 now state the 7-day blind window explicitly instead of implying the exemption is free.

### Unverified

- EU's true `warm_player_correlations` duration: every run is censored at the 900s soft limit, so the runbook's premise that fan-out fixes it rests on the per-metric measurements (389-500s each, `server/warships/tasks.py:43-47`) rather than on a completed EU run. If any single EU metric alone exceeds 780s, fan-out relocates the failure instead of removing it. Validation step 4 is what settles it.
- The 2026-08-27 19:19:53-56 gunicorn stall's cause. Three workers died within three seconds and the journal for that window carries only routine enrichment logging; no shared-resource culprit was identified. F3 changes nothing on that basis, which is a decision to stop looking, not a diagnosis.
- Crawl-pass gap medians (na 69.7h / eu 117.8h / asia 107.8h) are quoted from `agents/runbooks/runbook-ops-email-exception-only-2026-08-09.md`, derived from the droplet benchmark corpus on 2026-08-09; not re-derived here.

## Purpose

Carry the three surviving items from the 2026-08-28 ops alert to a decision and,
where the fix is precedent-consistent and measurable, to production. This runbook
is the implementation plan for two code changes plus one deliberate non-change.

It exists because two of the four conditions were **not** what they appeared to
be, and a future reader who takes the alert text at face value will fix the wrong
thing. Investigation record: `MEMORY.md → project_ops_alert_2026-08-28`.
The skill that produced it: `.claude/skills/ops-alert/SKILL.md`.

## Findings

### F1 — `warm_player_correlations_task` cannot fit its own budget on EU (real defect)

`PLAYER_CORRELATIONS_WARM_TASK_OPTS` (`server/warships/tasks.py`) is
`soft_time_limit = 900s`, `time_limit = 1020s`. The task calls
`warm_player_correlations()` (`server/warships/data.py`), which runs **three**
population correlations **serially in-process**:

1. `warm_player_wr_survival_correlation`
2. `warm_player_ranked_wr_battles_population_correlation`
3. `warm_player_clan_battle_wr_battles_population_correlation`

Each of those is separately budgeted at **780s soft** by
`CORRELATION_METRIC_WARM_TASK_OPTS`, whose own comment records the measurement:
"389-500s on EVERY realm (eu 468s, asia 389s, na 429/500s)". So the combined
warmer is given **1.15x the budget of one of its three components**.

Observed 2026-08-28 on `battlestats-celery-background`:

| realm | outcome | duration |
|---|---|---|
| na | succeeded | 515s |
| asia | succeeded | 805s |
| eu | `SoftTimeLimitExceeded` every run since 08-27 | >900s (censored) |

EU is the largest realm (`active_7d` 100,634 vs asia 73,851, na 56,927), so it is
the one that does not fit. v5.6.2 (`012f698`, 08-27) realm-scoped the correlation
locks and sized the **per-metric** budgets; it did not touch the combined warmer.

**Headroom is the wrong lever and cannot be sized anyway.** Every EU run is
censored at 900s, so EU's true duration is unknown. The repo invariant is
`soft < hard <= lock TTL` and `CORRELATION_WARM_LOCK_TIMEOUT = 1200s`; applying
this repo's own sizing heuristic (~1.5x the slowest *successful* run) to asia's
805s already lands past 1200s, making it a three-constant change against an
unmeasured tail.

**Fan-out is the precedent.** `55b946f` split `startup_warm_caches_task` rather
than giving it headroom, and the `CORRELATION_METRIC_WARM_TASK_OPTS` comment
calls that "the OPPOSITE call" **because a single population correlation is not
separable**. `warm_player_correlations` is not a single correlation: it is three
separable calls, **two of which already have their own Celery task** with the
780s budget and a realm-scoped `_run_locked_task` lock:

- `warm_player_ranked_wr_battles_correlation_task` (tasks.py ~1479)
- `warm_player_clan_battle_wr_battles_correlation_task` (tasks.py ~1506)

Only `win_rate_survival` lacks one.

### F2 — `celery_task_failing:crawl_all_clans_task` is a detector false positive

The alert reads "SoftTimeLimitExceeded 4x in the last 24h, succeeded 0 times.
Zero successes means no pass is currently reaching completion." The premise is
wrong for this task.

A clan-crawl **pass** is not a run. `crawl_all_clans_task`'s own comment states a
full pass takes **~12-18h**, while `CRAWL_TASK_OPTS` gives each dispatch
**20700s (5h45m)**. Truncation is therefore the designed steady state: the
`SoftTimeLimitExceeded` path deliberately keeps the pass marker, the yield
aggregate keeps accumulating into the same `pass_id`, and the realm resumes on
its next daily Beat. A pass completes — and only then logs `Finished` and emits a
crawl-yield snapshot — every **2 to 4 dispatches**.

Journal evidence, 7 days to 2026-08-28 on `battlestats-celery-crawls`:

| completion | realm |
|---|---|
| Aug 24 09:08 | eu |
| Aug 26 00:59 | asia |
| Aug 26 13:47 | na |

Three completions in seven days. On **4 of 7 days** the 24h window contains zero
successes and at least one `SoftTimeLimitExceeded` — which is exactly the shape
the rule alerts on. Nothing is overdue: the runbook-recorded pass gaps are
median na 69.7h / eu 117.8h / asia 107.8h, so eu's next completion is due ~08-29.

The `_evaluate_service_health` comment already states the design intent — "A
digest that fires every morning is a digest nobody reads, and then the one
morning it matters is indistinguishable from the rest." This task defeats the
zero-success discriminator the same way the cache warmers defeated the
any-failure discriminator, and for a structurally similar reason: the unit of
work is larger than the measurement window.

The family is **not** left unwatched. `snapshot_stale:crawl-yield:{r}` already
covers it at 168h (7d), derived from a worst healthy observed age of 131.6h.
That rule fires when passes genuinely stop completing; the zero-success rule
fires when they are merely mid-pass.

**The exemption is not free, and QA made the cost explicit.** `celery_task_realm_failing`
only fires when at least one realm is succeeding (`daily_ops_email.py:665-668`),
so a crawler broken in *every* realm trips neither Celery rule once the task is
exempt. The 168h crawl-yield staleness rule becomes the sole cover, which means a
**7-day blind window** on a total crawl failure. That is the trade being made:
seven days of latency on a rare total failure, against a false positive four days
in seven.

### F3 — `gunicorn_worker_timeouts` named the wrong path (no change)

All three timeouts were a **single cluster**: `[CRITICAL] WORKER TIMEOUT` at
2026-08-27 19:19:53, 19:19:53, 19:19:56. Three workers dying within three seconds
is a shared-resource stall, not a slow handler.

The digest named `/api/landing/player-suggestions x3` from
`gunicorn_error_paths`, which is a path-attribution heuristic. That path's actual
defect — the unescaped LIKE `_` that killed the trigram index — was fixed in
`648f221`, is merged, and is live in release `20260827002439`: `?q=branding_`
returns 200 in under a second, and every suggestions request in the 36h journal
is a fast 200.

No code change here. The trap is documented in the `/ops-alert` skill's condition
table and red flags, which is where a future investigation will read it.

## Decisions

0. **This reverses a decision recorded two days earlier, deliberately.**
   `runbook-correlation-warm-budget-and-per-realm-alerting-2026-08-26.md` D2 lists
   fan-out under "Not chosen", on the grounds that "ranked alone needs ~450s, so a
   fan-out relocates the failure instead of removing it". That was correct against
   the budget in force when it was written — `TASK_OPTS`' 540s. **D2 itself raised
   the per-metric budget to 780s in the same commit**, which removes the premise:
   at 780s each metric fits alone, and only the combined task does not. The 08-26
   runbook carries a superseding note pointing here. Read a "not chosen" note
   against the constants as they end up, not as they were when it was drafted.

1. **F1: fan out, do not add headroom.** Add the missing per-metric task for
   `win_rate_survival`, then convert `warm_player_correlations_task` from a
   serial in-process runner into a dispatcher. Its own duration becomes
   milliseconds and its 900s budget stops binding. Each metric then runs under
   the 780s budget its own measurement justified.

2. **F1 corollary: the dispatch gate must survive the change.** `queue_warm_player_correlations`
   gates cold-cache user traffic on `_correlation_warm_lock_key` being held. A
   dispatcher that releases that lock in a `finally` after ~0s destroys the gate,
   and every player-page load on a cold cache re-enqueues — the 4581-message
   pileup shape the function's comment cites. The dispatcher therefore **sets the
   lock and lets it expire** at `CORRELATION_WARM_LOCK_TIMEOUT` (1200s) rather
   than deleting it.

3. **F1 corollary: preserve per-realm observability.** The ops digest's
   `celery_task_realm_failing` rule keys on (task, realm). Moving the work into
   three separately-named tasks moves the signal with it: each per-metric task
   logs `realm=%s` and is tallied by `snapshot_service_health.sh` on the same
   axis. A dispatcher that always succeeds must not become the only thing
   watched — verify in Validation that the three metric tasks appear in the
   service-health snapshot per realm.

4. **F2: exempt long-cycle tasks from the zero-success rule**, keyed to a named
   constant, not a magic string. The exemption is narrow: only tasks whose unit
   of work spans more than one dispatch by design and which are already covered
   by a staleness rule on their output. `crawl_all_clans_task` is the only member
   today.

5. **F3: no code change.** Documented in the skill.

## Implementation

### I1 — `warm_player_wr_survival_correlation_task` (`server/warships/tasks.py`)

New task next to its two siblings, same decorator and lock shape:

- `@app.task(bind=True, **CORRELATION_METRIC_WARM_TASK_OPTS)`
- body calls `_run_locked_task("warm_player_wr_survival_correlation", realm, self.request.id, lambda: warm_player_wr_survival_correlation(realm=realm))`
- logs `Starting warm_player_wr_survival_correlation_task realm=%s` and, on a
  non-skipped result, **exactly** `Finished warm_player_wr_survival_correlation_task realm=%s`.
  The format is load-bearing, not cosmetic: `snapshot_service_health.sh:88-90`
  greps `Finished [a-z_0-9]+ realm=[a-z]+` and prefixes the captured name with
  `warships.tasks.`, so any other phrasing makes the task invisible to the
  per-realm axis. Guard the `Finished` line behind `result.get("status") != "skipped"`
  as both siblings do (`tasks.py:1499,1526`) — a skip logged as a finish is a
  success the digest never earned.
- add `'warships.tasks.warm_player_wr_survival_correlation_task': {'queue': 'background'}`
  to `CELERY_TASK_ROUTES` (`server/battlestats/settings.py`, beside :343 and :347).
  Its clan-battle sibling shipped unrouted and landed on `default`; that is the
  defect `test_both_per_metric_correlation_warmers_route_to_background` exists to
  prevent recurring.
- no dispatch-key `finally`: the two siblings clear a *refresh dispatch* key that
  exists only because a user-traffic path sets it; `win_rate_survival` has no
  such path, so inventing a key here would be dead code.

### I2 — `warm_player_correlations_task` becomes a dispatcher

Replace the `warm_player_correlations(realm=realm)` call with three `.delay(realm=realm)`
dispatches. Keep the task name, the Beat registration
(`player-correlation-warmer-{realm}` in `signals.py`), and the realm kwarg
unchanged so no migration is needed.

- acquire `_correlation_warm_lock_key(realm)` with `cache.add` as today
- on success, dispatch the three metric tasks and return a summary of what was
  dispatched
- **remove the `Finished warm_player_correlations_task realm=%s` log line.** QA
  finding: the service-health writer tallies per-realm successes off that exact
  string (`snapshot_service_health.sh:88-90`), so a dispatcher that keeps it
  would be counted as the realm's success and `celery_task_realm_failing` would
  read green while all three metrics failed. Log the dispatch at INFO in any
  wording that does **not** match `Finished <name> realm=<realm>`.
- **remove the `finally: cache.delete(lock_key)`** — per Decision 2 the lock must
  outlive the dispatcher. Delete the lock only on the dispatch-failure path, so a
  broker outage does not gate the realm for 20 minutes.
- keep `warm_player_correlations()` in `data.py` untouched: it is the synchronous
  entry point for `startup_warm_all_caches` (`:54`) and
  `audit_profile_chart_readiness` (`:64`), plus four test modules.
- leave `startup_warm_caches_task`'s warmer tuple alone (`tasks.py:3266`). It
  keeps dispatching the combined task, which now fans out — so its deliberately
  spaced loop yields 18 DB-heavy tasks rather than 12, with each realm's three
  metrics arriving unspaced. Accepted rather than fixed: the `background` pool is
  `-c 3`, so the burst queues rather than bursting on Postgres, and the per-metric
  `_run_locked_task` locks already coalesce duplicates. Revisit only if the
  post-deploy journal shows the three arriving together and starving the pool.

### I3 — long-cycle exemption in `server/scripts/daily_ops_email.py`

In `_evaluate_service_health`, skip the zero-success `celery_task_failing` rule
for tasks in a new module-level constant, with the reasoning inline:

```python
# Tasks whose unit of work spans MORE THAN ONE dispatch by design, so a 24h
# window legitimately contains zero successes. The zero-success discriminator
# assumes the window bounds the work; for these it does not. Each is covered
# by a staleness rule on its OUTPUT, which is the honest instrument:
# crawl_all_clans_task -> snapshot_stale:crawl-yield:<realm> at 168h.
LONG_CYCLE_TASKS = frozenset({"warships.tasks.crawl_all_clans_task"})
```

Match on the task name as the writer reports it (fully qualified). The
`celery_task_realm_failing` rule is unaffected: it already requires at least one
realm to be succeeding, so it cannot fire on a task that is uniformly mid-pass.

### I4 — tests

- `server/warships/tests/test_correlation_warm_budgets.py` — extend
  `test_both_per_metric_correlation_warmers_route_to_background` from a pair to a
  **triple** (:26-38); add the new task to `test_correlation_tasks_carry_the_new_budgets`
  (:84-94); rewrite the rationale of `test_combined_warmer_exceeds_a_single_metric`
  (:78-82), whose premise — a combined warmer that must outlast one metric because
  it runs three serially — dies with this change even though the assertion still
  passes.
- the dispatcher enqueues all three metric tasks; it returns `skipped` when the
  lock is held; it does **not** delete the lock on the success path; it **does**
  delete the lock when dispatch raises; and it emits no `Finished <name> realm=<realm>`
  line.
- `server/warships/tests/test_daily_ops_email.py` — a `crawl_all_clans_task` row
  with failures and zero successes produces **no** condition; the same row for a
  non-exempt task still does; `celery_task_realm_failing` still fires for an
  exempt task when one realm succeeds and another does not.

## Implementation status (2026-08-28)

**Merged to main and deployed as v5.6.4 on 2026-08-29 04:44-04:47 UTC.** Prod had
been on 5.6.2, so this release also carried the undeployed 5.6.3 docs bump.
Backend release `20260829004420`, client release `20260829004630`.

| item | file | state |
|---|---|---|
| I1 `warm_player_wr_survival_correlation_task` | `server/warships/tasks.py` | done |
| I1 route to `background` | `server/battlestats/settings.py` | done |
| I2 dispatcher | `server/warships/tasks.py` | done |
| I3 `LONG_CYCLE_TASKS` | `server/scripts/daily_ops_email.py` | done |
| I4 tests | `test_correlation_warm_budgets.py`, `test_daily_ops_email.py` | done |
| F3 | — | no change, by decision |

**One defect surfaced during implementation, not present in the plan.** The lock
value is `self.request.id`, which is `None` whenever the task body runs outside a
Celery request, while `queue_warm_player_correlations` gates on that value being
**truthy**. A stored `None` is therefore a lock that exists and gates nothing.
Pre-existing, and harmless in production where `request.id` is always set, but it
made the "lock outlives the dispatch" test fail for the wrong reason. Hardened to
`self.request.id or "in-flight"`.

## Validation

1. `cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/ --nomigrations --tb=short`
   — **PASSED 2026-08-28: 1293 passed, 2 skipped, 6 subtests passed.**
   `server/scripts/check_env_drift.sh`: no actionable drift (checks 1 and 3 clean).
2. `/release-gate` — **run as its two halves, not through Docker.** The
   `run_test_suite.sh` path needs `DB_PASSWORD`, which is canonical in Pass and
   absent from every on-disk env file, so `docker compose` cannot interpolate it
   in a tool shell. Backend covered by step 1; frontend run natively:
   `cd client && npm test` — **727 passed, 84 suites**. No client file changed in
   this tranche, so the frontend half proves only that nothing regressed.
3. **DONE 2026-08-29.** VERSION 5.6.3 → 5.6.4, tagged `v5.6.4`, both tiers
   deployed. Footer and `current/VERSION` both serve 5.6.4;
   `warm_player_wr_survival_correlation_task` is registered on the background
   worker; `LONG_CYCLE_TASKS` is present in the deployed script.
4. **Pending — the EU Beat slot (`player-correlation-warmer-eu`) had not fired
   since the deploy.** Confirm EU completes. The Beat slot is `player-correlation-warmer-eu`; watch
   the per-metric tasks, not the dispatcher:
   ```bash
   ssh root@battlestats.online 'journalctl -u battlestats-celery-background \
     --since "6 hours ago" --no-pager | grep -E "correlation_task.*(realm=eu|succeeded|SoftTime)"'
   ```
   Success = three `succeeded` lines for `realm=eu`, none over 780s.
5. **Pending, and cannot be run today.** The service-health snapshot is written
   at 11:00 UTC, so the post-deploy dry run still reads the 2026-08-28 file and
   still reports the *old* combined task dark on eu and asia. That is the skill's
   own rule: the dry run reproduces a morning's verdict, it does not observe
   recovery. Confirm the digest still sees them per realm. The service-health snapshot is
   written at 11:00 UTC, so this is a **next-day** check:
   ```bash
   ssh root@battlestats.online 'cd /opt/battlestats-server/current/server && \
     /usr/bin/python3 scripts/daily_ops_email.py --dry-run --no-llm'
   ```
   Expect the three metric task names present with per-realm successes, and no
   `celery_task_failing:warships.tasks.crawl_all_clans_task`.
6. **Pending.** Confirm the crawl is genuinely healthy, independent of the exemption: a
   completion for eu by ~08-29 and a fresh crawl-yield snapshot.
   ```bash
   ssh root@battlestats.online 'journalctl -u battlestats-celery-crawls \
     --since "3 days ago" --no-pager | grep "Finished crawl_all_clans_task"'
   ```

**Verified at deploy time:** `celery_task_failing:warships.tasks.crawl_all_clans_task`
is gone from the dry run — the exemption works against the same snapshot that
produced it yesterday. One unrelated condition appeared and cleared during the
window: `snapshot_stale:observation-floor` at 24.3h, because the 04:30 cron run
was still executing; it wrote `2026-08-29_0430Z.json` at 04:48, an 18-minute run.
Not caused by the deploy, and it will read ~7h old at the 11:30 digest.

## Follow-ups

- **The exemption is a silence; watch that it stays honest.** If
  `snapshot_stale:crawl-yield:{r}` never fires and passes silently stop
  completing, the 168h threshold is the thing to re-derive, not the exemption to
  remove.
- **EU correlation duration is still unmeasured.** After the fan-out lands, the
  three per-metric durations for EU are the first honest measurement of what was
  censored at 900s. Record them; they are the input to any future budget work.
- **The per-realm alert surface tripled: watch it for a week.** One task x 3
  realms became three tasks x 3 realms, and `celery_task_realm_failing` fires on a
  realm merely *absent* from the success rows, not only one that failed. Each
  metric task's guaranteed dispatch is one Beat fire per realm per 24h, so a
  per-metric `_run_locked_task` collision — a `startup_warm_caches_task` dispatch
  landing within the 900s lock TTL of the Beat one — makes the Beat run skip, and
  a skip logs no `Finished` line. Usually the earlier run's own line covers the
  same window, which is why this is a watch item and not a defect. Validation
  step 5 checks it once; check it again across the first week before trusting the
  quiet.

- **`gunicorn_error_paths` invites misattribution.** Reporting the timeout
  timestamps alongside the paths would let a reader see a cluster without
  reaching for the journal. Not done here; scoped to the digest writer.
