# Runbook: Health-Sweep Findings 2026-08-26 — Sequenced Remediation

_Created: 2026-08-26_
_Lifecycle: dated-active · Owner: platform_
_Context: a full production sweep on 2026-08-26 across every running service (gunicorn, Next client, five Celery queues, Beat, Flower, nginx, Redis, RabbitMQ, Umami, oturu), the managed Postgres, and every systemd timer. The platform is healthy; four defects sit underneath it, one of which was fixed during the sweep._
_QA: every figure below was measured live on battlestats.online and its managed Postgres between 01:10 and 01:45 UTC on 2026-08-26 with read-only commands, reproduced inline. Code claims carry file:line against `648f221`._

## QA Notes

_Reviewed 2026-08-26 (UTC; the local clock reads 08-25 EDT) against `/home/august/code/battlestats/.claude/worktrees/sweep-remediation-2026-08-26`. 21 assertions checked, 5 corrected._

### Resolved
- **F5: "Deploy needed: client" / "add `SuccessExitStatus=143` to the client unit definition"** -> actual: the unit is written **only** by `cat > /etc/systemd/system/battlestats-client.service` in `client/deploy/bootstrap_droplet.sh:73`; the routine deploy path only runs `systemctl restart battlestats-client` (`client/deploy/deploy_to_droplet.sh:97`) and never rewrites the unit nor runs `daemon-reload` -> F5 rewritten: editing bootstrap alone changes nothing on an already-bootstrapped droplet. The TL;DR row now reads "ops (droplet-side)" and the fix names both halves.
- **F4: "count `raised unexpected` per unit over the last 24 h via `journalctl -u <unit> -g`"** -> actual: the digest runs as `User=${APP_USER}` (`server/deploy/deploy_to_droplet.sh:1362`), and on the droplet `id battlestats` is `groups=988(battlestats)` only — not `systemd-journal`, not `adm`. `sudo -u battlestats journalctl -u battlestats-celery-background` returns **"No journal files were opened due to insufficient permissions."** -> **the remediation as written could not run.** F4 rewritten to follow the convention every existing gatherer already uses: a root-owned snapshot writer beside `snapshot_observation_floor.sh` and `snapshot_crawl_productivity.sh` in `/opt/battlestats-server/shared/bin/`, emitting JSON into a new `benchmarks/` family, which the digest then reads like the other three (`DEFAULT_BENCH_DIR`, `server/scripts/daily_ops_email.py:68`).
- **F4: the remediation did not state the language constraint** -> actual: `ExecStart` is deliberately `/usr/bin/python3`, not the venv, with the comment "daily_ops_email.py is stdlib-only by design and running it this way keeps that property honest" (`server/deploy/deploy_to_droplet.sh:1367`); the only non-stdlib import is `warships.opsmail` (`server/scripts/daily_ops_email.py:65`) -> constraint added to F4: no Django and no third-party imports, in either the writer or the gatherer.
- **F2: "`survived_battles` becomes a filtered `Count`"** -> actual: `BattleEvent.survived` is `models.BooleanField(null=True, blank=True)` (`server/warships/models.py:682`) and the current code tests truthiness (`if event.survived:`, `server/warships/incremental_battles.py:1518`), so NULL and False both count as not-survived -> F2 now names the exact filter, `Count("id", filter=Q(survived=True))`. `Q(survived__isnull=False)` would silently count losses as survivals.
- **F2: the phase-7 guard test was referred to only as "an existing test"** -> actual: `test_rebuild_carries_phase7_combat_columns` (`server/warships/tests/test_incremental_battles.py:1633`), whose own docstring reads "The sweeper must carry the 14 Phase-7 widening columns" -> named in F2, and it independently corroborates the count of 14.
- **F2 ambiguity (picked, not escalated): what the DB-side group-by does with `ship_name`.** The Python version keeps the first non-empty name in `detected_at` order (`incremental_battles.py:1520`). Resolved as `Max("ship_name")`: for a given `ship_id` the value is effectively constant, and `''` sorts below any real name, so `Max` yields a non-empty name whenever one exists. Recorded in F2 so it is not re-litigated mid-implementation.
- **F2 ambiguity (picked): `first_event_at` / `last_event_at` under the rewrite** -> `Min("detected_at")` / `Max("detected_at")`; the Python version sets both from the ordered scan, so these are exact equivalents. Recorded in F2.

