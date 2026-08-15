# Runbook — Recapture soft-limit budget: levers and remediation order (2026-08-13)

_Created: 2026-08-13_
_Context: the 2026-08-13 ops email reported `recapture_partial:asia` (23,100 of 30,000 scanned). Investigation found two independent causes — asia's pass has been consuming 72–95% of its 900s soft-limit budget every day for a week, and the 2026-08-12 top-ships orchestrator fan-out newly saturated the `background` worker across the recapture window._
_Status: **NO LEVER PULLED.** L2b shipped to production in **v5.3.8** (2026-08-13) and is **inert by design** — `RECAPTURE_LAPSED_LIMIT_*` is unset in prod, so the sweep behaves exactly as before. L1/L3/L4 remain proposals. **Step 0 ran on 2026-08-14 and its gate is met** — asia went partial a second time (912s, `scanned` 28,800 of 30,000), so Step 1 is authorized and unapplied. **One precondition since 2026-08-15:** v5.3.9 shipped after that observation and trimmed one contributor to the same contention window, so read the 2026-08-15 run before pulling L1 or its effect cannot be attributed. See Execution log._
_QA: reviewed 2026-08-13 — see QA Notes._

## QA Notes

_Reviewed 2026-08-13 against `/home/august/code/battlestats/.claude/worktrees/recapture-soft-limit-runbook` (linked worktree, branch `worktree-recapture-soft-limit-runbook`). 31 assertions checked, 7 corrected._

### Resolved

- **"the fan-out spreads across hours because of visitor-triggered lazy re-arming of `warm_ships_bucket_task`"** -> actual: `warm_ships_bucket_task` has exactly **one** dispatcher in the codebase, `warm_realm_top_ships_task` (`server/warships/tasks.py:1567`). There is no lazy path for it at all. The re-armable unit is the *orchestrator*: `queue_realm_top_ships_warm` is called from two request paths (`server/warships/data.py:6577`, `:6911`) and from the snapshot chain (`server/warships/tasks.py:1408`), debounced 15 min by `REALM_TOP_SHIPS_WARM_DISPATCH_TIMEOUT` (`server/warships/tasks.py:118`) -> F5 rewritten with the correct mechanism. Its conclusion is unchanged and in fact strengthened: a visitor-re-armable orchestrator can fan out at any hour, so L3 cannot schedule around it.
- **"a single fan-out landing across hours 09/10/11"** -> actual: `SHIPS_BUCKET_WARM_SPACING_SECONDS = 20` (`server/warships/tasks.py:129-130`), so 18 staggered dispatches span only ~6 min of countdown -> the multi-hour spread is the `-c 3` **drain**, not the stagger. Stated explicitly in F5; it also means one fan-out is correctly counted once, not three times.
- **"fanning out one `warm_ships_bucket_task` per tier×type bucket"** -> actual: each orchestrator run dispatches 2 `warm_top_ships_treemap_task` + 15 `warm_ships_bucket_task` (3 tiers from prod `SHIP_BADGE_TIERS=8,9,10` × 5 types, via `_rotated_ship_buckets`) + 1 `warm_ships_by_pct_task` for the default bucket + a chained per-realm `warm_realm_ships_pct_task` that walks the whole grid serially (`server/warships/tasks.py:1553-1592`) -> F3 corrected. The load is larger than the runbook claimed, and the chained pct warmer is plausibly the heavier half.
- **"removing `RECAPTURE_LAPSED_DELAY` may shift the wait into a blocking `acquire()`; 60s is an upper bound"** -> actual: the limiter is `WG_RATE_LIMIT_ENABLED=1` at `WG_RATE_LIMIT_PER_SEC=9` / `BURST=18` (live `/etc/battlestats-server.env`), while the recapture pass issues 300 calls over 650–900s ≈ **0.4 req/s** -> the limiter cannot absorb the saving on recapture's own traffic. L1's caveat downgraded: it bites only if *system-wide* WG load is near the 9/s ceiling, which is now the thing to check rather than assume. This materially raises L1's expected value.
- **"`RECAPTURE_LAPSED_DELAY` … reaches the command as `--delay`"** -> actual: the task builds a kwargs dict and calls `call_command('recapture_lapsed_players', **kwargs)` (`server/warships/tasks.py:2319-2333`); `--delay` is the argparse flag, `delay` the kwarg -> phrasing corrected in L1 so a reader does not look for a flag in the Beat config.
- **"L4 invariant: soft < hard, and hard ≤ the per-realm lock TTL"** -> actual: `PLAYER_REFRESH_LOCK_TIMEOUT = 6 * 60 * 60` (`server/warships/tasks.py:85`) and it is what `recapture_lapsed_players_task` passes to `cache.add` (`:2312`) -> 6h against a 960s hard limit is not a constraint at all. L4's invariant rewritten to name the actual binding one: the 20-minute per-realm Beat stripe.
- **`-c 3` and the 18,000 slot-second denominator** -> checked rather than assumed: `deploy_to_droplet.sh:924` templates `-c "${CELERY_BACKGROUND_CONCURRENCY:-3}"` and prod sets `CELERY_BACKGROUND_CONCURRENCY="3"` -> citation added to F3 so the saturation arithmetic is reproducible.

