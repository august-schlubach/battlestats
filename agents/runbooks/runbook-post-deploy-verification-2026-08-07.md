# Runbook: Post-Deploy Verification of v5.1.5 / v5.1.6

_Created: 2026-08-07_
_Context: Four fixes shipped 2026-08-06 could not be verified the same day because each depends on a scheduled task that had not yet run. This is the first day all four produced trustworthy output._
_QA: All findings below are read directly from production — benchmark snapshots, the background-worker journal, and systemd unit state. Read-only throughout._

## Purpose

Closes the verification loop on the two releases of 2026-08-06 — **v5.1.5** (health-sweep
findings F1–F4, F6; see `runbook-health-sweep-remediation-2026-08-06.md`) and **v5.1.6**
(the recapture soft-limit truncation fix, plus F5) — together with the Step 1 compaction
timer from `runbook-db-disk-remediation-2026-08-05.md`.

Three of the four pending items are confirmed and need no further work. The fourth, **F2**,
fixed the defect it targeted, but its two heaviest buckets (`enriched`, `empty`) each need
~420s against a 420s statement timeout, so only one of them can complete per pass. Read §4a
before touching `reclassify_enrichment_status` — in particular, the "pairwise disjoint"
premise is **proven by test**, so bucket order changes cost, not scope.

Both releases are live: backend release `20260806164538`, client `20260806164757`, prod
`VERSION` = 5.1.6.

## Findings

### 1. F4 — gap_1d classifier — CONFIRMED

The `Player.activity_updated_at` disambiguator works. The before/after is exact rather than
suggestive: v5.1.5 deployed **04:59 UTC** on 08-06 and the benchmark cron fires **04:30
UTC**, so the 08-06 snapshot is pre-deploy by 29 minutes and 08-07 is the first post-deploy
one.

Totals:

| bucket | 08-06 (pre) | 08-07 (post) |
|---|---|---|
| `gap_1d.total` | 21,001 | 21,323 |
| `non_pvp_active` | 58 | **19,229** |
| `no_snapshot_pair` | 19,976 | **312** |
| `pvp_mover` | 967 | 1,782 |
| `pvp_mover_no_event_48h` | 349 | 282 |

The gap itself did not change size (+322, noise); the classification of it did. This is the
predicted signature — the snapshot delta gate destroyed the classifier's evidence on
2026-07-20, and the bucket has now been restored rather than the underlying population
having moved.

Per realm the residual 24h gap is overwhelmingly non-PvP, NA highest as documented: NA
10,572 of 12,125; EU 3,886 of 4,234; ASIA 4,771 of 4,964.

**Consequence for future tuning: the residual cov/1d gap is a capture-surface question**
(co-op / Operations are structurally invisible to PvP-only `ships/stats`), **not a floor
throughput deficit.** Do not recommend cadence or limit raises off it.

Do not trend `non_pvp_active` across 2026-07-21 → 2026-08-06. **2026-08-07 is the new
baseline.**

### 2. Recapture (v5.1.6) — CONFIRMED, clean on all three realms

| realm | partial | scanned/candidates | advanced (yield) | into7d | into7d_clanless | cursor_stamped |
|---|---|---|---|---|---|---|
| na | **false** | 30,000 / 30,000 | 603 (2.01%) | 603 | 79 | 30,000 |
| eu | **false** | 30,000 / 30,000 | 1,575 (5.25%) | 1,573 | 214 | 30,000 |
| asia | **false** | 30,000 / 30,000 | 1,070 (3.57%) | 1,070 | 139 | 30,000 |

Live config: `ENABLED=1 APPLY=1 band=8–365d limit=30000`, mode `apply` on all three.
`chunk_errors` 0 everywhere.

**ASIA completed a full pass — its first since ~2026-07-20**, and it was the realm the
truncation bug was killing daily. Yield across realms: 3,248 returners found, 3,246 promoted
back into floor scope (harvested free on the next floor cycle), of which **432 are clanless**
— the marginal value nothing else recovers, since the clan crawl only walks rosters.

**Open, not a defect:** `scanned == candidates == limit == 30,000` on every realm means the
limit is binding and the dormant pool is *not* exhausted. The LRU cursor walks at
30k/realm/day, so `runbook-recapture-lapsed-players-2026-06-26.md`'s "~a week" rotation
assumption should be re-derived against the current pool size.