### Unverified
- Every production measurement in this runbook — the five timeout timestamps and their `q` values, the `EXPLAIN` costs, the 106 ms timing, the BattleEvent and rollup row counts, the coverage cross-check, the Postgres/Redis/RabbitMQ figures, the observation-floor table, the timer exit statuses, the oturu `integrity_check`, and the swap reading. These are runtime state measured live during the sweep and cannot be re-checked from the tree. They are reproducible with the commands in "How to reproduce this sweep".
- **Whether the sweeper currently completes its first day.** The runbook says this is "not established", which is correct precisely because no per-day logging exists (`tasks.py:2941` is a bare list comprehension). It stays unresolved until F2 adds that logging, which is itself part of the F2 remediation.

### Open Questions
1. ~~**Does F4 warrant a new systemd unit + timer?**~~ **ANSWERED 2026-08-26 by the operator: the root-owned snapshot writer.** The mail path gains no new privilege; the alternative (adding `battlestats` to `systemd-journal`) was rejected on that basis. F4 is unblocked and implemented as described in its Remediation section.

## Purpose

Convert the 2026-08-26 sweep into an ordered, gated work plan. Read this before touching
any of the findings. Work them in the order given, **one production lever at a time**,
with an operator acknowledgement between each; that is the standing rule and this runbook
does not suspend it.

The headline is that the engines we normally worry about are fine. The observation floor
has recovered from its 08-19 dip, Postgres is nowhere near a limit, and Redis has evicted
nothing. What follows is maintenance debt underneath that, plus one genuine user-facing
500 that has now been fixed.

## Window discipline

**journald on this droplet retains ~6 days; the floor on 2026-08-26 was `2026-08-20T01:31Z`.**
Any statement below about "14 days" comes from `django.log`, which is now rotated daily
with 21 generations. Asking journald for 14 days silently answers about a window that does
not exist. Pin the window per source before grepping:

```bash
journalctl -u battlestats-gunicorn -o short-iso | head -1     # per-unit floor
ls /opt/battlestats-server/shared/logs/                       # rotation depth
```

There is **no clock skew**. The droplet reads UTC; a session showing 08-25 is simply EDT.

## TL;DR

| # | Finding | Severity | Status | Deploy needed |
|---|---|---|---|---|
| F1 | `player-suggestions` 500s: an unescaped `_` defeats the trigram index | **HIGH** | fixed `648f221` | backend + client rebuild |
| F2 | `roll_up_player_daily_ship_stats_task` fails every night; sweeper never completes | **MEDIUM** | implemented | backend |
| F3 | Background cache warmers hitting the 540 s soft limit, 93× in 6 days | LOW | open, deferred | backend |
| F4 | Ops digest structurally blind to F1, F2 and F3 | **MEDIUM** | implemented | backend |
| F5 | Client deploy restarts logged as unit failures | COSMETIC | half done | **ops (droplet-side)** |

**Recommended order: F1 (done, needs deploy) → F4 → F2 → F3 → F5.**

F4 is placed second on purpose. It is the reason F1 and F2 went unnoticed, so fixing it
before F2 means the next regression of this class reports itself instead of waiting for a
manual sweep.

F1 and F2 share nothing mechanically, but they share a lesson worth naming once: **both are
a heavy operation on a path with a deadline, where the deadline was set when the data was
smaller.** F1 was a query the planner used to serve from an index; F2 is a nightly job whose
input grew 5–7× past the size its own code comment assumes.

## Baseline: what the sweep found healthy

Recorded so a future reader can tell these findings apart from a platform regression.

- **No failed units.** Load 0.81, uptime 116 days, disk 35% (31 G of 87 G), journal 4.0 G.
- **All eight battlestats timers** report `ExecMainStatus=0` / `Result=success`.
- **Postgres 18.4** (managed, 2 vCPU / 4 GB): 34 of 100 connections, 5 active, **0 idle in
  transaction**, no long-running queries of ours, 7 lifetime deadlocks, rollback ratio
  0.07%, database 47 GB.
- **Redis**: 89 MB of 3 GB, **0 evictions**, 97.9% hit rate.
- **RabbitMQ**: every queue drained (floor 1, background 5 in flight). All five Celery
  workers alive in Flower at the expected concurrency. The consumer watchdog restarted
  nothing in six days.