### Unverified

- Every 2026-08-13 production figure — the six task durations, the 35/43/90% saturation percentages, the snapshot field values, and the `EXPLAIN` band-pool estimates — was read live from the droplet during the originating session and cannot be re-derived from a checkout. Sources of record: `/opt/battlestats-server/shared/benchmarks/recapture-lapsed/` and `journalctl -u battlestats-celery-background`.
- That the `partial` field is absent from snapshots written before 2026-08-06 (the basis for scoping F2's baseline to 7 days) is a property of the live benchmark corpus, not the repository.
- Whether system-wide WG call volume approaches `WG_RATE_LIMIT_PER_SEC=9` during the 10:00–11:30 window. This decides whether L1 delivers its full ~45–60s, and no instrumentation in the repo reports it. Step 1's gate measures it empirically instead.
- F4's open question (why EU alone was unaffected) is a runtime observation with no code-side answer available.

### Open Questions

1. ~~**Is EU's rotation slowdown under L2 acceptable?**~~ **ANSWERED 2026-08-13 — neither option; make the limit per-realm.** `RECAPTURE_LAPSED_LIMIT` is a single global env var (`server/warships/tasks.py:2322`), so capping it to help asia (3.7d → 4.7d) simultaneously slowed EU (6.9d → 8.6d), past the "~a week" figure `CLAUDE.md` cites. Resolved by adding `RECAPTURE_LAPSED_LIMIT_{NA,EU,ASIA}` overrides — see **L2b**, which supersedes L2a as the intended implementation and drops the EU tax to zero. Two facts checked while accepting it: the suffix-override-then-global-fallback shape already has precedent in the same file (`_reclassify_statement_timeout`, `server/warships/tasks.py:3135-3143`); and the ops email carries the snapshot's `limit` as a reported field only (`RECAP_FIELDS`, `server/scripts/daily_ops_email.py:241`) with every recapture threshold absolute rather than limit-relative (`recapture_no_data_max: 500`, `recapture_advanced_min: 10`, `:374-376`), so per-realm limits cannot skew a detector. No longer blocks Step 2.

## Purpose

Two things live here. First, why asia's recapture pass crossed its soft time limit on 2026-08-13, and why that was inevitable rather than incidental. Second, the four candidate levers with their real costs, their true tuning surface (env vs. code-and-deploy), and a strict one-at-a-time order for applying them with a measurement gate between each.

Read this when a `recapture_partial:<realm>` condition arrives, before touching `RECAPTURE_LAPSED_DELAY` / `RECAPTURE_LAPSED_LIMIT` / `RECAPTURE_TASK_OPTS`, or when deciding whether a recapture truncation is a recapture problem or a `background`-queue contention problem.

Companions: `runbook-recapture-lapsed-players-2026-06-26.md` (what the sweep is and why),
`runbook-recapture-upstream-failure-guard-2026-08-12.md` (the `aborted` axis — a *different* failure, not this one),
`runbook-top-ships-warm-soft-limit-2026-08-12.md` (the change that supplied the proximate trigger).

## What happened (2026-08-13, all UTC)

| Time | Event |
|---|---|
| 09:05 | NA `warm_realm_top_ships_task` fires and dispatches its fan-out onto the `background` queue |
| 09:30–11:00 | `background` worker pinned at 88–130% of its 3 slots (vs. 35–43% for the same window on Aug 11/12) |
| 10:10 | Beat dispatches recapture NA on schedule; worker has no free slot, message waits in RabbitMQ |
| 10:25:39 | NA recapture finally received and started (+15 min). Completes in 577s, `partial: false` |
| 10:39:38 | EU received (+9 min). Completes in 660s, `partial: false` |
| 11:12:31 | ASIA received (+22 min). Runs at 25 rows/s against its 35–46 baseline |
| 11:27:31 | Soft time limit (900s) exceeded; the command finalizes and reports `{'status': 'partial'}` after 912s |
| 11:35 | Ops email fires `recapture_partial:asia` |

ASIA snapshot: `partial: true`, `scanned: 23100`, `candidates: 30000`, `wg_calls: 231`, `cursor_stamped: 23100`, `chunk_errors: 0`, `aborted: false`, `advanced: 707`, `into7d_clanless: 56`.

## Findings

### F1 — The shortfall is deferred, not lost

Only rows in `checked_ids` receive a `last_idle_check_at` stamp (`server/warships/management/commands/recapture_lapsed_players.py:194`, inside `flush()`), and the candidate ordering is `last_idle_check_at asc nulls_first, -last_battle_date` (`:151`). The 6,900 unscanned asia rows therefore keep their old/NULL cursor and are **first in line on the next run**. A single partial run costs one day of latency on those rows, not their coverage.

This bounds the urgency. `partial` matters because sustained truncation starves the tail of the pool, and because a truncated pass is numerically indistinguishable from a healthy one — not because a day's data was destroyed.

### F2 — Asia has had 5–28% headroom for a week; it was going to cross

Task durations from `journalctl -u battlestats-celery-background`, against a 900s soft limit:

| realm | Aug 08 | Aug 09 | Aug 10 | Aug 11 | Aug 12 | Aug 13 |
|---|---|---|---|---|---|---|
| na | 455 | 451 | 429 | 353 | 446 | 577 |
| eu | 825 | 553 | 510 | 575 | 709 | 660 |
| asia | 859 | 647 | 714 | 656 | 404 \* | **912** |

\* 2026-08-12 was the asia DNS outage (`advanced: 0` across 300 chunks). It is not a baseline; exclude it from any rate calculation.

Asia's non-outage range is 647–859s, i.e. 72–95% of budget. EU touched 825s (92%) on Aug 08. Only NA has real margin. **The structural finding is that the asia pass no longer fits its budget on a normal day**, and any added load tips it.

Caveat on the baseline: the `partial` field only exists on snapshots written after 2026-08-06 (it `KeyError`s on older files), so "asia has never gone partial before" is a 7-day claim, not an all-time one.

### F3 — The proximate trigger is `background`-queue contention, not recapture itself

`warm_realm_top_ships_task` became a dispatcher on 2026-08-12 (`runbook-top-ships-warm-soft-limit-2026-08-12.md`). Each run of it puts on the `background` queue (`server/warships/tasks.py:1553-1592`):

- 2 × `warm_top_ships_treemap_task` (random + ranked)
- 15 × `warm_ships_bucket_task` — one per tier×type bucket, from prod `SHIP_BADGE_TIERS=8,9,10` × 5 types, ordered by `_rotated_ship_buckets` so no bucket is last every day
- 1 × `warm_ships_by_pct_task` for the default landing bucket
- a chained per-realm `warm_realm_ships_pct_task`, which walks the whole tier×type grid serially with a 5s pause between buckets

Observed durations for the bucket tasks alone were 100–500s each. Its NA stripe fires at 09:05 UTC: `realm_hour = (SHIP_BADGE_SNAPSHOT_HOUR + 1 + REALM_CRAWL_CRON_HOURS[realm]) % 24` (`server/warships/signals.py:211-214`) with `SHIP_BADGE_SNAPSHOT_HOUR` defaulting to 2 (`:209`, unset in prod) and `REALM_CRAWL_CRON_HOURS = {'eu': 0, 'na': 6, 'asia': 12}` (`:12`), giving eu@03, na@09, asia@15.

2026-08-13 was the first *full* day of that fan-out. Measured `background` busy time (sum of `succeeded in Ns` over the window, against 3 slots × 100 min = 18,000 slot-seconds; `-c 3` from `CELERY_BACKGROUND_CONCURRENCY="3"` in prod, templated at `server/deploy/deploy_to_droplet.sh:924`):

| window | Aug 11 | Aug 12 | Aug 13 |
|---|---|---|---|
| 09:50–11:30 | 35% | 43% | **90%** |

The worker also runs `--prefetch-multiplier=1` (same line), so it holds at most 3 unacked messages. A saturated worker cannot pull from RabbitMQ, which is exactly why all three recapture tasks logged `received` late while Beat itself fired on time (Beat logged nothing in the window; the schedule is unchanged).

### F4 — Upstream is ruled out

No WG, DNS, timeout, retry, or rate-limit markers on the `background` worker between 09:00 and 11:35. `chunk_errors: 0` on all three realms. Per-realm rates (`scanned` ÷ duration): NA 52 rows/s against a 66–85 baseline, EU 45 against 36–59, ASIA 25 against 35–46. A broad, mildly uneven slowdown is the contention signature; an asia-only upstream fault would not have slowed NA.

**Unexplained:** EU ran 10:39–10:50, inside the most-saturated block of the morning, and came in mid-range. NA and asia both degraded; EU did not. Recorded as an open question, not folded into the contention story.

### F5 — The fan-out is visitor-re-armable, so its cadence cannot be scheduled around

`warm_ships_bucket_task` dispatches on 2026-08-13 clustered at hours 02, 03, 06, 09, 10, 11, 14, 15 — more than the three scheduled stripes (eu@03, na@09, asia@15) account for. Two mechanisms produce that, and neither is what a first reading suggests:

1. **A single fan-out spans hour boundaries by draining, not by staggering.** `SHIPS_BUCKET_WARM_SPACING_SECONDS = 20` (`server/warships/tasks.py:129-130`) spreads ~18 dispatches over only ~6 min of countdown. With `-c 3` and 100–500s per bucket, the *drain* takes 30–50 min, which is why NA's 09:05 fan-out logged `received` at 09, 10 and 11. Those are one fan-out, not three.
2. **The orchestrator is re-armable; the bucket task is not.** `warm_ships_bucket_task` has exactly one dispatcher in the codebase (`server/warships/tasks.py:1567`). What visitors re-arm is `warm_realm_top_ships_task`, via `queue_realm_top_ships_warm` — called from two request paths (`server/warships/data.py:6577`, `:6911`) and from the snapshot chain (`server/warships/tasks.py:1408`), debounced 15 min by `REALM_TOP_SHIPS_WARM_DISPATCH_TIMEOUT` (`:118`). Each such re-arm produces a whole fresh fan-out.

**Consequence: tomorrow's contention is variable, not fixed.** No lever below should be sized on the assumption that Aug 13's load recurs exactly, and L3 in particular cannot rely on a quiet window existing.

## The levers

Four candidates, with the tuning surface stated honestly. Two are env-only; two require a code change and a backend deploy.

### L1 — `RECAPTURE_LAPSED_DELAY` (env-only)

Unset in `/etc/battlestats-server.env`, so the task default applies: `float(os.getenv('RECAPTURE_LAPSED_DELAY', '0.2'))` (`server/warships/tasks.py:2323`). It is passed as a `call_command('recapture_lapsed_players', **kwargs)` kwarg (`:2333`), not a flag in the Beat config, and lands on the command's `--delay` argument. It is applied as `time.sleep(delay)` once per 100-account chunk at the bottom of the scan loop (`server/warships/management/commands/recapture_lapsed_players.py:318-319`; chunk size 100 from `BULK_ACCOUNT_INFO_SIZE`, `:58`/`:127`). A full 300-chunk pass therefore spends **60s in pure sleep**; asia's truncated 231-chunk run spent ~46s.

- **Buys:** up to 60s (~7% of budget) at `0`; ~45s at `0.05`.
- **Costs:** the delay spreads load on the shared 2-vCPU managed Postgres and paces WG. Removing it concentrates both.
- **Set it globally, not per realm.** The helper shape from L2b would work verbatim here — `delay` is a runtime `call_command` kwarg — but there is nothing for a per-realm value to express. Both resources it protects are global (the shared managed PG; the global Redis WG token bucket), and the three passes never overlap: 20-minute Beat stripes against ~6–15 minute passes mean exactly one realm's delay is in effect at any instant. Whatever pacing is safe while asia runs is the same pacing that is safe while NA runs. The one genuinely realm-correlated variable is *time-of-day* contention, since each realm owns a fixed slot — but if pacing ever needs to track how busy the box is, the correct key is the hour, not the realm.
- **Rate-limiter interaction (checked, and weaker than it looks):** WG calls pass the global Redis token-bucket limiter (`server/warships/api/client.py:73-74`, `:150-151`, ahead of every request). Prod runs it at `WG_RATE_LIMIT_PER_SEC=9` / `BURST=18`, while the recapture pass issues 300 calls over 650–900s — about **0.4 req/s**. On its own traffic the limiter will not absorb the removed sleep. It bites only if *system-wide* WG load is near the 9/s ceiling during the window, which Step 1's gate measures rather than assumes.
- **Honest sizing:** asia needed roughly 285s more to finish on 2026-08-13. This lever alone would not have prevented the truncation. It converts marginal days (the 825–859s runs) into comfortable ones; it does not survive a contended day.

### L2 — Cap the per-pass candidate limit

`RECAPTURE_LAPSED_LIMIT` is set explicitly in `/etc/battlestats-server.env` and read at `server/warships/tasks.py:2322`. It caps `candidates` per pass. Dropping it 30000 → 24000 **buys ~20% of pass duration — roughly 130–170s on asia**, enough headroom for a normal day and most contended ones.

The cost is rotation latency: the LRU cursor walks the dormant band more slowly, so a returner sits unseen longer. Planner row estimates for the `[8, 365]` band (`EXPLAIN`, not exact counts — the exact `count(*)` exceeded a 180s statement timeout):

| realm | est. band pool | rotation @30000 | rotation @24000 |
|---|---|---|---|
| na | ~123,000 | 4.1d | 5.1d |
| eu | ~207,000 | 6.9d | 8.6d |
| asia | ~112,000 | 3.7d | 4.7d |

Note the asymmetry, because it is what makes the per-realm form worth the code change: **asia is the slowest realm per row *and* has the smallest pool.** Its 35–46 rows/s against NA's 66–85 is a fixed per-call cost (the droplet's latency to `api.worldofwarships.asia`), not something a lever reaches. So asia both needs the cap most and pays for it least — 3.7d → 4.7d — while EU, which does not need it at all, would pay 6.9d → 8.6d.