### 3. Compaction timer (disk remediation Step 1) — CONFIRMED, first completions ever

Two consecutive clean fires of `battlestats-compact-observations.service`, both exit 0:

- 2026-08-06 12:34 → 12:41 — **87,665** payloads compacted, 44 batches, 7.5 min
- 2026-08-07 12:30 → 12:41 — **56,955** payloads compacted, 29 batches, 10.6 min

This had failed *every* night under the 540s Celery soft limit before Step 1 moved it onto
its own systemd timer. The declining count is the backlog draining. Next fire 2026-08-08
12:34 UTC.

### 4. F2 — drift reclassify — PARTIALLY CONFIRMED, regression open

**The defect that was targeted is fixed.** Before the change, one shared
`transaction.atomic()` meant any bucket's statement timeout rolled back the whole pass; EU
and ASIA returned `{'status': 'error'}` daily with **zero** rows written. They now commit
their drift rescue and report honestly.

Full outcome history (the journal now reaches 2026-08-03):

| date | na | eu | asia |
|---|---|---|---|
| 08-04 | **ok, 832s** | error, 420s | error, 409s |
| 08-05 | **ok, 748s** | error, 420s | error, 420s |
| 08-06 | partial — failed `empty`, `enriched` | partial — failed `empty`, `enriched` | partial — failed `empty`, `enriched` |
| 08-07 | partial — failed `enriched` | partial — failed `enriched`, `empty` | partial — failed `enriched`, `empty` |

Rows committed post-fix are small but real: 08-06 na 11 / eu 41 / asia 157; 08-07 na 2 /
eu 12 / asia 3.

#### 4a. Two heavy buckets, one slot — and the NA-only regression

**`enriched` and `empty` each cost ~420s of pure scan, writing 0 rows.** Everything else is
cheap: the five `skipped_*` / `pending` buckets together account for only ~76–128s per run.
Both heavy buckets sit at or over the 420s statement timeout, so **at most one of them can
complete in a pass**, and which one survives is decided by the rotation.

**Bucket order is deterministic and checkable.** `_plan_in_documented_order` is
`[enriched, empty, skipped_hidden, skipped_low_battles, skipped_inactive, skipped_low_wr,
pending]`; `build_plan` rotates it by `timezone.now().timetuple().tm_yday % 7`. Computed
positions, which match the observed log ordering on every run:

| date | offset | `enriched` position | `empty` position |
|---|---|---|---|
| 08-04 (pre-fix, **no rotation**) | — | **1** | 2 |
| 08-05 (pre-fix, **no rotation**) | — | **1** | 2 |
| 08-06 | 1 | **7** | 1 |
| 08-07 | 2 | **6** | 7 |
| 08-08 | 3 | **5** | 6 |

Pre-fix (`ed27912`) there was no rotation: a single `transaction.atomic()` over the
documented order, so `enriched` always ran **first**.

**That reframes the pre-fix `ok`/`error` split.** EU and ASIA returned `{'status': 'error'}`
at **420.02s** and **420.03s** — that is the *first* bucket hitting the statement timeout and
aborting the shared transaction, and the first bucket was `enriched`. So **`enriched` was
already exceeding 420s on EU and ASIA before the fix**; it is not a regression there, and the
fix converted a total loss into a partial, which is strictly better. (Inference from duration
plus position — the pre-fix code logged no bucket name. ASIA 08-04 at 408.9s is *under* the
timeout and is a genuine anomaly this runbook does not explain.)

**NA is the only realm with a real regression.** It completed all seven buckets on 08-04
(832s) and 08-05 (748s) and has not since. Since the cheap buckets take ~76–128s, `enriched`
+ `empty` together took ~620–670s on 08-05 — averaging **~310–335s each, i.e. ~75–80% of the
420s timeout**. They were marginal, and they have since crossed the line.

**What is NOT the cause:**

- **Not budget starvation.** `skipped_buckets` is empty on every run. The `--budget-seconds`
  deadline appends to `skipped_for_budget`, a separate list, so the buckets are genuinely
  running and genuinely hitting the statement timeout.
