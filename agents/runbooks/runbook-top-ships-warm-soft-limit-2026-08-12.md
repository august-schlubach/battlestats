# Runbook: Top-Ships Warm — Soft-Limit Death and Cold-Read Re-Queue Storm

_Created: 2026-08-12_
_Context: `warm_realm_top_ships_task` has a 100% failure rate — 12 dispatches in 24h, 12 `SoftTimeLimitExceeded`, zero completions — leaving the landing page's default T10 view serving a weeks-old window while burning ~1.8h/day of the shared `background` worker._
_QA: Every figure below is read directly from production on 2026-08-12 (worker journal, live Redis key probes, RabbitMQ queue state). Read-only throughout._

## QA Notes

_Reviewed 2026-08-12 against `/home/august/code/battlestats` (worktree `fix-top-ships-warm-soft-limit`). 19 assertions checked, 4 corrected._

### Resolved
- **"every landing visitor re-enqueues" — attributed to a single call site in `compute_realm_ships_by_tier_type`** -> actual: there are **two** cold-read re-queue call sites feeding the same task — `compute_realm_top_ships` (the treemap) at `server/warships/data.py:6578` and `compute_realm_ships_by_tier_type` (the tier/type list) at `server/warships/data.py:6912` -> §4 step 1 and Step 1 of the plan now name both; a debounce fix that only covers the list path leaves the treemap path still arming the task.
- **Storm attributed solely to the debounce** -> actual: the task's own lock is `cache.add(lock_key, self.request.id, timeout=300)` (`server/warships/tasks.py:1479`) while `soft_time_limit` is 540 (`server/warships/tasks.py:25`), so **the lock expires 240s before the task is killed** and a second invocation can start on top of a still-running one. The codebase already knows this failure mode — `ENRICHMENT_RECLASSIFY_LOCK_TIMEOUT` carries the comment "Lock must outlive the per-realm reclassify hard time_limit so a slow run can't lose its lock mid-pass and let a second invocation start on top of it" (`server/warships/tasks.py:2965-2967`) -> added as §4b and folded into Step 1.
- **Step 3 proposed "evaluate whether the all-view buckets should also carry the window-independent `:published` durable copy"** -> actual: they **already do**. Both surfaces return through `_store_realm_ship_cache(fresh_key, published_key, payload)`, which writes the fresh key at 26h TTL and the published key at `timeout=None` (`server/warships/data.py:6511-6525`), called at `:6621` (treemap) and `:6977` (list) -> Step 3 rewritten; the durable fallback is not missing, it is working, and that is *why* the symptom is "weeks-stale numbers" rather than a cold-miss error.
- **§2 table framing implied cold buckets mean no data served** -> actual: the probe reads **fresh** keys only; a cold fresh key falls through to the durable published copy (`server/warships/data.py:6905-6912`), so visitors are served last-good, not an error. Because the fresh key's TTL is 26h (`:6523`), a bucket needs a *successful daily* warm to ever be fresh -> §2 now states this explicitly, since it changes what the validation probe proves.

### Unverified
- The 2026-07-25 / 36-ship vs 2026-08-12 / 37-ship Fuyutsuki observation in §3 is inherited from the prior session's investigation; I confirmed the mechanism that produces it and the current per-bucket cold/hot map, but did not re-derive those two specific payload snapshots.
- Per-bucket cost (110–270s, inferred by dividing 540s by the 2–5 buckets completed) is arithmetic on the kill point, not a measured per-bucket timing. Step 2's "full 540s is ~2–5× what one bucket needs" rests on it. A single instrumented run would convert this to a measurement.

### Open Questions
1. **Should Step 1 ship on its own first, or together with Step 2?** Step 1 alone stops the ~1.8h/day burn and the duplicate-run window but leaves T9/T10 stale — i.e. it fixes the cost, not the symptom the landing page shows. Step 2 alone fixes staleness but leaves the porous lock. Shipping both at once is one deploy and one verification cycle; shipping separately isolates blame if the queue behaves unexpectedly. Blocks sequencing of the plan, not its content.

## Purpose

Three coupled defects in one task. The first is a **budget overshoot**: the warm walks 15
tier×type buckets under a 540s soft limit and dies after 2–5 of them, so the tail — T9 and
T10, including the landing page's *default* view — never warms on any realm. The second is
a **self-sustaining re-queue storm**: because those tail keys stay cold forever, every
landing visitor re-enqueues the same doomed 540s task, which then deletes its own debounce
key on the way out. The third, found during QA, is that the task's **lock expires before the
task does** (300s against a 540s soft / 600s hard limit), so the duplicate guard goes blind
for the tail of every run (§4b).