- **`django.log`, 14 days: zero unhandled tracebacks.** The only ERROR shapes in 7 days are
  163 `DisallowedHost` (bots probing the raw IP) and 3 WG-API 407s.
- **nginx**: one error line in three days, an `access forbidden by rule` — the deny rule
  working. Zero edge 5xx, which is expected and proves nothing: the edge is blind to
  backend 500s, which surface there as 499.
- **Logrotate has shipped.** F5 of the 2026-08-06 sweep (615 MB unrotated `django.log`) is
  **CLOSED**: daily rotation, 21 generations.
- **Both mail timers verified from the unit, not the inbox.** Ops digest: `[ok] all clear
  … no conditions tripped; no email`. Traffic digest: `[ok] sent: [battlestats] traffic week
  of 2026-08-17: 325 visitors, 622 visits, 669 views`. The weekly conversion is live; next
  fire Mon 2026-08-31 10:30 UTC.
- **Observation floor: the 2026-08-19 NA decay has resolved.** It was one bad day, not a
  regression, and the prior alert can be closed.

  | NA cov/7d | 08-17 | 08-18 | **08-19** | 08-20 | 08-21 | 08-22 | 08-23 | 08-24 | 08-25 |
  |---|---|---|---|---|---|---|---|---|---|
  | | 0.329 | 0.352 | **0.206** | 0.273 | 0.316 | 0.261 | 0.344 | 0.348 | 0.307 |

  Totals on 08-25: `active_7d` 227,119, `distinct_productive` 69,379, cov/7d **0.3055**
  against a ceiling (`active_1d / active_7d`) of 0.4626 = **66% of achievable**.
  `never_observed` 397, inside its 42–608 band. Per `/observation` verdict discipline this
  is within noise.

## F1 — `player-suggestions` 500s from an unescaped LIKE wildcard

**Status: FIXED, committed, NOT DEPLOYED.** Commit `648f221`.

### Evidence

Five `WORKER TIMEOUT` → SIGABRT → 500-with-empty-body events in the journal window:

```
2026-08-20T03:49:54  q=ur_
2026-08-22T05:26:41  q=gp_, q=gp_1     (two workers at once)
2026-08-24T02:25:58  q=ot_pq, q=ur_vi  (two workers at once)
```

**Five of five contain an underscore.** The traceback bottoms out in
`player_name_suggestions` → `django/db/backends/utils.py execute` →
`psycopg/connection.py wait` → `waiting.pyx wait_c` → `gunicorn/workers/base.py handle_abort`:
blocked in the driver, killed by the arbiter.

### Root cause

The view interpolated the raw `q` into `name ILIKE '%q%'`. An unescaped `_` is a
single-character LIKE wildcard, which does two things:

1. **Wrong answers.** `Ur_` matched `UrX` as readily as `Ur_Vile`.
2. **Index collapse.** pg_trgm extracts trigrams only from literal runs of ≥3 characters
   between wildcards. `%ur_vi%` leaves the runs `ur` and `vi`, neither long enough, so
   **no trigram is extractable and the GIN index cannot be used at all.**

Measured on production, `warships_player` = 1,103,232 rows, `EXPLAIN` only:

| pattern | plan | cost |
|---|---|---|
| `'%vile%'` | Bitmap Index Scan `player_name_trgm_idx` | 343 |
| `'%ur_vi%'` | Index Scan on realm + row filter | **174,354** |
| `'%ur\_vi%' ESCAPE '\'` | Bitmap Index Scan `player_name_trgm_idx` | **86** |

Names in this game very commonly contain underscores, so this fired on ordinary typing.
The autocomplete is debounced per keystroke, and the *intermediate* prefixes are the
dangerous ones: `ur_vile` is safe (the run `vile` yields trigrams) while `ur_vi` is fatal.

### Remediation applied

`_like_escape()` in `views.py` escapes `\`, then `%`, then `_` — backslash first, or it
double-escapes the replacements it just made. An explicit `ESCAPE '\'` was added to **all
six** ILIKE sites: two in `player_name_suggestions`, four in `clan_name_suggestions`, which
carried the identical defect.

**The trap to remember:** an escaped pattern sent to an ILIKE *without* the `ESCAPE`
clause matches a literal backslash and silently returns **zero rows** — for exactly the
names the escaping exists to fix. Plan cost alone will not catch that; only asserting that
`Ur_Vile` still comes back will.

### Validation