- **Not a disjointness violation.** The premise is **proven by a passing test** —
  `test_f2_buckets_are_pairwise_disjoint` in
  `server/warships/tests/test_runbook_qa_2026_08_06.py` (module: 53 passed). No row is claimed
  by two buckets, so `changing = qs.exclude(enrichment_status=status)` selects the same rows
  regardless of position. **Position changes cost, not scope.**

**Durations reconcile exactly** under "each heavy bucket burns its full 420s" — the strongest
evidence that both are genuinely over the timeout rather than merely slow:

| run | total | decomposition |
|---|---|---|
| 08-06 na | 916.8s | `empty` 420 + cheap ~77 + `enriched` 420 |
| 08-06 asia | 968.5s | `empty` 420 + cheap ~128 + `enriched` 420 |
| 08-07 na | 927.5s | cheap ~100 + `enriched` 420 (fail) + `empty` ~407 (**succeeded**, 0 rows) |
| 08-07 asia | 962.2s | cheap ~122 + `enriched` 420 + `empty` 420 |
| 08-07 eu | 724.2s | cheap + `enriched` deadlock (aborts early) + `empty` 420 |

Note 08-07 NA: `empty` completed in ~407s, **just under** the timeout. That is the margin
being fought over.

**Verified constants** (`tasks.py`; **no `ENRICHMENT_RECLASSIFY_*` overrides on the droplet**
— confirmed against `/etc/battlestats-server.env`, which sets only `ENRICH_MIN_PVP_BATTLES=500`,
`ENRICH_MIN_WR=0.0`, `ENRICH_MAX_INACTIVE_DAYS=7`): statement timeout **420s**; budget
`max(60, 1080 − 420 − 60)` = **600s**; soft **1080s**; hard **1200s**; lock **1500s**. The
invariant `budget + statement_timeout <= soft < hard <= lock` holds. Runs land at 916–968s
against the 1080s soft limit, so **raising the statement timeout has nowhere to go** — a
two-heavy-bucket pass would breach the soft limit.

#### 4b. NEW — a deadlock, not a timeout, on `enriched`

EU, 2026-08-07 09:04 UTC:

```
FAILED bucket -> enriched: OperationalError: deadlock detected
DETAIL:  Process 622779 waits for ShareLock on transaction 223211181;
         blocked by process 622106.
         Process 622106 waits for ShareLock on transaction 223208735;
         blocked by process 622779.
CONTEXT: while updating tuple (55621,6) in relation "warships_player"
```

Two concurrent writers on `warships_player` in a genuine cycle. It is a **single occurrence**
across the full 3-day journal window: `-g "deadlock detected"` returns exactly this one event.
It did not appear on 08-06 and is a distinct failure mode from the statement timeout. Per-bucket commit shortens each
transaction but *widens* the window in which the task holds locks alongside another writer,
so this may be a second-order effect of the F2 fix itself.

**Counterparties ruled out.** `enrichment_pool_maintenance_task` was the obvious suspect — it
fires at 08:17/08:22 UTC immediately before the drift run and writes the same
`enrichment_status` column — but it completed in **5.8s** (08-06) and **0.086s** (08-07),
re-queuing **0** rows both days. It cannot have held a transaction into 09:04. The recapture
sweep's 10:10/10:30/10:50 UTC slots do not overlap 08:20–09:40 either. The counterparty is
still unidentified; the daily snapshot engine remains the obvious next candidate.

### 5. Observation floor — healthy, no verdict warranted

08-07 vs 08-06 totals: `active_7d` 206,884 (flat, −31); `distinct_productive` 60,787
(−2,542); cov/7d 29.38% vs 30.61%, which is **73.7% of the achievable ceiling**
(`active_1d/active_7d` = 39.9%). `productive_rate` rose 90.95% → 92.49%. `never_observed`
59. Capture cost: `bulk_floor` 75,654 / `poll` 11,228.

NA carries the whole drop (productive −2,716) — but NA's `active_1d` fell by almost exactly
as much (−2,659), so the achievable set shrank rather than capture failing. NA cov/7d over
four days reads 31.2 / 24.5 / 28.5 / 23.5 % at a fixed config, squarely inside the documented
variance band. **Not a regression — noise.** Needs 2–3 more clean days before any verdict.

### 6. F1 second-order — journald retention lengthening as predicted

The journal now reaches **2026-08-03** (4+ days, up from the ~3.4 observed pre-fix) at 4.0 GB.
The pre-fix error volume is aging out. Re-check ~2026-08-13.