Two implementations follow. **L2b supersedes L2a**; L2a is retained only as the no-deploy fallback.

#### L2a — global cap (env-only, taxes EU)

Set `RECAPTURE_LAPSED_LIMIT=24000`. No deploy, reversible instantly by restoring the value. The trade is unavoidable in this form: help asia, slow EU.

#### L2b — per-realm override (small code change + deploy, no EU tax) — **preferred, SHIPPED v5.3.8 2026-08-13 (inert)**

`RECAPTURE_LAPSED_LIMIT_{NA,EU,ASIA}` falls back to the existing global, then to the code default. The whole intervention is then `RECAPTURE_LAPSED_LIMIT_ASIA=24000`, and NA/EU keep their 4.1d/6.9d rotation untouched.

It mirrors an existing idiom in the same file — `_reclassify_statement_timeout` (`server/warships/tasks.py:3135-3143`) resolves a suffixed override, then a legacy global, then a code default. Implemented as `_recapture_limit` beside `_recapture_lapsed_lock_key` (`server/warships/tasks.py:200`), with the call site at `:2348` now reading `limit=_recapture_limit(realm)` in place of the inline `getenv`.

- **Inert until configured.** With no `RECAPTURE_LAPSED_LIMIT_*` set, `_recapture_limit` resolves exactly what the old inline `getenv` resolved. Landing and deploying this changes no behaviour; setting the env var is the separate, reversible act.
- **Blast radius:** one helper, one call site. The command's `--limit` argument is untouched, so manual/detect-only runs behave exactly as before.
- **Downstream safety (checked):** the ops email carries the snapshot's `limit` as a reported field only (`RECAP_FIELDS`, `server/scripts/daily_ops_email.py:241`); every recapture threshold is absolute rather than limit-relative (`recapture_no_data_max: 500`, `recapture_advanced_min: 10`, `:374-376`). Asia at 24000 projects to `advanced` ≈ 566 and `no_data` ≈ 4 — both comfortably inside their bands. The `partial` detector compares `scanned` to `candidates`, and `candidates = min(limit, pool)` still holds per realm, so it keeps working unchanged.
- **Tests:** `RecapturePerRealmLimitTests` (`server/warships/tests/test_recapture_lapsed_players.py:514`), four cases — suffixed override wins; a realm *without* an override keeps the global (the EU-protection case, which is the point of the lever); absent both falls back to 30000; and the task actually passes the per-realm value through to `call_command` for asia while NA still gets the global. That fourth case is the one that matters: the first three would pass against a helper nothing calls. It was the test that failed `30000 != 24000` before the call site changed.
- **Cost of the form:** this moves L2 out of the env-only tier into the code-and-deploy tier. It is still by far the smallest of the three code-tier changes, and unlike L3/L4 it is a permanent improvement to the lever rather than a one-time adjustment — every future per-realm divergence is then an env edit.
- **Why not a time budget instead:** stopping the scan at a fixed fraction of the soft limit would be self-tuning, but it makes a truncated pass the normal case and so destroys `partial` as a detector — the very signal that surfaced this incident. A candidate cap keeps `partial` meaning "something went wrong".