None of this surfaces as an error, which is why it ran for weeks unnoticed: the durable
`:published` fallback quietly serves last-good numbers whenever the fresh key is cold, and
it has been doing exactly that since the last successful warm.

Read this before touching `warm_realm_top_ships_task`, and in particular before reaching for
the obvious fix. **Raising the time limit does not work** — the overshoot is 5–7×, not
marginal. §5 explains why, and the remediation plan gives the remedy that fits the shape.

**Status: Steps 1 and 2 implemented 2026-08-12** (see Implementation below). Step 3 remains
open.

## Findings

### 1. The task never completes — 100% failure rate

Production `background` worker journal, trailing 24h:

| Signal | Count |
|---|---|
| `warm_realm_top_ships_task` received | 12 |
| `Soft time limit … exceeded` | 12 |
| `SoftTimeLimitExceeded` raised | 12 |
| **succeeded** | **0** |

Not "most runs" — every run. The task has not completed once in the observation window.
`TASK_OPTS` gives it `soft_time_limit: 540` / `time_limit: 600` (`tasks.py:23-27`), shared
with every other ordinary task.

### 2. The staleness maps exactly onto the loop order

The task's bucket loop (`tasks.py`, inside `warm_realm_top_ships_task`) is:

```python
for tier in sorted(_badge_tiers()):              # 8, 9, 10
    for ship_type in SHIP_LEADERBOARD_TYPES:     # Battleship, Cruiser, Destroyer, AirCarrier, Submarine
```

…preceded by two full `compute_realm_top_ships` passes (`random` + `ranked`), which consume
budget before the first bucket is even reached.

Probing the live fresh keys for each realm's **current** window on 2026-08-12 shows the kill
point precisely — warm buckets are a strict prefix of that iteration order, and everything
after it is cold:

| Realm | window_end | t8 | t9 | t10 | buckets warmed |
|---|---|---|---|---|---|
| NA | 2026-08-12 | Batt ✅ Crui ✅ Dest ❌ AirC ❌ Subm ❌ | all ❌ | all ❌ | **2 / 15** |
| EU | 2026-08-11 | all ✅ | all ❌ | all ❌ | **5 / 15** |
| ASIA | 2026-08-11 | Batt ✅ Crui ✅ Dest ❌ AirC ❌ Subm ❌ | all ❌ | all ❌ | **2 / 15** |

There is no ambiguity here: the prefix is contiguous and the cutoff falls mid-tier-8 on two
of three realms. **T10's fresh key is unfilled on every realm**, and T10 is
`SHIP_LIST_DEFAULT_TIER` (verified = 10 in prod, with `SHIP_BADGE_TIERS=8,9,10` pinned) —
the view the landing page opens on.

**Read the probe correctly.** It reads **fresh** keys only. A cold fresh key does *not* mean
the visitor gets an error — it falls through to the durable `:published` copy
(`data.py:6905-6912`), which is why the symptom is weeks-old numbers rather than a failure.
And because the fresh key carries a 26h TTL (`data.py:6523`), a bucket is fresh only if a
warm **succeeded within the last day**. With a task that never completes, every fresh key is
permanently cold and the published copy — written at the last successful warm — serves
forever. That is the whole mechanism in one line.

### 3. The user-visible symptom is a window mismatch, not a filter bug

Because the all-view and the percentile buckets are filled by **different** warmers into
**separate** cache keys, a visitor toggling the WR pills can be served payloads computed over
different windows — and therefore different ship sets.

Observed: NA T10 Destroyer served its all-view from a **2026-07-25** window (36 ships) while
its 50%/25% buckets were on **2026-08-12** (37 ships). Fuyutsuki, at 2,537 battles, appeared
under 50/25 and was absent from All.

This reads as a filter-semantics bug and is not one. Both paths gate membership identically
on full-population battles ≥ `SHIP_LIST_MIN_BATTLES` (50; no droplet override — the code
default is live). The divergence is **cache vintage**. The percentile buckets stay current
only because the nightly snapshot triggers `warm_realm_ships_pct_task` independently of this
dying chain — so the pct buckets being *fresher than All* is the diagnostic tell, not a
quirk. That invariant now holds per-computation, not per-serve; the docstring was corrected
in `f5affb5` and the UI copy no longer promises membership parity.

### 4. The re-queue storm — why this is self-sustaining