- TDD: `test_like_escape_neutralises_like_wildcards` failed (ImportError) before the fix.
- Backend suite **1247 passed / 2 skipped**.
- Two cross-engine contract tests (`*_underscore_is_literal`) pin the SQLite ORM branch and
  the Postgres raw-SQL branch to identical semantics.
- Read-only against production: escaped `Ur_` returns 8 real underscore names including
  `Ur_Vile`; `ur_vi` returns `Ur_Vile`; the previously fatal `ur_` shape completes in
  **106 ms**.
- `runbook-search-toggle.md` reconciled; `check_env_drift.sh` reports no actionable drift.

### Next step

Deploy backend, then **rebuild the client** — mandatory after any version bump, because
`NEXT_PUBLIC_APP_VERSION` is captured at build time.

## F2 — the nightly rollup sweeper never completes

**Status: IMPLEMENTED 2026-08-26, NOT DEPLOYED.**

Both halves shipped. The aggregation moved into Postgres
(`rebuild_daily_ship_stats_for_date`), and the task became truncation-safe with
per-day logging (`roll_up_player_daily_ship_stats_task`).

**Measured on production, read-only, 2026-08-26** — the new group-by over a full real day
(2026-08-25: 230,597 events collapsing to 211,811 groups) under `EXPLAIN (ANALYZE, BUFFERS)`:

```
HashAggregate (actual rows=211811 loops=1)
  Group Key: player_id, ship_id, mode, season_id
  ->  Bitmap Heap Scan on warships_battleevent (actual rows=230597)
        ->  Bitmap Index Scan on battle_event_detected_brin
Execution Time: 2342.690 ms
```

**2.34 s for the day the old code could not finish inside 540 s.** The aggregate spills to
disk (41 batches, ~40 MB temp) and is still that fast; there is no case for raising the
budget. Rows are streamed out in `_ROLLUP_CHUNK_SIZE` batches so a busy day never
materialises ~230K model instances at once.

Existing rollup coverage passes unchanged — 184 tests across `test_incremental_battles.py`
and `test_ship_list_rollup_source.py`, including `test_rebuild_carries_phase7_combat_columns`
and the aggregate-sum equivalence tests. Four new tests pin the truncation contract. Full
backend suite: 1262 passed / 2 skipped.

**Verified on Postgres, not only SQLite.** The default harness runs SQLite, which would not
have exercised the part of this change most likely to be driver-specific: a server-side
cursor streaming the group-by while `bulk_create` writes to another table on the same
connection, inside one transaction. Production runs psycopg3, and this project has been
bitten before by a psycopg2/psycopg3 divergence that CI could not see. The whole suite was
therefore re-run against a throwaway **PostgreSQL 18** container — **1262 passed / 2
skipped**, the 34 rollup-specific tests among them. Re-run it that way if you touch this
query:

```bash
docker run -d --rm --name bs-pg-verify -e POSTGRES_PASSWORD=verify \
    -e POSTGRES_USER=verify -e POSTGRES_DB=verify -p 55432:5432 postgres:18
cd server && DJANGO_SECRET_KEY=k DB_ENGINE=postgresql DB_NAME=verify DB_USER=verify \
    DB_PASSWORD=verify DB_HOST=127.0.0.1 DB_PORT=55432 \
    python -m pytest warships/tests/ -q
docker stop bs-pg-verify
```

### Evidence

`roll_up_player_daily_ship_stats_task` failed on **every night in the journal window**:

| night | outcome |
|---|---|
| 08-21 | `SoftTimeLimitExceeded` |
| 08-22 | `SoftTimeLimitExceeded` |
| 08-23 | `ProgrammingError` |
| 08-24 | `ProgrammingError` |
| 08-25 | `SoftTimeLimitExceeded` |

That is 5 of 5, but 08-21 is the journal floor, not the start date: it has failed **at
least** five consecutive nights and possibly far longer. The 08-25 trace is exact — task
received 04:30:00, `Soft time limit (540s) exceeded` at 04:39:00, dying inside
`daily_results = [rebuild_daily_ship_stats_for_date(d) for d in dates]`
(`server/warships/tasks.py:2941`). There is **no `Finished roll_up…` line and no per-day
completion log**, so it is not established that it finishes even the first of its three days.

### Root cause: the input outgrew the code's own stated assumption