### L3 — Move the recapture Beat stripe off the fan-out window (code + deploy)

`recapture_times = {"na": ("10", "10"), "eu": ("30", "10"), "asia": ("50", "10")}` is hardcoded in `server/warships/signals.py:593` (minute, hour). NA's top-ships fan-out at 09:05 and its 30–50 min drain are what recapture now collides with.

- **Buys:** addresses the actual proximate cause rather than accommodating it.
- **Why move recapture and not the fan-out:** `TOP_SHIPS_WARM_MINUTE` (`server/warships/signals.py:208`) shifts minutes only; the *hour* derives from `REALM_CRAWL_CRON_HOURS`, which also drives the clan crawls. Moving the fan-out means moving the crawls. Moving recapture is the isolated change.
- **Costs:** a code change, a backend deploy, and a `post_migrate` schedule rewrite. **Weakened by F5** — the orchestrator is visitor-re-armable on a 15-min debounce, so a fan-out can land in any window. This lever reduces the *collision probability*; it cannot eliminate it.
- **Constraints:** keep the three realms ≥20 min apart, and clear of the 08:17 enrichment-pool-maintenance slot (`server/warships/signals.py:501-502`) and the 08:20 / 08:40 / 09:00 na/eu/asia reclassify-drift stripes (`:527`).