The loop:

1. A landing visitor hits a cold tail key → `queue_realm_top_ships_warm(realm)` is called.
   **Two** call sites do this, both feeding the same task: `compute_realm_top_ships`
   (the treemap, `data.py:6578`) and `compute_realm_ships_by_tier_type` (the tier/type list,
   `data.py:6912`). A debounce fix covering only one of them leaves the other arming the task.
2. That sets a dispatch debounce key with `REALM_TOP_SHIPS_WARM_DISPATCH_TIMEOUT = 60`
   (`tasks.py:110`) and dispatches the task.
3. The task runs 540s and is killed.
4. Its `finally` block runs `cache.delete(_realm_top_ships_warm_dispatch_key(realm))`
   (`tasks.py:1528`) — **clearing the debounce on the way out**.
5. The tail keys are still cold, so the next visitor repeats from step 1.

The debounce was designed to collapse a burst of readers behind one warm. It cannot do that
here, because the condition it debounces is never resolved. A 60s window against a 540s task
means the debounce has already expired long before the task dies — and then the `finally`
clears it again for good measure.

**Cost:** 12 runs × 540s ≈ **1.8 hours/day** of a `-c 3` worker, producing nothing. The
docstring promises "once per day".

### 4b. The lock cannot cover the task either

Found during QA, and it compounds §4. The task takes its lock with
`cache.add(lock_key, self.request.id, timeout=300)` (`tasks.py:1479`) while its
`soft_time_limit` is **540** (`tasks.py:25`). The lock therefore **expires 240s before the
task is even killed** — so the "already running" guard goes blind for the last 44% of every
run, and a second invocation can start on top of a live one.

This is a known failure mode in this codebase, already solved once next door:

```python
# Lock must outlive the per-realm reclassify hard time_limit so a slow run can't
# lose its lock mid-pass and let a second invocation start on top of it.
ENRICHMENT_RECLASSIFY_LOCK_TIMEOUT = 45 * 60          # tasks.py:2965-2967
```

Any lock timeout for this task must exceed its **hard** `time_limit` (600), not merely sit
near its soft limit.

### 5. Why raising the budget is the wrong lever

The tempting fix is a bigger `soft_time_limit`. The arithmetic rules it out.

At 2–5 buckets per 540s, one bucket costs roughly 110–270s. Fifteen buckets plus the two
`compute_realm_top_ships` passes therefore need on the order of **2,700–4,000s** — an
overshoot of **5–7×**, not a near miss. A budget that actually covered the work would mean a
single task occupying one of three `background` slots for over an hour, on a queue that is
already the system's bottleneck (§6).

This is the same failure shape as the enrichment reclassify family, and it has a known
remedy in this codebase: that task had one shared budget over seven buckets, a tail that
starved, and per-realm passes that lost their whole run to a single slow bucket. The fix
there — **split the family, commit per bucket, and rotate the starting bucket by day** — is
recorded in `runbook-post-deploy-verification-2026-08-07.md` §4a and is now running clean.
Apply the same shape here.

### 6. Interaction: this is a major feeder of `background` queue saturation

The `background` worker is `-c 3` and shared by warmers, snapshots, incrementals, and
enrichment. Measured today: a newly-queued `warm_ship_combat_pop_task` waited **28 minutes**
(queued ~05:54, executed 06:22) behind this queue, with 14 messages backed up.

Reclaiming the ~1.8h/day this task wastes is therefore not only a fix for the stale landing
view — it directly relieves the queue that every other background consumer competes for,
including the ship-combat population warm shipped in v5.3.1.

A second, independent feeder of the same queue is the post-deploy startup warm
(`gunicorn.when_ready` → `startup_warm_caches_task` → `startup_warm_all_caches`), which runs
4 warmers × 3 realms unconditionally on every deploy, and whose `warm_player_distributions`
does `cache.delete()` + `REFRESH MATERIALIZED VIEW CONCURRENTLY` against a Redis that
survived the deploy intact (uptime 10 days across many deploys; RDB persistence on). That is
**out of scope here** — tracked separately — but the two compound.

> **Followed up 2026-08-26.** That second feeder turned out to have the *same* defect as
> this one: twelve serial warmers under one 540s limit, zero completions in the retained
> journal. Fixed the same way — the orchestrator now computes nothing and dispatches
> instead. See `runbook-startup-warm-fanout-2026-08-26.md`.

## Remediation plan

Ordered by risk. Each step is independently shippable and independently verifiable.