`rebuild_daily_ship_stats_for_date` (`server/warships/incremental_battles.py:1445`) loads a
whole calendar day of `BattleEvent` into Python, aggregates in a dict, and `bulk_create`s
the result, all inside one `transaction.atomic()`. Its own comment says:

> NOTE: this loads one calendar day of BattleEvent rows into Python (~40K today — safe).
> … TODO(2026-Q3): if BattleEvent grows past ~200K/day … rewrite this as a DB-side
> `values().annotate()` group-by.

Measured on production 2026-08-26:

| day | BattleEvent rows | rollup rows written |
|---|---|---|
| 08-25 | 230,597 | 211,811 |
| 08-24 | 219,548 | 205,768 |
| 08-23 | 274,426 | 253,011 |
| 08-22 | 292,567 | 264,708 |
| 08-21 | 218,436 | 201,244 |

**The trigger the TODO named has been crossed.** Input is 5–7× the comment's assumption and
sits above the 200K/day line every single day. A default window of
`BATTLE_HISTORY_ROLLUP_LOOKBACK_DAYS=3` therefore asks for roughly **three-quarters of a
million model instances materialized in Python plus three ~230K-row `bulk_create` calls
inside 540 s** (`TASK_OPTS`, `server/warships/tasks.py:23`).

The `ProgrammingError` on 08-23 and 08-24 is a second, separate defect. The task dies in
its own error path with

```
django.db.utils.ProgrammingError: can't change 'autocommit' now: connection in transaction status ACTIVE
```

The soft-limit exception is raised *inside* the atomic block, and unwinding tries to
restore autocommit on a connection still mid-transaction. This is the same class as the
2026-08-15 recapture truncation-handler crash: **the handler that is supposed to record a
truncation is itself the thing that breaks.**

### Data impact: no evidence of loss

`PlayerDailyShipStats` is written continuously by the capture path; the nightly task is a
*corrective* delete-and-rebuild sweeper. Cross-check of distinct players in
`warships_battleevent` (by `detected_at::date`) against `warships_playerdailyshipstats` (by
`date`):

| day | event players | rollup players | missing |
|---|---|---|---|
| 08-25 | 71,349 | 71,349 | **0** |
| 08-24 | 70,157 | 70,157 | **0** |
| 08-23 | 78,881 | 78,881 | **0** |
| 08-22 | 77,489 | 77,489 | **0** |
| 08-21 | 64,859 | 64,859 | **0** |
| 08-20 | 70,760 | 70,760 | **0** |

(08-19 shows −355, which is the `now() - 7 days` versus `current_date - 7` boundary, not a
discrepancy.)

**State this precisely: that proves player-level *coverage*, not per-row *value*
correctness** — and per-row correctness is exactly what a delete-and-rebuild sweeper exists
to restore. So what is currently lost is not data, it is **self-healing**: a real hole would
no longer be repaired, and nothing would say so.

A mid-run death is safe: the delete and the insert share one transaction, so a truncated
day rolls back whole rather than leaving a gap.

### Remediation

Two parts. Do them together; the first alone leaves a job that still cannot finish.

1. **Aggregate DB-side** — implement the TODO. Replace the Python dict accumulation with a
   `values('player_id','ship_id','mode','season_id').annotate(Sum(...), Count(...))`
   group-by, so a day's work stays in Postgres instead of crossing into Python row by row.
   `survived_battles` becomes `Count("id", filter=Q(survived=True))` — **exactly that
   filter**. `BattleEvent.survived` is nullable (`models.py:682`) and the Python version
   tests truthiness (`incremental_battles.py:1518`), so NULL and False must both count as
   not-survived; `Q(survived__isnull=False)` would silently count losses as survivals.
   `first_event_at` / `last_event_at` become `Min("detected_at")` / `Max("detected_at")`,
   which are exact equivalents of the ordered scan. `ship_name` becomes `Max("ship_name")`:
   for one `ship_id` the value is effectively constant, and `''` sorts below any real name,
   so `Max` yields a non-empty name whenever one exists, matching the current
   first-non-empty rule (`incremental_battles.py:1520`). Every one of the 14
   `_PHASE7_ROLLUP_COLUMNS` must be carried, or the nightly rebuild silently zeroes the ship
   combat profile's hit-ratio source — that regression has happened before and is pinned by
   `test_rebuild_carries_phase7_combat_columns`
   (`server/warships/tests/test_incremental_battles.py:1633`).