### L4 — Raise `RECAPTURE_TASK_OPTS` (code + deploy)

**Not an env lever.** It is a literal in `server/warships/tasks.py:51-56`:

```python
RECAPTURE_TASK_OPTS = {
    "time_limit": 16 * 60,        # 16 min hard — 60s of headroom for the final flush
    "soft_time_limit": 15 * 60,   # 15 min soft
    "ignore_result": True,
}
```

- **Buys:** accommodates the current duration directly.
- **Costs — smaller than a first reading suggests, and self-targeting.** A raised ceiling is not a raised runtime: a task holds its slot for as long as it actually runs, so lifting the limit does not lengthen NA's 577s pass or EU's 660s one. Only a realm that would otherwise have been cut short consumes the new headroom. **The global form therefore already behaves like a per-realm one**, which is why L4 does not want the L2b treatment. The real cost is bounded and singular: asia's pass may hold one `background` slot for up to the new limit instead of 900s.
- **The binding constraint is the 20-minute Beat stripe, not the lock.** The per-realm lock uses `PLAYER_REFRESH_LOCK_TIMEOUT = 6 * 60 * 60` (`server/warships/tasks.py:85`, applied at `:2312`), which a 960s hard limit clears by a factor of 22 — it constrains nothing. What a >20 min soft limit does is let two realms' passes overlap. The existing code comment argues that is harmless given the per-realm lock and `-c 3`; that argument was written for a less loaded queue and should be re-examined, not inherited.
- **Per-realm limits are not reachable in the L2b shape.** `RECAPTURE_TASK_OPTS` is splatted into the decorator — `@app.task(bind=True, **RECAPTURE_TASK_OPTS)` (`server/warships/tasks.py:2288`) — which is evaluated once at module import, when no realm exists. Every other time-limited task in the file binds the same way (`:3099`, `:3176`, `:3230`, `:3333`); there is no per-call override anywhere in the codebase. Nor does Beat offer one: `PeriodicTask` carries `args`/`kwargs`/`queue`/`priority`/`expires`/`headers` and no time-limit field (verified against the live install). The only route is smuggling `headers={"timelimit": [soft, hard]}` through Celery's protocol-2 message properties, which couples schedule registration to the wire format — too fragile for a knob this small, and unnecessary given the self-targeting property above.
- **It also aims the cost the wrong way.** A longer limit does not make a pass faster; it only lets it hold a slot longer. Per-realm-ing it would concentrate that on asia, which already runs in the most contended window.