### Step 1 — Stop the storm (small, low risk, ship first)

Break the self-sustaining loop without restructuring anything:

- Do **not** clear the dispatch debounce in `finally` when the task ended in failure. On a
  soft-limit kill the correct behaviour is to leave the debounce standing so the next
  visitor cannot immediately re-arm a task that just proved it cannot finish.
- Give the debounce a timeout matched to the work, not to a burst — `60s` against a 540s
  task cannot serve its purpose under any outcome.
- **Raise the lock timeout above the hard `time_limit`** (§4b): `timeout=300` against a
  600s hard limit leaves the guard blind for the tail of every run. Follow
  `ENRICHMENT_RECLASSIFY_LOCK_TIMEOUT`'s precedent.
- Both fixes must cover **both** re-queue call sites (§4 step 1), not just the tier/type one.

This alone returns ~1.8h/day of worker time, closes the duplicate-run window, and stops the
landing page acting as a task-dispatch amplifier. It does **not** fix staleness on its own.

### Step 2 — Split the bucket loop (the actual fix)

- Dispatch **one subtask per (realm, tier, ship_type) bucket** rather than one task walking
  15 buckets under a shared budget. Each bucket then gets the full 540s, which is ~2–5×
  what it needs, and one slow bucket can no longer discard the work of every bucket after it.
- **Rotate the starting bucket by day** so no fixed suffix can starve indefinitely even if
  the per-bucket budget is later exceeded. This is the property that made the reclassify fix
  durable, and it is cheap insurance.
- Keep a per-bucket lock so concurrent enqueues coalesce (mirror
  `_ships_by_pct_warm_lock_key`).
- Preserve the existing `queue_realm_ships_pct_warm` chain.

### Step 3 — Verify, and add a staleness alarm (not a fallback)

**Corrected by QA:** an earlier draft proposed adding a durable `:published` fallback to the
all-view buckets. It already exists — `_store_realm_ship_cache` writes the fresh key at 26h
and the published key at `timeout=None` for both surfaces (`data.py:6511-6525`, called at
`:6621` and `:6977`). Nothing to add.

The real gap is that the fallback is **silent**. It did its job perfectly for 18 days while
the warm chain was dead, and nothing surfaced that. Once Steps 1–2 land, the durable
follow-up is an alarm on *fallback age* — if any realm serves an all-view bucket whose
published copy predates the current `window_end` by more than a day, that is a dead warm
chain and should be reported (the ops digest already has a thresholds mechanism,
`DEFAULT_THRESHOLDS` in `daily_ops_email.py`). Do not bundle this with Step 2.

## Implementation (2026-08-12)

Steps 1 and 2 shipped together — Step 1 alone would have stopped the burn while leaving the
stale T10 view, which is the symptom visitors actually see.

**Step 1 — storm and lock:**

- `REALM_TOP_SHIPS_WARM_DISPATCH_TIMEOUT` 60s → **900s**, and the `finally` block now clears
  the debounce **only on success** (`succeeded` flag). A killed task leaves its cooldown
  standing, so the retry rate is bounded instead of gated on how fast the next visitor
  arrives.
- `REALM_TOP_SHIPS_WARM_LOCK_TIMEOUT` = **900s**, replacing the inline `timeout=300`. Now
  exceeds the 600s hard `time_limit`, so the duplicate guard covers the whole run.
- The lock is still released on **both** outcomes (it is mutual exclusion, not a cooldown);
  only the debounce is outcome-dependent. Both are pinned by tests.
- Because both re-queue call sites funnel through `queue_realm_top_ships_warm`, fixing the
  helper covers the treemap and list paths together.

**Step 2 — bucket split:**

- New `warm_ships_bucket_task(realm, tier, ship_type, mode)` computes **one** bucket under
  its own 540s budget (~2–5× what a bucket needs), with a per-bucket lock
  (`_ships_bucket_warm_lock_key`, 900s) so repeat dispatches coalesce. Routed to
  `background`.
- `warm_realm_top_ships_task` becomes an orchestrator: it still computes the two treemap
  modes and the default pct bucket inline (both cheap, both pre-existing), then **dispatches**
  15 bucket subtasks instead of computing them. It can no longer overrun.
- `_rotated_ship_buckets(tiers, on_date)` rotates the order by `date.toordinal() % 15` — a
  pure rotation, not a shuffle, so per-tier locality stays readable in the journal.
- Dispatches are staggered by `SHIPS_BUCKET_WARM_SPACING_SECONDS` (default 20s) so 15 real
  jobs do not land on the shared queue in one burst.