2. **Make the task truncation-safe** — log per day, catch `SoftTimeLimitExceeded` around the
   loop, and return a partial status naming the days completed instead of propagating. The
   handler must not touch the connection's autocommit state while a transaction is active.

**Do not raise the 540 s budget.** Project history is explicit that budget raises here are
the last lever, not the first, and a raise would only move the cliff while the input keeps
growing.

### Validation to require

- Existing rollup tests (`test_incremental_battles.py`, `test_ship_list_rollup_source.py`)
  pass unchanged — they are the behavioural guard, including the phase-7 regression test.
- A test proving a truncated run reports partial status rather than raising.
- After deploy, the next 04:30 run logs a `Finished roll_up…` line.

## F3 — background warmers hitting the soft limit

**Status: OPEN, lowest priority.**

93 `raised unexpected` events on the `background` queue in six days:

| count | task | exception |
|---|---|---|
| 58 | `warm_player_ranked_wr_battles_correlation_task` | `SoftTimeLimitExceeded` |
| 10 | `warm_player_correlations_task` | `SoftTimeLimitExceeded` |
| 8 | `warm_hot_entity_caches_task` | `SoftTimeLimitExceeded` |
| 5 | `warm_ship_pop_avg_damage_task` | `SoftTimeLimitExceeded` |
| 4 | `roll_up_player_daily_ship_stats_task` | (F2) |
| 2 each | `warm_realm_ships_pct_task`, `startup_warm_caches_task`, `refresh_efficiency_rank_snapshot_task` | `SoftTimeLimitExceeded` |

Flower's rolling sample: 496 SUCCESS / 4 FAILURE (0.8%). **This is not an outage.** A failed
warmer means the cold path serves the durable `:published` copy, which is the designed
behaviour. It is listed because it is the same shape as F2 — a heavy job against a fixed
deadline — and because it is noise that will mask the next real failure on that queue.

Take it only after F2, and prefer narrowing what each warmer does over widening its budget.

## F4 — the ops digest cannot see any of the above

**Status: IMPLEMENTED 2026-08-26, NOT DEPLOYED.** Highest leverage item in this runbook.

Shipped as `server/scripts/snapshot_service_health.sh` (root-owned writer, installed to
`shared/bin` and timed at 11:00 UTC by `deploy_to_droplet.sh`), plus `gather_service_health`
and `_evaluate_service_health` in `daily_ops_email.py`. 12 new tests; the ops-email suite is
69 passing.

**Calibration, and why the first cut was wrong.** The obvious rule — alert when a task
raised at all — was measured against a real 24 h window on the droplet and tripped **8
conditions**, 7 of them cache warmers that fail a fraction of their runs and fall back to
the durable `:published` copy exactly as designed. A digest that fires every morning stops
being read, and then the morning that matters looks like all the others. The snapshot
therefore carries **successes as well as failures per task**, and the verdict trips only
when a task **never succeeded** in the window. Re-measured on the same real data that
yields **2 conditions**: `roll_up_player_daily_ship_stats_task` (F2, 1 failure / 0
successes) and `startup_warm_caches_task`. The seven warmers, which do complete runs, drop
out. A missing `succeeded` key (an older writer) still alerts: unknown must not read as
healthy.

Verified end-to-end against production, read-only: the writer ran on the droplet into a
temp directory, and its real output fed through the new evaluator names
`roll_up_player_daily_ship_stats_task` — the precise failure the digest could not see.

On 2026-08-25 the digest reported `all clear … no conditions tripped; no email` while F1 was
returning 500s and F2 had failed five nights running.

That is not a threshold set too loosely. `server/scripts/daily_ops_email.py` gathers exactly
three families — `gather_observation`, `gather_crawl_yield`, `gather_recapture` — and each
reads **benchmark snapshot JSON from `/opt/battlestats-server/shared/benchmarks/`**. The
evaluator never reads systemd, Celery, gunicorn, nginx, or Postgres. So the digest is
**structurally incapable** of noticing:

- a Celery task failing every night,
- a gunicorn `WORKER TIMEOUT` or any 5xx,
- a cache warmer timing out,
- a service flapping.

**Therefore: silence from the ops digest is not evidence that those are healthy.** That
inference is what let both defects run unobserved, and it is worth writing down even if the
code fix is deferred.

### Remediation

