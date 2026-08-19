# Runbook — Ship list off BattleEvent, onto the daily rollup (2026-08-14)

_Created: 2026-08-14_
_Context: the `background` worker hit **100%** saturation across the 09:50–11:30 window on 2026-08-14 (35% / 43% / 90% / 100% on Aug 11/12/13/14), truncating the asia recapture sweep. The ship-list warmers were re-aggregating 45 days of raw `BattleEvent` rows on every warm, for 15 buckets x 3 realms, nightly._
_Status: **implemented**. All-view swapped to `ShipPopDailyAgg`; pct view deliberately unchanged._

## The problem in one line

The inline ship leaderboard re-derived the same immutable history every night. A
battle from 40 days ago cannot change, but every warm re-summed it.

## What changed

`compute_realm_ships_by_tier_type`'s **all-view** path now sums the
`ShipPopDailyAgg` daily rollup instead of scanning `BattleEvent` over the window.
Both of its aggregations moved:

| aggregation | was | now |
|---|---|---|
| `total_battles` (bucket denominator) | `Sum(battles_delta)` over every event in the window | `Sum(battles)` over ~45 rollup rows/ship |
| per-ship `rows` | `Sum` of 4 delta columns, grouped by ship | same 4 sums off the rollup |

The **percentile view (`wr_pct=50|25`) is deliberately untouched.** It ranks
players *within* a ship and re-pools the top X%, which a per-ship-day rollup
structurally cannot express — the same limitation `ShipPopDailyAgg`'s own
docstring already records for the skill-bracketed ship-combat aggregation. That
query needs per-`(player, ship)` window sums and is the natural candidate for a
separate columnar (Parquet/DuckDB) read-model; it is **not** in this change.

## Why the numbers are identical

`ShipPopDailyAgg` <- `PlayerDailyShipStats` <- `BattleEvent`. PDSS is rebuilt
*from* `BattleEvent` summing the same delta columns
(`incremental_battles.py:1421`, `rebuild_daily_ship_stats_for_date:1445`), and
`rollup_ship_pop_daily` sums PDSS per realm-day. Sums compose associatively, so
the window total is the same number reached by a different grouping order.

Date bases line up exactly: `_season_window_datetimes` returns UTC-midnight
`[start, end)` bounds, and PDSS dates come from `detected_at.date()`, so a
`date__gte / date__lt` filter on the rollup selects precisely the events the
datetime filter selected. Neither path filters `is_hidden`.

**Verified three ways, not one:**

1. **By construction** — the derivation chain above.
2. **End-to-end test** through the real pipeline (`test_ship_list_rollup_source.py`):
   build `BattleEvent` rows, compute via the raw scan, run the actual
   `rebuild_daily_ship_stats_for_date` + `rollup_ship_pop_daily`, compute again,
   assert the payloads are equal. Hand-written agg rows were rejected as a
   fixture — they would only prove the test author's arithmetic.
3. **On production data** — NA T10 Destroyer, 37 candidate ships, all four summed
   columns compared between the two sources: **37 identical, 0 differing**
   (2026-08-14).

The equivalence test was mutation-checked: changing `w_wins=Sum("wins")` to
`Sum("frags")` in the rollup branch fails it (win rate 20.0 vs 60.0). A test that
has never been seen to fail proves nothing.

## The coverage guard — the load-bearing safety property

**A missing rollup day does not raise. It sums to less.** That is the whole risk:
a 40-day sum served as a 45-day window, on a ranked leaderboard, with nothing in
any log. This codebase has hit that failure shape repeatedly (the `:published`
copy serving weeks-old numbers for 18 days is the same family).

So `ship_pop_rollup_covers_window(realm, mode, start_d, end_d)` requires a row for
**every** date in the window, and the compute falls back to the raw `BattleEvent`
scan otherwise, logging loudly with the exact repair command. A gap therefore
costs latency, never correctness.

Accepted limitation: a realm-day with genuinely zero battles has no rollup rows
and reads as a gap. That cannot happen on a live realm with thousands of active
players, and the failure direction is safe (slower, not wrong). The tests mirror
production by giving every window day activity rather than dodging this.