**Log-coverage note that cost time this session:** the Celery worker outcome lines live in
**journald**, not `shared/logs/django.log`. A `grep` of `django.log` / `django.log.1` for
`enrichment_reclassify_drift` returns nothing. `django.log` is the gunicorn/Django app log and
is the right source for *5xx and exception* history; the journal is the right source for
*task outcomes*. Use the correct one or a longer window silently answers about nothing.

## Validation

Re-measure recipes, all read-only.

```bash
# F4 — gap_1d buckets, day over day
ssh root@battlestats.online 'DIR=/opt/battlestats-server/shared/benchmarks/observation-floor
  for f in $(ls -1t "$DIR"/*.json | head -2); do echo "== $(basename $f)"; \
    python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(d[\"totals\"][\"gap_1d\"])" "$f"; done'

# Recapture — read `partial` BEFORE `scanned`
/recapture

# Compaction timer
ssh root@battlestats.online 'systemctl status battlestats-compact-observations.timer --no-pager | head -5
  journalctl -u battlestats-compact-observations.service --since "3 days ago" -o short-iso --no-pager | grep Compacted'

# F2 — every drift outcome the journal still holds
ssh root@battlestats.online 'journalctl -u battlestats-celery-background --no-pager -o short-iso \
  -g "enrichment_reclassify_drift_task\[.*succeeded" \
  | sed -E "s/.*succeeded in ([0-9.]+)s: (.*)/\1s | \2/"'

# F2 deadlock — is 08-07 a one-off or a pattern?
ssh root@battlestats.online 'journalctl -u battlestats-celery-background --since "3 days ago" \
  --no-pager -g "deadlock detected"'

# F1 second-order — retention
ssh root@battlestats.online 'journalctl --disk-usage
  journalctl -u battlestats-celery-background --no-pager -o short-iso | head -1'
```

## Follow-ups

1. **Make `enriched` and `empty` fit inside 420s — that is the whole defect.** Two buckets
   that each need ~420s cannot both fit, so rotation is only choosing which one to sacrifice.
   Raising the statement timeout is **not available**: runs already reach 968s of a 1080s
   soft limit. The real levers, in order of preference:
   (a) `EXPLAIN (ANALYZE, BUFFERS)` both predicates under the `--recent-hours 25` scope.
   `enriched` is `battles_json IS NOT NULL AND NOT (battles_json = '[]')` and `empty` is
   `battles_json = '[]'` — both scan a large JSON column with no index on it, while the
   cheap buckets ride `player_last_fetch_idx` plus scalar columns. An expression or partial
   index on the `battles_json` emptiness test is the obvious candidate.
   (b) Chunk the two heavy UPDATEs by id range so neither is one long statement.
   **Free natural experiment first:** 08-08 puts `enriched` at position 5 and `empty` at 6.
   If both still fail there, position is confirmed irrelevant and the query is the whole
   story. A `--rotation 0 --dry-run` run reproduces the pre-fix position-1 case on demand
   without writing.
2. **Watch the EU deadlock.** Confirmed a **single occurrence** across the 3 days the journal
   holds (`-g "deadlock detected"` returns exactly the 08-07 09:04 EU event). Pool maintenance
   is excluded as counterparty. One occurrence is not a pattern; re-check daily and only
   invest if a second appears.
3. **Re-derive the recapture LRU rotation period** against the live dormant-pool size, now
   that a full-limit pass is confirmed to complete and the 30k limit is binding.
4. **F1 second-order retention** — re-check ~2026-08-13.
5. **Observation floor** — no action; re-read after 2–3 more clean daily snapshots before
   drawing any conclusion about NA.

## Related runbooks

- `runbook-health-sweep-remediation-2026-08-06.md` — the six findings this verifies (F1–F4,
  F6); its Validation table is superseded by the findings above for F2 and F4.
- `runbook-db-disk-remediation-2026-08-05.md` — Step 1 is the compaction timer confirmed here;
  its "check the first timer fire" pickup item is now closed.
- `runbook-recapture-lapsed-players-2026-06-26.md` — the sweep confirmed here; its rotation
  period needs re-derivation per follow-up 3.
- `runbook-enrichment-pool-maintenance-2026-06-09.md` — the drift reclassify's home runbook.