**The digest cannot read the journal itself, and must not be given the chance.** It runs as
`User=${APP_USER}` (`server/deploy/deploy_to_droplet.sh:1362`), and that account belongs to
no group but its own; `sudo -u battlestats journalctl -u battlestats-celery-background`
answers `No journal files were opened due to insufficient permissions`. Any design that has
the mail script shell out to `journalctl` is dead on arrival.

Follow the shape every existing gatherer already uses — **a root-owned writer produces a
snapshot; the digest only ever reads JSON**:

1. **A snapshot writer**, root-owned, beside `snapshot_observation_floor.sh` and
   `snapshot_crawl_productivity.sh` in `/opt/battlestats-server/shared/bin/`, on its own
   timer, writing `benchmarks/service-health/YYYY-MM-DD_HHMMZ.json` with:
   - **Celery task failures** — `raised unexpected` counts per unit over 24 h, as task name
     plus count. Keep it low-cardinality; do not ship log lines into the snapshot.
   - **Backend 5xx** — `WORKER TIMEOUT` / `Error handling request` counts on
     `battlestats-gunicorn` over 24 h, with the offending paths.
2. **A fourth gatherer and evaluator** in `server/scripts/daily_ops_email.py`, matching
   `gather_observation` / `gather_crawl_yield` / `gather_recapture` and their `_evaluate_*`
   counterparts. A missing or stale snapshot is itself an alert condition, as it already is
   for the other three.

**Language constraint:** the unit runs `/usr/bin/python3` deliberately, not the venv,
because the script is stdlib-only by design (`deploy_to_droplet.sh:1367`; the sole
non-stdlib import is `warships.opsmail`, `daily_ops_email.py:65`). Neither the writer nor
the gatherer may import Django or any third-party package.

The cheaper alternative — adding `battlestats` to `systemd-journal` and gathering in-process
— is one line, but it widens the mail path's privilege. See Open Question 1.

Keep the digest exception-only. The point is that a nightly failure trips a condition; it
is not to start mailing a daily status report.

## F5 — client deploy restarts are logged as failures

**Status: HALF IMPLEMENTED 2026-08-26.** `SuccessExitStatus=143` is in
`client/deploy/bootstrap_droplet.sh`, so a future bootstrap is correct. **The live droplet
is unchanged** and will keep mislabelling deploys until step 2 below is run by hand; that is
a production mutation and is left for an explicit acknowledgement.

`battlestats-client.service: Main process exited, code=exited, status=143` followed by
`Failed with result 'exit-code'`, five times in six days. **143 = 128 + 15 = SIGTERM.**
Every occurrence matches a client release directory to the minute:

| unit "failure" | release directory |
|---|---|
| 08-20 05:15:55 | `20260820011437` |
| 08-20 05:24:22 | `20260820012319` |
| 08-21 02:56:30 | `20260820225501` |
| 08-24 22:14:45 | `20260824181344` |
| 08-25 16:31:58 | `20260825123103` |

These are the restart step of the client deploy. The unit has no `SuccessExitStatus=143`,
so systemd labels an ordinary deploy restart a failure. No OOM was involved: the kernel log
and `systemd-oomd` are both empty for the window.

**Fix — note the trap before doing this.** The unit is written *only* by
`client/deploy/bootstrap_droplet.sh:73`. The routine deploy runs
`systemctl restart battlestats-client` (`client/deploy/deploy_to_droplet.sh:97`) and
**never rewrites the unit file nor runs `daemon-reload`**. Editing the bootstrap script
alone therefore changes nothing on a droplet that is already bootstrapped. Both halves are
needed:

1. Add `SuccessExitStatus=143` under `[Service]` in `client/deploy/bootstrap_droplet.sh:73`,
   so a future rebuild is correct.
2. Apply it to the live droplet once, by hand: edit
   `/etc/systemd/system/battlestats-client.service`, then `systemctl daemon-reload`. No
   restart is needed; the change only affects how the *next* exit is classified.

The value of doing so is not tidiness; it is that this false signal costs a real
investigation in every sweep until it is removed.

## oturu (shared droplet)

One `sqlite3.DatabaseError: database disk image is malformed` at 2026-08-24T15:01:39, in
`/opt/oturu/app/db.py:241` on `PRAGMA journal_mode=WAL`. The service restarted itself and
recovered. **A live read-only `PRAGMA integrity_check` on 2026-08-26 returns `ok`** (WAL, 20
tables), and there has been no recurrence. No action; re-check if it happens again, since a
second occurrence would point at the filesystem rather than a transient.