### Second pass, same day — the first pass was incomplete

**v5.3.3 fixed NA and ASIA and did nothing for EU.** Post-deploy the orchestrator logged 2
successes (NA 14:07, ASIA 22:36) and **5 soft-limit kills**, and EU dispatched **zero**
buckets in nine hours — its coverage stayed at 1/15 while the other two reached 15/15.

Cause: the first pass moved only the 15-bucket loop onto subtasks and left three heavy
computes **inline, ahead of the dispatch**:

```
1. compute_realm_top_ships(random)    inline
2. compute_realm_top_ships(ranked)    inline
3. dispatch 15 buckets                <- never reached on EU
4. default pct bucket                 inline  (measured 383s on EU)
```

EU is the largest realm; steps 1–2 alone exhaust 540s, so it died *before* dispatching
anything. NA and ASIA are small enough to squeak through, which is exactly why the fix
looked complete. **The lesson generalises: anything heavy left on an orchestrator's own
budget is a single point of failure for every subtask behind it.**

The orchestrator is now a **pure dispatcher** — it computes nothing. Both treemap modes moved
to a new `warm_top_ships_treemap_task` (own lock, own budget), and the default pct bucket is
dispatched to the existing `warm_ships_by_pct_task` rather than computed. All 17 dispatches
share one stagger sequence. A test asserts the orchestrator calls neither
`compute_realm_top_ships` nor `compute_realm_ships_by_tier_type` at all, so this cannot
regress silently.

**Tests:** 16 in `test_top_ships_warm_bucket_split.py` — lock-outlives-hard-limit for both
locks, debounce survives failure / clears on success, lock released on both outcomes, one
subtask per bucket with no all-view bucket computed inline, every pair covered exactly once,
daily rotation, rotation-is-a-rotation, staggered countdowns, per-bucket lock skip, bucket
lock released on failure, one failing bucket not affecting others, queue routing.

`test_realm_ships_by_tier_type.RealmShipsByTierTypeWarmTests` was **updated, not deleted**: it
asserted the orchestrator filled bucket caches inline. It now asserts the orchestrator
dispatches all five (local `_badge_tiers()` = {10}), then runs the dispatched subtasks and
keeps every original cache assertion — including the empty-bucket publish behaviour.

Full suite: **1154 passed, 2 skipped**.

## Validation

The fix is confirmed only when all three hold:

1. **Completion.** `journalctl -u battlestats-celery-background -g "warm_realm_top_ships"`
   shows `succeeded` and **zero** `SoftTimeLimitExceeded` over a full day.
2. **Coverage.** The live **fresh**-key probe in §2 returns HOT for **all 15 buckets** on all
   three realms at the current `window_end`. This is the load-bearing check — a completing
   task that still leaves T10 cold has not fixed the user-visible problem. Probe fresh keys
   specifically: the published copy is always present, so probing it proves nothing.
3. **No storm.** Dispatch count per realm falls to the documented ~1/day, verifiable by
   counting `received` lines. A completing task that is still dispatched 12×/day means the
   debounce is still broken.

Recheck **queue depth** (`rabbitmqctl list_queues`) before and after: the `background`
backlog should fall, and unrelated tasks should stop waiting tens of minutes.

Do not validate from the landing page alone. A visitor-facing spot-check cannot distinguish
"warmed correctly" from "served a durable fallback", which is precisely the confusion §3
documents.

## Follow-ups

- **Startup-warmer redundancy** (§6, out of scope here): `WARM_CACHES_ON_STARTUP` already
  exists as an on/off gate; the per-cache selector and skip-if-warm behaviour do not.
- **Deploy-script SSH hang**: `client/deploy/deploy_to_droplet.sh` hangs after a successful
  deploy because the remote app process inherits the SSH session's stdout; it then exits 0
  when killed, so exit code alone cannot distinguish a hang from success. A `-n`/`</dev/null`
  on the SSH invocation would fix it. Observed 2026-08-12 during the v5.3.1 deploy.

## Related

- `runbook-post-deploy-verification-2026-08-07.md` §4a — the reclassify bucket-family split;
  the precedent this plan copies.
- `runbook-shipleaderboard-warm-before-evict-2026-06-18.md` — the `:published` durable
  fallback idiom referenced in Step 3.
- `runbook-ship-list-wr-percentile-2026-06-23.md` — the pct warmer that stays current
  independently, and whose freshness relative to the all-view is the diagnostic tell in §3.