## Execution log

What has actually been done, and what has not. **Nothing in this log changed the sweep's behaviour** — the one thing shipped is inert until an env var is set, and that var is unset.

### Performed — 2026-08-13

| # | Action | Evidence |
|---|---|---|
| 1 | Diagnosed the alert: read the three realms' snapshots, 7 days of task durations, and per-15-min `background` saturation for Aug 11/12/13 | F1–F5 above |
| 2 | Ruled out upstream (no WG/DNS/timeout markers; NA slowed too) | F4 |
| 3 | Wrote this runbook; QA'd it against the code — 31 assertions checked, 7 corrected | QA Notes |
| 4 | Implemented L2b test-first: 4 tests written and watched fail (the wiring case failed `30000 != 24000`), then `_recapture_limit` + the call site | `server/warships/tasks.py:200`, `:2348`; `server/warships/tests/test_recapture_lapsed_players.py:514` |
| 5 | Full backend suite: **1,196 passed, 2 skipped** | `pytest warships/tests/ --nomigrations` |
| 6 | Doctrine pre-commit: all applicable items PASS; `check_env_drift.sh` checks 1 and 3 clean | — |
| 7 | Reconciled two stale doc pointers found by that check | `.claude/skills/recapture/SKILL.md`, `CLAUDE.md` |
| 8 | Catalogued the new var; rewrote the `RECAPTURE_LAPSED_DELAY` entry to record it stays global | `agents/runbooks/ops-env-reference.md` |
| 9 | Released **v5.3.8** — commit `08180a1`, bump `76f52a4`, tag `v5.3.8`, `origin/main` fast-forwarded from `f565c24` | — |
| 10 | Waited for CI green on the release commit before deploying (did not bypass the deploy script's gate) | run 31736065497, success |
| 11 | Deployed backend + frontend; post-deploy verify and healthcheck both clean | releases `20260813153100` / `20260813153229` |
| 12 | Confirmed on the droplet that the helper is present **and** no `RECAPTURE_LAPSED_LIMIT_*` is set | `RECAPTURE_LAPSED_LIMIT=30000`, no suffixed keys |

### Performed — 2026-08-14 (Step 0)

Figures below were read live from the droplet during the 2026-08-14 session — `/opt/battlestats-server/shared/benchmarks/recapture-lapsed/` and `journalctl -u battlestats-celery-background` — and, like the Aug 13 numbers above, **cannot be re-derived from a checkout**.

| # | Action | Result |
|---|---|---|
| 1 | Observed the 2026-08-14 recapture run per Step 0 | asia `partial: true`, `scanned` **28,800** of 30,000, duration **912s** |
| 2 | Compared asia against **its own** 35–46 rows/s baseline (not against NA — asia is structurally slower per row, so a cross-realm comparison is invalid) | Aug 13 **25.3** rows/s, Aug 14 **31.6** rows/s, both below baseline |
| 3 | Re-measured `background` saturation for the 09:50–11:30 window | Aug 11 35% → Aug 12 43% → Aug 13 90% → **Aug 14 100%** |
| 4 | Verified the top-ships fan-out fix on its own terms (`runbook-top-ships-warm-soft-limit-2026-08-12.md` §Validation) | coverage **fixed** (45/45 buckets fresh, 0 soft-limit kills on the orchestrator); queue cost **worse** — judge it on both axes |

**Gate arithmetic.** The Step 0 gate is "asia goes partial a second time, **or** exceeds ~860s." Both limbs are satisfied: partial on 08-13 *and* 08-14, and 912s > 860s. Step 1 is therefore authorized — **to Step 1, not to Step 4**.

**Corollary that survives the gate:** at asia's own 35–46 rows/s baseline a 30,000-row pass takes 652–857s and *fits* inside 900s. So "15 minutes cannot fit asia" is false; the budget is adequate on an uncontended day, which is precisely why L4 stays last.

**Two observations recorded, not chased:**
- rows/s *improved* 25.3 → 31.6 while saturation went 90% → 100%. Pure contention does not predict that. Same neighbourhood as the open F4 question; it does not change the gate verdict.
- `warm_player_ranked_wr_battles_correlation_task` logged **46 soft-limit kills in 48h** — the journal-wide leader, burning slot-seconds in this very window and completing nothing. **No step in L1–L4 touches it.** It is the strongest evidence yet for Step 4's own note that the real fix is capacity or fan-out scheduling; whether it belongs in the lever order is an operator decision, not a reordering to make unilaterally.

### Confound introduced after Step 0 — v5.3.9 (recorded 2026-08-15)

**v5.3.9 deployed 2026-08-14 22:02 UTC** — after that day's recapture stripe and after Step 0's observation. It moved the ship-list all-view off a full `BattleEvent` rescan onto the `ShipPopDailyAgg` daily rollup (`runbook-ship-list-rollup-source-2026-08-14.md`), which **removes work from one of the five families oversubscribing the 09:50–11:30 `background` window** — the top-ships fan-out, measured at 22% of that window's slot-seconds. It was shipped for query cost, not as a recapture lever, and nobody chose it as one.

Consequence for the lever order, which is a sequencing constraint, not a new finding:

- The **2026-08-15 run is the first recapture pass with that contributor reduced.** Step 0's gate was met on evidence gathered *before* it existed.
- Pulling L1 without first reading 08-15 would **permanently destroy attribution**: a clean asia run afterwards could not be assigned to L1 rather than to the rollup swap, and L1 would be recorded as effective on evidence that does not support it.
- The reverse case matters as much — if 08-15 is still partial with one contributor already trimmed, that is a *stronger* mandate for L1 than Step 0 produced, and the operator ack is better informed for it.

**Therefore: read the 2026-08-15 run before pulling L1.** This does not reopen Step 0's gate — that gate is met and stays met. It inserts one free observation ahead of the first lever, at the cost of one day, and it is free precisely because L1 was never going to be applied without an operator ack anyway. The pct warmer (`warm_realm_ships_pct_task`) still walks the grid on `BattleEvent` and was **not** touched by v5.3.9, so the window is trimmed, not cleared.

Note on mechanics for whoever repeats this: `scripts/release.sh` was **not** used. Its final `git push` pushes the current branch, and this work was done in a worktree, so it would have pushed the worktree branch instead of main. Its steps were performed by hand — bump, `chore:` commit, `git push origin HEAD:main`, annotated tag, push tag.

### Outstanding

1. ~~**Step 0 — observe the 2026-08-14 run.**~~ **DONE 2026-08-14, gate met** — see Performed — 2026-08-14. The contention did recur; a lever is warranted.
2. **Step 1 (L1) not applied — this is the live next action, with one precondition: read the 2026-08-15 run first** (see Confound introduced after Step 0 — v5.3.9; the observation is free and protects L1's attribution). `RECAPTURE_LAPSED_DELAY` remains unset in prod (default 0.2). Env-only, no deploy, instantly reversible. Note what it is and is not: it buys ~45s of recapture's own wall-clock and measures the WG-limiter question for free — it is ordered first because it is the cheapest and most reversible, **not** because it is the most likely to close a contention deficit. The stripe runs ~10:10–11:30 UTC, so a change applied in the evening reads back on the *next* day's run.
3. **Step 2 (L2b) half-done: code shipped, lever not pulled.** Setting `RECAPTURE_LAPSED_LIMIT_ASIA=24000` in Pass → `/etc/battlestats-server.env` → restart `battlestats-celery-background` is all that remains, and only if Step 1 leaves asia above ~800s.
4. **L3 and L4 unimplemented**, by design — they sit behind Steps 1–2.
5. **F4 unexplained** (why EU alone was unaffected). The contention model is incomplete until answered.
6. **No `duration_s` in the snapshot**, so Step 0's measurement still requires `journalctl`. This is the instrumentation that would let `/recapture` see the budget trend directly, and the near-miss ops-email condition depends on it.

## Remediation path — one lever at a time

Doctrine: one production lever per step, explicit operator acknowledgement between steps, and a measurement gate before proceeding. Do not batch. Do not pull L4 first because it is the most direct — it is the most direct *and* the most load-additive.

**Step 0 — Observe (no change).** Watch the 2026-08-14 run. F5 means Aug 13's contention may not recur; if asia comes in at 650–750s with `partial: false`, the queue was the whole story and no lever is needed yet. Record the three durations and the 09:50–11:30 saturation figure.
**Gate:** proceed only if asia goes partial a second time, or exceeds ~860s.

**Step 1 — L1, `RECAPTURE_LAPSED_DELAY=0.05`.** Cheapest, env-only, no deploy, instantly reversible, and it measures the rate-limiter question for free. Update Pass, regenerate `/etc/battlestats-server.env`, restart `battlestats-celery-background`.
**Precondition (added 2026-08-15):** read the 2026-08-15 run before applying. v5.3.9 trimmed one contributor to the contention window after Step 0 observed it, so 08-15 is the first uncontaminated read of the new baseline and applying L1 blind would make the two indistinguishable. If 08-15 comes in clean and non-partial, hold L1 and observe again — the same logic that made Step 0 an observation rather than a lever.
**Gate:** compare asia's next duration against its 647–859s baseline. The arithmetic predicts ~45s; a materially smaller saving means system-wide WG load is hitting the 9/s ceiling — record that and treat L1 as spent. **Do not proceed the same day.**

**Step 2 — L2b, `RECAPTURE_LAPSED_LIMIT_ASIA=24000`.** Only if Step 1 leaves asia above ~800s. **The code half is done and deployed** (v5.3.8, 2026-08-13; `_recapture_limit` verified present on the droplet, no `RECAPTURE_LAPSED_LIMIT_*` set). What remains is one env change: set it in Pass, regenerate `/etc/battlestats-server.env`, restart `battlestats-celery-background`. NA and EU keep their current rotation.
**Fallback:** if a deploy is not available when this is needed, L2a (`RECAPTURE_LAPSED_LIMIT=24000`, global) buys the same headroom the same day at the cost of EU's rotation (6.9d → 8.6d), and is reverted by restoring the value.
**Gate:** asia's `scanned` equals `candidates` with `partial: false` for three consecutive days.

**Step 3 — L3, move the recapture stripe.** Only if Steps 1–2 have not held. Given F5, treat this as reducing collision probability rather than eliminating collisions, and pick the target window accordingly. Code change, tests, backend deploy, then verify the new schedule landed in `PeriodicTask`.
**Gate:** three clean days.

**Step 4 — L4, raise the soft limit.** Last, and only with the load cost accepted explicitly. If the path reaches here, the honest conclusion is that the `background` queue is over-subscribed and the right fix is capacity or fan-out scheduling, not a bigger recapture budget.

## Validation

Re-measure the band pool before Step 2 if the estimates above are stale. `EXPLAIN` is instant and safe; the exact `count(*)` timed out at 180s on the shared 2-vCPU managed Postgres, so prefer the estimate:

```sql
EXPLAIN SELECT 1 FROM warships_player
 WHERE realm = 'asia'
   AND last_battle_date BETWEEN (CURRENT_DATE - 365) AND (CURRENT_DATE - 8);
-- read the `rows=` estimate off the Index Scan node
```

Rotation days = band pool ÷ limit.

After each step, re-read the snapshots and durations:

```bash
/recapture                          # per-realm yield + partial state
ssh root@battlestats.online 'journalctl -u battlestats-celery-background \
  --since "3 days ago" --no-pager | grep -E "recapture_lapsed_players_task.*succeeded in"'
```

Contention check for the same window:

```bash
ssh root@battlestats.online 'journalctl -u battlestats-celery-background \
  --since "<date> 09:50" --until "<date> 11:30" --no-pager \
  | grep -oE "succeeded in [0-9.]+s" \
  | awk "{s+=\$3} END {printf \"%.0f task-s (%.0f%% of 18000)\n\", s, s/18000*100}"'
```

Backend suite must stay green for L3/L4:

```bash
cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 python -m pytest warships/tests/ --nomigrations --tb=short
```

`server/warships/tests/test_recapture_lapsed_players.py` carries four classes — `RecaptureLapsedPlayersTests:27`, `RecaptureSoftTimeLimitTests:151`, `RecaptureUpstreamFailureAbortTests:295`, `RecaptureLapsedTaskGateTests:473`. `RecaptureSoftTimeLimitTests` covers the truncation path; L4 changes the budget, not the behaviour, so it should pass unmodified. If it does not, the change did more than intended. L3 touches `signals.py` schedule registration, so re-run the whole file rather than that class alone.

## Follow-ups

- **Open question (F4):** why EU was unaffected while NA and asia both slowed. Until answered, the contention model is incomplete.
- **Instrumentation gap:** the snapshot records `wg_calls` and `scanned` but no elapsed time, so duration must be reconstructed from `journalctl`. A `duration_s` field would make the budget trend readable from the benchmark corpus alone — which is what `/recapture` reads.
- **Ops-email calibration:** consider a *near-miss* condition (duration > 85% of the soft limit). It would have flagged asia during the 647–859s week, before it crossed. That is the detector this incident argues for, and it depends on the `duration_s` field above.
- **Per-realm limits:** promoted out of this list into **L2b** on 2026-08-13. The obvious next question — whether `RECAPTURE_LAPSED_DELAY` and `RECAPTURE_TASK_OPTS` want the same treatment — was examined the same day and the answer is **no for both**, for different reasons recorded under L1 and L4: the delay guards only global resources across non-overlapping passes, and the task opts are decorator-bound at import so the shape does not reach them (and would not help if it did, since a raised ceiling is already self-targeting). `RECAPTURE_LAPSED_LIMIT` is the one knob of the three whose effect is genuinely per-realm, because rotation latency is a function of that realm's own pool. Do not generalise the helper on symmetry alone.
- **WG call-rate visibility:** nothing reports aggregate WG request rate against `WG_RATE_LIMIT_PER_SEC`, so L1's expected saving cannot be predicted, only measured after the fact. A limiter-wait counter would close that.
- **Template divergence (noticed during QA, out of scope):** `server/deploy/bootstrap_droplet.sh:308` defaults `CELERY_BACKGROUND_CONCURRENCY` to `2` while `server/deploy/deploy_to_droplet.sh:924` defaults it to `3`. Prod sets it explicitly, so nothing is broken today.
- The 2026-08-13 production figures here were read live from the droplet and cannot be re-derived from a checkout. Sources of record: `/opt/battlestats-server/shared/benchmarks/recapture-lapsed/` and `journalctl -u battlestats-celery-background`.