## Two coupled invariants — read before changing the window

Both exist because **gap repair only reaches inside the catch-up span**.
`rollup_ship_pop_daily_catchup` iterates `cutoff .. today` and re-rolls a date
only if it has no rows. A date that ages out of that span still missing is
**never repaired**.

1. **`SHIP_POP_ROLLUP_WINDOW_DAYS` = max(`SHIP_COMBAT_WINDOW_DAYS` 30,
   `SHIP_LEADERBOARD_WINDOW_DAYS`)** and is the catch-up default. Before this
   change the catch-up used the ship-combat 30d, i.e. the rollup was repairable
   only over 30 days while the leaderboard read 45.
2. **`SHIP_POP_ROLLUP_RETENTION_DAYS` = max(100, window + 15)**, derived rather
   than the previous flat `100`. At the roadmap's 90d window a flat 100 leaves
   only 10 days of slack; a rolled day pruned before the window ends is
   unrepairable.

**Roadmap (confirmed with the operator 2026-08-14; updated 2026-08-18): 45
until 2026-08-18, **60 since**, 90 is the target (computable ~2026-09-11, when
capture depth reaches it).** Both constants track `SHIP_LEADERBOARD_WINDOW_DAYS`
automatically, so the transitions need no code change here — but re-read this
section before altering either.

## Coverage measured on production (2026-08-14)

| realm | window | covered | table spans |
|---|---|---|---|
| na | 2026-06-30..2026-08-14 (45d) | **45/45** | 2026-06-20..2026-08-14 (56 dates) |
| eu | same | **45/45** | 2026-06-21..2026-08-14 (55 dates) |
| asia | same | **45/45** | 2026-06-20..2026-08-14 (56 dates) |

So the fast path engages immediately on deploy; no backfill window in fallback.
Note the table already spans ~56 dates even though catch-up only reached 30:
days rolled while fresh **persist** until retention prunes them. Coverage and
repairability are different properties, and only the second was broken.

## Verification after deploy

The fallback is the signal. It should never fire:

```bash
ssh root@battlestats.online 'journalctl -u battlestats-celery-background \
  --since "24 hours ago" --no-pager | grep -c "ShipPopDailyAgg incomplete"'
```

Non-zero means a realm-day is missing; the log line names the realm and window.
Repair with `rollup_ship_pop_daily_catchup(realm)` from a server shell.

Re-check coverage directly (cheap — it is a small table):

```python
from warships import data as D
from warships.models import ShipPopDailyAgg
for realm in ("na", "eu", "asia"):
    _, ws_d, we_d = D.latest_ship_snapshot_window(realm)
    n = ShipPopDailyAgg.objects.filter(
        realm=realm, mode="random", date__gte=ws_d, date__lt=we_d
    ).values_list("date", flat=True).distinct().count()
    print(realm, n, "/", (we_d - ws_d).days)
```

Expect the `background` queue's share from `warm_ships_bucket_task` to fall. It
was 2,464 task-s (n=13) of an 18,000 slot-second window on 2026-08-14.

## What this does NOT fix

- The **pct warmer** (`warm_realm_ships_pct_task`) still walks the grid serially
  on `BattleEvent` and was soft-limit-killed on 10 of 19 runs in 48h. It is
  untouched here and is the larger remaining item.
- The `background` window is oversubscribed by five unrelated families
  (`snapshot_active_players_task` 27%, top-ships 22%, `warm_hot_entity_caches_task`
  17%, `incremental_player_refresh_task` 11%, recapture 11%, reclassify 9%).
  This change trims one of them; it does not schedule them.

## Related

- `runbook-db-table-audit-2026-07-19.md` §F9.2 — where `ShipPopDailyAgg` and the
  rollup pattern came from. This change is that lever applied to a second consumer.
- `runbook-top-ships-warm-soft-limit-2026-08-12.md` — the fan-out whose cost this
  reduces.
- `runbook-recapture-soft-limit-budget-2026-08-13.md` — the sweep being starved by
  that cost; F3 is the contention finding.
- `runbook-ship-list-wr-percentile-2026-06-23.md` — the pct half, still on the raw scan.