## Minor observations

- **Swap: 1,051 MB of 2,047 MB in use** (RAM 4.1 G used, 246 MB free, 3.9 G cache on an 8 GB
  box). No OOM, no `systemd-oomd` activity. Watch; do not act on it alone.
- Redis `mem_fragmentation_ratio` 0.68 (below 1 = part of the dataset paged out), consistent
  with the swap note and harmless at 89 MB resident.
- One Postgres backend has been active 13 days showing `<insufficient privilege>`. That is
  DigitalOcean's own management process, not ours, and not actionable.

## Execution order

1. **F1** — deploy the committed fix (backend, then the mandatory client rebuild). One lever; ack.
2. **F4** — extend the ops digest so the next failure of this class reports itself.
   **Blocked on Open Question 1** (a new snapshot unit versus a journal-group grant).
3. **F2** — DB-side aggregation plus a truncation-safe handler.
4. **F3** — warmer budgets, only after F2 is proven.
5. **F5** — `SuccessExitStatus=143`, folded into the next client deploy.

## How to reproduce this sweep

```bash
# window floor first, always
journalctl -o short-iso | head -1

# backend errors: the edge cannot see these
journalctl -u battlestats-gunicorn -g "WORKER TIMEOUT|Error handling request" --since "<floor>"

# exception-type split BEFORE attributing any 5xx count
cd /opt/battlestats-server/shared/logs
{ cat django.log django.log.1; for f in django.log.{2..14}.gz; do zcat "$f"; done; } \
  | grep -aE "^[A-Za-z_][A-Za-z_.]*(Error|Exception): " \
  | sed -E "s/^([A-Za-z_][A-Za-z_.]*(Error|Exception)):.*/\1/" | sort | uniq -c | sort -rn

# Celery outcomes live in journald, never in django.log
journalctl -u battlestats-celery-background -g "raised unexpected" --since "<floor>"

# Flower needs its own env file and the /flower url prefix
set -a; . /etc/battlestats-flower.env; set +a
curl -s -u "$FLOWER_BASIC_AUTH" "http://localhost:5555/flower/api/workers?refresh=1"

# timers: --failed being empty does not mean they fired
systemctl list-timers --all
systemctl show <unit>.service -p ExecMainStatus -p Result
```

Two greps that will hang past a 120 s timeout on this journal: any multi-unit pattern sweep
over the full window, and anything piped rather than filtered server-side with `-g`.

## Implementation log

| date | what | commit | deployed |
|---|---|---|---|
| 2026-08-26 | F1 escaping fix | `648f221` | no |
| 2026-08-26 | F4 service-health snapshot + digest gatherer | `b8264bc` | no |
| 2026-08-26 | F2 DB-side rollup + truncation-safe task | this branch | no |
| 2026-08-26 | F5 `SuccessExitStatus=143` in bootstrap (droplet untouched) | this branch | no |

Branch `worktree-sweep-remediation-2026-08-26`, built on `648f221`. Backend suite
**1262 passed / 2 skipped**. **Nothing is deployed**: `VERSION` is unbumped, no env changed,
no droplet mutated. The only production contact throughout was read-only — `EXPLAIN`,
`SELECT`, `journalctl`, and one run of the new snapshot writer into `/tmp`.

## Follow-ups

- [ ] F1 deployed and the 500s confirmed gone in the next window.
- [ ] F4 deployed; confirm `battlestats-service-health.timer` is enabled and that the
      11:00 UTC snapshot lands before the 11:30 digest reads it.
- [ ] F2 deployed; verify the next 04:30 run logs `Finished roll_up…` and per-day
      `rebuilt <date>: rows_written=…` lines. If it still truncates, the status will now
      say `partial` and name the day rather than raising.
- [ ] F5 step 2 applied to the live droplet (edit the unit, `systemctl daemon-reload`).
- [ ] F3 reassessed after F2. It may partly resolve on its own: the warmers and the rollup
      share the `background` worker, and the rollup currently burns 9 minutes of it nightly
      for nothing.
- [ ] Re-check oturu's SQLite integrity if a second corruption appears.
- [ ] Consider whether the 2026-08-06 remediation runbook can now be archived: its F5
      (logrotate) is confirmed closed by this sweep.
