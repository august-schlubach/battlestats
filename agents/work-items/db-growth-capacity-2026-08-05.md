# Work item: DB growth decomposition, plateau projection, and capacity envelope

_Created: 2026-08-05_
_Author role: DBA / capacity planning_
_Context: the managed Postgres (DO `db-s-2vcpu-4gb`, PG 18.4, 80 GiB volume, storage autoscale OFF) reached `disk_used_percent` 54.98% on 2026-08-05, growing at roughly 600 MB/day against a forecast of 197 MB/day. Storage exhaustion is a read-only outage (the 2026-05-24 failure mode). This document decomposes the observed slope, projects the plateau piecewise, and expresses remaining capacity in players and retention days._
_Method: read-only. Every session opened with `SET statement_timeout='45s'; SET default_transaction_read_only=on;`. No writes, no VACUUM, no reclamation, no service changes. Queries run strictly one at a time; heavy attribution done by `TABLESAMPLE` rather than full scans, per the saturated-DB constraint (`system_load15` 3.13, `cpu_usage_iowait` 19.3%)._

## Live-configuration corrections folded into this analysis

Three production values differ from what `CLAUDE.md` and the runbooks state. The deploy script and the live `/etc` env are authoritative; the documents are stale. Each was re-verified in `server/deploy/deploy_to_droplet.sh` for this document.

| Knob | Docs say | **Live value** | Where verified | Consequence |
|---|---|---|---|---|
| `BATTLE_HISTORY_ARCHIVE_RETENTION_DAYS` | 92 | **105** | deploy script line 705; live `/etc` | Steady-state `BattleEvent`+`PDSS` scale 105/92 = 1.14x above the runbook forecast; fill completes later |
| `PRUNE_BATTLES_JSON_ENABLED` | prune "visibly working" (audit F6) | **0: has never run in production** | deploy script line 751; live `/etc` | `battles_json` has **no upper bound**; the `warships_player` ceiling rises |
| `BATTLE_OBSERVATION_COMPACT_KEEP` | code default 3; not pinned in the deploy script | **1** | live `/etc` (absent from the deploy script) | Compaction keeps one JSON generation, not three. Removes what would otherwise have been the cheapest lever |

**Correction to the 07-19 audit's F6.** That finding read the small `battles_json` weight on long-inactive players (164 MB at 181-365d, 14 MB beyond a year) as evidence "the 180d prune path is visibly working." It is not working; it has never run. The light tail is instead because those players never had `battles_json` fetched in the first place. F6's conclusion ("no large waste here") survives, but its stated reason does not, and the absence of the prune is a real unbounded-growth mechanism (see Lever 2).

## Evidence classes

Every figure below carries one of these tags. Several conclusions rest on class **D**.

| Tag | Meaning |
|---|---|
| **M** | Measured directly today by query or by the DO metrics endpoint |
| **S** | Sampled (`TABLESAMPLE`) and extrapolated; precision noted where it matters |
| **D** | Derived: a 2026-07-21 baseline reconstructed from the audit runbook's narrative, not measured at the time |
| **A** | Assumed; stated as such and never load-bearing alone |

## TL;DR

1. **The brief's ~10.3 GB "non-table gap" is a unit artifact.** `pg_size_pretty` reports GiB; `pg_database_size` is **39.02 GB decimal** (M), not 36. Against `disk_used` 46.27 GB (M) the real gap is **7.25 GB** (M), matching the prior analysis's "~7 GB of configured WAL".
2. **The gap is a ceiling, not a slope.** `wal_keep_size` = 4013 MB and `max_wal_size` = 4014 MB (M); the only replication slot (`pghoard_local`, DO's backup daemon) is active and retains 15 MB (M). `pg_wal` is structurally bounded near 8 GB, so the gap can contribute **at most ~1.5 GB more, ever**. Roughly **93%** of the observed disk slope is table growth.
3. **The 3x forecast miss is one table the forecast never modeled.** `warships_battleobservation` accounts for **~364 MB/day of the ~558 MB/day table slope** (D+M). The runbook's 197 MB/day forecast covered only `BattleEvent` + `PlayerDailyShipStats`, and those two are running slightly **under** forecast at ~121 MB/day observed.
4. **Roughly half of the observation slope is transient.** Of that 364 MB/day: ~153 MB/day is genuine new raw JSON, ~31 MB/day is skeleton heap and index, and **~181 MB/day is TOAST density refill after the 2026-07-20 `VACUUM FULL`** (S+D). That component is largely spent: the TOAST is now 84% dense, a normal churn equilibrium.
5. **The apparent acceleration (557 to 643 MB/day) is a free-space artifact and is self-limiting.** The 2026-07-15 prune left roughly 2.5 GB of reusable space inside `PDSS` + `BattleEvent`; recent inserts have been consuming it, so those two grew the *file* by ~121 MB/day while *inserting* ~165 MB/day. About 1.2 GB of credit remains, roughly a week.
6. **At the true 105-day retention the plateau is ~68 GB, about 80% of the volume**, reached around **2026-11**. Band 60 to 74 GB (71% to 88%). **80% is crossed around 2026-10-06**; 90% is not reached on the central path, but the high band asymptotes at 88% and the unmeasured player-discovery slope can carry it over 90% in 2027.
7. **The binding constraint is players, not retention.** 105-day retention is affordable with ~1.35x headroom (the affordable window is ~142 days). But the **player pool** has only **~1.11x headroom**. The reason is that two per-player stores never age out: the raw observation JSON (~18 kB/player) and, because its prune has never been armed, `battles_json` (~11 kB/player).
8. **Action is warranted.** This is no longer a "set an alert and watch" situation: a central plateau at 80% with a high band at 88% leaves no margin for a bad assumption. Ship Lever 1 (age-bound the observation JSON) and Lever 2 (arm the `battles_json` prune); together they restore the pool headroom from 1.11x to ~1.36x and drop the plateau by roughly 10 GB.

## Measured state, 2026-08-05 19:16 UTC

| Metric | Value | Class |
|---|---|---|
| `disk_total` (`/var/lib/pgsql`) | 84,173,922,304 B = **84.17 GB** | M |
| `disk_used` | 46,271,406,080 B = **46.27 GB** | M |
| `disk_used_percent` | **54.98%** | M |
| `pg_database_size(defaultdb)` | 39,024,678,591 B = **39.02 GB** (36.35 GiB) | M |
| All other databases (`umami`, `test_defaultdb`, `_dodb`, templates) | ~0.11 GB | M |
| **Non-database gap (WAL + temp + logs + backup spool)** | **7.25 GB** | M |
| `cpu_usage_iowait` | 19.3% | M |
| WAL generation rate | **54.6 GB/day** (434 MB over 686 s) | M |

### Per-table footprint

| Table | Total | Heap | Index | TOAST | Class |
|---|---|---|---|---|---|
| `warships_battleobservation` | **15.84 GB** | 0.61 | 0.55 | **14.68** | M |
| `warships_player` | **10.99 GB** | 1.72 | 0.81 | **8.45** | M |
| `warships_playerdailyshipstats` | 4.47 GB | 2.26 | 2.21 | 0 | M |
| `warships_battleevent` | 3.88 GB | 2.26 | 1.62 | 0 | M |
| `warships_snapshot` | 1.83 GB | 1.04 | 0.79 | 0 | M |
| `warships_playerachievementstat` | 1.37 GB | 0.58 | 0.79 | 0 | M |
| `warships_playerexplorersummary` | 0.31 GB | 0.21 | 0.10 | 0 | M |
| `mv_player_distribution_stats` | 0.12 GB | | | | M |
| `warships_shippopdailyagg` | 0.051 GB | | | | M |
| Everything else combined | 0.14 GB | | | | M |
| **Sum** | **38.99 GB** (reconciles with `pg_database_size` 39.02) | | | | M |

### Row inventory and window depth

| Fact | Value | Class |
|---|---|---|
| `BattleEvent` rows / earliest `detected_at` | 11,368,586 / **2026-06-13** | M |
| `PlayerDailyShipStats` rows / earliest `date` | 10,480,201 / **2026-06-13** | M |
| Live battle-history depth today | **53 days** (of a **105**-day retention) | M |
| `Snapshot` rows / earliest `date` | 10,957,977 / 2026-03-03 | M |
| `BattleObservation` rows | 3,467,534 | M |
| Distinct players ever observed | **418,175** | M |
| Total players / non-hidden | 1,091,163 / 1,046,069 | M |
| active-7d / 30d / 90d / 180d / 365d | 221,160 / 323,637 / 437,058 / 537,208 / 665,265 | M |
| Non-hidden active-365d ("reachable pool") | **631,854** | M |
| Players with `battles_json` | 433,458 (39.7%) | M |

## Findings

### F1: `warships_battleobservation` is the slope, and it was never in the forecast

Reconstructed baseline vs today, over 2026-07-22 to 2026-08-05 (14 days). The 07-21 column is class **D**: assembled from the audit runbook's Applied log (observation relation 12 to 10 GiB after the 07-20 repack; `warships_player` 14 to 9.4 GiB after the 07-21 repack, which rewrote heap, indexes and TOAST together). It is not a measurement.

| Component | 2026-07-21/22 (GB) | 2026-08-05 (GB) | Delta | MB/day | Character |
|---|---|---|---|---|---|
| `warships_battleobservation` | 10.74 **D** | 15.84 **M** | +5.10 | **364** | half durable, half post-repack refill |
| `warships_player` | 10.09 **D** | 10.99 **M** | +0.90 | 64 | durable (JSON coverage, never pruned) |
| `warships_playerdailyshipstats` | 3.44 **D** | 4.47 **M** | +1.03 | 74 | durable (105d window fill) |
| `warships_battleevent` | 3.22 **D** | 3.88 **M** | +0.66 | 47 | durable (105d window fill) |
| `warships_playerexplorersummary` | 0.21 **D** | 0.31 **M** | +0.10 | 7 | post-repack refill (`fillfactor=90`) |
| `warships_shippopdailyagg` | 0 **D** | 0.05 **M** | +0.05 | 4 | new table, plateaus at its 100d prune |
| `snapshot` / `achievements` / `mv` / rest | 3.51 **D** | 3.48 **M** | -0.03 | ~0 | at plateau |
| **Table total** | **31.21 D** | **39.02 M** | **+7.81** | **558** | |
| Non-database gap | 6.67 **D** | 7.25 **M** | +0.58 | 41 | WAL settling toward its ceiling |
| **Disk total** | **37.88 M** | **46.27 M** | **+8.39** | **599** | |

The disk figure independently corroborates the reconstruction: 558 + 41 = 599 MB/day, exactly the operator-observed slope. The baseline is derived, but the sum is not free to be wrong.

`BattleEvent` + `PlayerDailyShipStats` together contributed **121 MB/day**, *below* the runbook's 197 MB/day forecast (F3 explains why the file grew slower than the insert rate). The forecast was not wrong about its subject; it was incomplete. The observation table alone is three times the whole forecast.

- **Risk of inaction**: the largest growth driver in the system is unmodeled and unbudgeted, so every projection built on the archive-prune runbook understates the plateau by roughly 14 GB (11 GB of unmodeled tables, plus 3 GB from the 92-to-105-day retention correction).
- **Remediation**: adopt the decomposition below as the growth model; see F2 for the durable half and Levers 1 and 2 for the controls.

### F2: The observation JSON is a career-scope cost with no age bound (the durable half)

`BattleObservation` stores the raw WG `ships/stats` payload. The daily compactor (`compact_battle_observation_payloads`, Beat 12:30 UTC) NULLs that JSON on all but the latest `BATTLE_OBSERVATION_COMPACT_KEEP` observations per player (**live value 1**), plus the latest ranked-carrying observation. **There is no age predicate.** A player observed once in April 2026 and never again keeps their JSON forever.

Two independent measurements agree on the live volume:

- Sampled: 19.92% of 3,467,534 rows carry `ships_stats_json` (S, `TABLESAMPLE SYSTEM (5)`, 171,680 rows sampled) at avg 16,259 B compressed on-disk (S, `TABLESAMPLE SYSTEM (0.5)`, 16,599 rows), giving **~11.14 GB**; `ranked_ships_stats_json` on 6.3% at avg 3,255 B gives **~0.67 GB**.
- TOAST chunk count: `pg_toast_13076836` holds **5,917,220 live chunks** with **0 dead tuples** and an autovacuum 8 minutes before measurement (M). At ~2 kB/chunk that is **~11.8 GB**.

The 14.68 GB TOAST relation is therefore **~84% live**. It is not bloat; the compactor and autovacuum are working. The residual ~2.9 GB of slack is the working space that a churn of ~86,000 observations/day (S) at 16.3 kB each, written then NULLed, structurally requires. After the 07-20 repack that slack was near zero, which is why ~181 MB/day of the observed 364 was refill rather than data.

Per-player JSON retention, measured on an unbiased 0.4% player sample (4,338 players, scale x251.5):

| Activity bucket | Players sampled | Avg observations | **Avg JSON rows/player** | Never observed |
|---|---|---|---|---|
| active-7d | 841 | 13.16 | **2.015** | 7.3% |
| 8-30d | 416 | 3.88 | **1.113** | 6.0% |
| 31-90d | 455 | 0.99 | **0.862** | 22.6% |
| dormant / unknown | 2,626 | 0.04 | **0.039** | 96.1% |

Extrapolated total: ~667,000 JSON rows, consistent with the 5% sample's ~690,700.

**Reconciling this with `COMPACT_KEEP=1`.** At keep = 1 the naive expectation is ~1.0 JSON rows per observed player, but active-7d measures 2.015. The excess is fully explained and is not a defect: the compactor additionally preserves the latest **ranked**-carrying observation (a second row for the ~6% of observations that carry it, concentrated on active players), and compaction runs once daily at 12:30 UTC while this sample was taken at 19:30, so an active player observed on the 3-hourly floor cycle had accrued two or three uncompacted observations. The **settled** coefficient is the 8-30d bucket's **1.113**, which is exactly keep = 1 plus the ranked extra. Use 1.11 for players no longer being observed and 2.015 for the active-7d working set. (The dormant bucket's 0.039 is not a settled value: 96% of those players were never observed at all. Among the 31-90d players who *were* observed, the coefficient is 0.862 / (1 - 0.226) = 1.11, agreeing with the 8-30d figure.)

**The trajectory.** Because there is no age bound, the stock is (players ever observed) x their settled coefficient, and it only ever rises. Modelled at the 12-month horizon against the reachable pool (non-hidden active-365d = 631,854, M):

- active-7d working set: 211,500 x 2.015 = 426,300 rows
- everyone else ever observed: (631,854 - 211,500) x 1.11 = 466,600 rows
- players aging past 365d having once been observed, over 12 months: ~100,000 x 1.11 = 111,000 rows (**A**)

Total ~1,004,000 rows x 16.3 kB = **~16.4 GB live**, or **~21 GB of relation** once ~19% TOAST slack and the 32-day skeleton heap/index are added. Today: 11.8 GB live, 15.84 GB relation. Today's 418,175 observed players leave ~214K reachable players to go; at the implied ~4.5K newly-observed players/day (S) that phase saturates in roughly **48 days, around 2026-10**, after which growth continues at the slower rate of players entering the catalog at all.

- **Risk of inaction**: ~5 GB of further growth is already committed at today's pool size, and the stock never recedes. Every player the clan crawler discovers who later plays a single battle adds ~18 kB permanently. This is what couples disk capacity to the *player pool* rather than to retention.
- **Remediation**: Lever 1. `COMPACT_KEEP` is already at its minimum useful value, so the only remaining control on this table is an age bound.

### F3: The apparent acceleration is spent free space, and it is self-limiting

`PlayerDailyShipStats` and `BattleEvent` insert **~165 MB/day** at today's activity (M: 210K + 220K rows/day at 427 and 341 B/row including indexes), yet the files grew only **121 MB/day**. The difference is recycled space: the 2026-07-15 archive run pruned everything before 2026-06-13 under the then-32-day retention, freeing roughly 2.5 GB inside both tables. The 2026-08-01 run found no candidates (its 105d cutoff, 2026-04-18, is earlier than any surviving row), so nothing has been freed since.

About **1.2 GB of credit remains (A, by subtraction)**, roughly one week. As it is consumed the file slope rises from 121 toward the full 165 MB/day. That is the "acceleration" in the three-point disk series, and it terminates on its own.

Rows/day are **flat, not rising** (M, 12-day slices): `BattleEvent` 199K to 307K with no trend; `PlayerDailyShipStats` 183K to 285K, ~66K distinct players/day. This is pure window fill, not coverage growth.

**The snapshot delta gate held** (M): `warships_snapshot` writes **64K to 76K rows/day**, against the ~220K/day pre-gate baseline. Combined with the armed downsampler (90d daily, weekly beyond), the table is at plateau; its delta over the period is approximately zero.

#### When the window actually fills, at 105 days

The fill does **not** restart from the 2026-07-20 retention change. It continues forward from the floor the last 32-day prune left behind, which is measured: `min(date)` = `min(detected_at)` = **2026-06-13** (M). On 2026-07-20 the window therefore already held 37 days of depth, and it has been deepening one day per day since.

- Depth reaches **105 days on 2026-06-13 + 105 = 2026-09-26** (derived from the measured floor).
- The archive timer fires only on the 1st and 15th at 03:00 UTC, so the **first run with candidates is 2026-10-01** (cutoff 2026-06-18; deletes 06-13 through 06-17). The first substantial run is **2026-10-15** (cutoff 07-02; deletes 06-18 through 07-01).
- Steady state therefore oscillates between **105 and 120 days of depth**, and **120 days is the figure that meets the wall**.

(For contrast: "transition date + 105 days" would give 2026-11-02. That is the wrong construction here, because the window was never emptied at the transition; it inherited 37 days of depth. The measured floor is the correct anchor.)

- **Risk of inaction**: none; this is a correct reading, not a defect. The risk is misreading it as runaway growth and over-correcting.
- **Remediation**: none. Model the forward slope at 165 MB/day for these two tables, not 121, and size the plateau at 120 days of depth, not 92 or 105.

### F4: The non-database gap is bounded by configuration and cannot be a slope

| Setting | Value | Class |
|---|---|---|
| `max_wal_size` | 4014 MB | M |
| `wal_keep_size` | 4013 MB | M |
| `min_wal_size` | 80 MB | M |
| `max_slot_wal_keep_size` | -1 (unlimited) | M |
| `wal_level` | logical | M |
| `archive_mode` | off (DO uses pghoard streaming, not `archive_command`) | M |
| Replication slots | 1: `pghoard_local`, physical, **active**, retaining **15 MB** | M |
| `pg_stat_replication` | 1 streaming consumer (`pghoard`), no lag | M |

`pg_wal` is bounded near `wal_keep_size + max_wal_size` = ~8 GB, plus modest checkpoint overshoot. The gap sits at 7.25 GB. `max_slot_wal_keep_size = -1` is the one unbounded mechanism in this configuration, but it only bites if a slot goes inactive or falls behind; the single slot is active and 15 MB behind. **The gap can therefore contribute at most roughly 1.5 GB more to the disk, ever.**

I could not measure the gap's internal composition. `pg_ls_waldir()` is **permission denied** for `doadmin` on DO managed PG, and DigitalOcean exposes **no historical time series** for database disk: `/v2/monitoring/metrics/database/disk_usage`, `/databases/disk_usage`, `/database/disk` and `/dbaas/disk_usage` all return 404, and the `:9273` Prometheus endpoint is instantaneous only. The gap's split between `pg_wal`, the pghoard spool, PG logs (`log_min_duration_statement` = 1000 ms on a saturated box produces a great deal of log) and temp files is therefore established by subtraction and configuration, not by observation.

- **Risk of inaction**: low for disk. The real exposure is a **future inactive replication slot**, which with `max_slot_wal_keep_size = -1` would pin WAL without limit and could fill the volume independently of any table growth. This is the 2026-05-24 failure mode by a different route.
- **Remediation**: include `pg_replication_slots` (`active`, `wal_status`, retained bytes) in whatever periodic health check the operator already runs. No configuration change is proposed; DO manages these values.

### F5: WAL generation is 54.6 GB/day, roughly 140x the durable data growth

Measured across an 11m26s window: 434 MB of WAL for 686 seconds = 0.633 MB/s. This costs no disk (WAL is recycled) but is very likely a principal contributor to the current saturation, and it is consistent with `cpu_usage_iowait` at 19.3%, near the ~25% "hard trouble sign" threshold.

The shape of the write load points at whole-row UPDATEs on wide TOASTed rows. Lifetime counters (see the caveat below): `warships_player` 45.9M updates on 1.09M rows, with its TOAST showing **114.1M chunk inserts and 113.8M chunk deletes**; `warships_playerexplorersummary` 30.7M updates on 782K rows; `warships_snapshot` 59.9M updates. Each JSON-column rewrite discards and rewrites every TOAST chunk of that value, and every byte of it is WAL-logged.

**Counter caveat**: `pg_stat_database.stats_reset` is NULL, yet `warships_battleevent` reports `n_tup_ins` = 6,148,613 against `n_live_tup` = 11,368,586. Cumulative counters are therefore **not reliable for lifetime attribution**; the cause is unknown and I did not investigate further. The counters above are used only for relative shape, not for absolute accounting.

- **Risk of inaction**: this is a CPU/IO finding, not a disk finding, but it is the reason heavy analytical work must be scheduled carefully on this instance and the reason a mass-NULL lever must be throttled.
- **Remediation**: out of scope here. Noted as the natural successor investigation to the 07-19 audit's F9.

### F6: `battles_json` has no upper bound because its prune has never been armed

`prune_inactive_player_battles_json` (180-day inactivity) exists, is tested, and has a management command, but `PRUNE_BATTLES_JSON_ENABLED=0` in the deploy script (line 751) and in the live `/etc` env. **It has never run in production.**

Measured today: 433,458 players carry `battles_json` (M) at ~11.1 kB compressed each (S, 2% sample, 4.85 GB total). That population is almost exactly the observed-player pool (418,175), which is expected: the observation floor's `battles_json` refresh (`FLOOR_REFRESH_BATTLES_JSON_ENABLED=1`, prod) is what writes it. So `battles_json` tracks the same driver as F2's observation JSON and shares its unbounded shape: **~11.1 kB per player, permanently, for every player who is ever observed**.

At the 12-month reachable-pool horizon (~700K ever-observed players, **A**) that is **~7.8 GB**, against 4.85 GB today. With the prune armed it would instead plateau at the active-180d population (537,208, M) x 11.1 kB = **~5.96 GB**, and would then track activity rather than ratchet.

The immediate reclaim is small: the audit's F6 per-bucket sampling put only ~178 MB on players inactive more than 180 days today. The value of arming the prune is not the reclaim; it is converting a ratchet into a rolling window before the pool grows.

- **Risk of inaction**: ~2 GB on the plateau at today's pool, and unbounded thereafter. It also means the 07-19 audit's "no large waste here" verdict rests on a premise that is false.
- **Remediation**: Lever 2.

## Piecewise projection

**Ceiling used throughout: 90% of the volume = 75.75 GB.** All dates assume no lever ships. All figures reflect the **105-day** live retention.

### Forward slope model

| Segment | `PDSS`+`BattleEvent` | `BattleObservation` | `warships_player` | Other | Total |
|---|---|---|---|---|---|
| 08-05 to ~08-12 (free-space credit) | ~120 | ~150 | ~55 | ~11 | **~336** |
| ~08-12 to 10-15 (window fill to the 120d peak) | **165** | 150 down to 90 | ~50 | ~11 | **~340** |
| 10-15 to ~12-31 (window at equilibrium) | ~0 (oscillating +/-2.5 GB) | 90 down to 40 | ~35 | ~10 | **~110** |
| 2027 onward | ~0 | ~20, decaying | ~25 | ~10 | **~55, decaying** |

All figures MB/day. The `BattleObservation` and `warships_player` decay shapes are class **A**, anchored on the measured ceilings in F2 and F6 and the sampled ~4.5K newly-observed players/day.

### Plateau composition

| Component | Low | **Central** | High | Basis |
|---|---|---|---|---|
| Non-database gap (WAL etc.) | 7.25 | **8.0** | 8.5 | config-bounded, F4 |
| `warships_battleobservation` | 18 | **21.0** | 24 | F2; band = settled coefficient 1.0 to 1.3 and reachable-pool uncertainty |
| `PDSS` + `BattleEvent` at the **120d** peak | 18 | **20.5** | 22 | 173 MB/day-of-depth x 120 (165 measured, +5% B-tree equilibrium) |
| `warships_player` | 12.5 | **13.5** | 15 | F6: `battles_json` unbounded; band = ever-observed pool 650K to 800K |
| `warships_snapshot` | 1.9 | **1.9** | 2.0 | at plateau today |
| `playerachievementstat` | 1.5 | **1.6** | 1.7 | scales weakly with pool |
| `PES` + `mv` + rest | 0.9 | **1.0** | 1.1 | |
| **Total** | **60.1 GB** | **67.5 GB** | **74.3 GB** | |
| **% of 84.17 GB volume** | **71.4%** | **80.2%** | **88.3%** | |

**Plateau date: around 2026-11, with a decaying tail into 2027.** The battle-history window reaches equilibrium on 2026-10-15 (first substantial pruning run); the observation-JSON and `battles_json` pools saturate against the reachable player set over 2026-10 to 2027-Q1.

Compared with the previous, 92-day understanding of retention, the plateau is **+3 GB from the retention correction** (120d peak rather than 107d) and **+1.2 GB from the `battles_json` prune never having run**.

### Threshold crossings

Central path, integrating the slope model above from 46.27 GB: 7 days at ~336 MB/day (to 48.6 GB on 08-12), then ~340 MB/day until the window stops growing on 10-15. Dates carry roughly a one-week band from the slope uncertainty.

| Threshold | GB | Central path | Runbook's 197 MB/day model (for contrast) |
|---|---|---|---|
| 70% | 58.92 | **~2026-09-11** (band 09-05 to 09-19) | never (that model plateaus at ~54 GB) |
| 80% | 67.34 | **~2026-10-06** (band 09-28 to 10-18) | never |
| 90% | 75.75 | **not reached on the central path** (asymptote ~68-70 GB); see the qualification | never |
| 100% | 84.17 | not reached | never |

**Qualification on the 90% row.** 90% is not reached on the central path, and the high band asymptotes at 74.3 GB (88.3%), just short of it. But the plateau is not truly flat: the post-plateau slope below is real and unmeasured. The high band plus a residual discovery slope of ~33 MB/day crosses 75.75 GB in roughly 45 days beyond its plateau, that is around **2027-Q1**; the central path plus the same residual crosses it around **2027-Q3**. This is precisely why Follow-up 4 (measure the player-discovery rate) is load-bearing rather than housekeeping: it is the only unmeasured quantity that can put the wall back in view.

The runbook's 197 MB/day model predicted a plateau of ~54 GB (64%). It understates by roughly 14 GB: 11 GB because it modeled only `BattleEvent` + `PlayerDailyShipStats` and omitted `BattleObservation` and `warships_player`, and 3 GB because it assumed 92-day rather than the live 105-day retention.

### Steady-state post-plateau slope

Once the battle-history window oscillates on its prune calendar, the observation-JSON and `battles_json` pools have saturated against the reachable player set, and the snapshot downsampler holds its 90-day plateau, the only remaining durable growth is **net new players entering the catalog** via clan-crawl discovery, at roughly 33.4 kB of career-scope storage per player (see the capacity section). I could **not measure the discovery rate**: `Player` has no `created_at` column and the pk sequence carries no timestamp. At an assumed 1,000 new players/day (**A**) the residual slope is ~33 MB/day, about 12 GB/year. **That is the difference between a volume that lasts three years and one that needs resizing in 2027.**

## Capacity envelope: players and window size

### Measured per-unit constants

| Constant | Value | Class |
|---|---|---|
| `PlayerDailyShipStats` | 210K rows/day x 427 B/row (incl. indexes) = 89.7 MB/day | M |
| `BattleEvent` | 220K rows/day x 341 B/row (incl. indexes) = 75.0 MB/day | M |
| **Battle-history window cost** | **164.7 MB per day of retention**; **173 MB/day** after a +5% B-tree equilibrium allowance | M/A |
| Per moving player | 66K distinct players/day, so **2.62 kB per moving-player per day of retention** | M |
| Per active-7d player | 221K, so **0.78 kB per active-7d player per day of retention** | M |
| **Career-scope, at saturation** | `player` 13.5 + observation JSON 21.0 + achievements 1.6 + PES 0.35 = **36.45 GB** over 1.091M catalog players = **33.4 kB per catalog player** | M/A |
| of which observation JSON | **~18 kB/player**: the largest single per-player career cost | M |
| of which `battles_json` | **~11.1 kB/player** on the ever-observed pool, with **no prune armed** | M/S |
| Fixed / non-scaling | gap 8.0 + `mv` and misc 1.0 = **9.0 GB** | M |
| Semi-fixed, weakly scaling | snapshot 1.9 + 32d observation skeletons 1.2 = **3.1 GB** | M |

### Solve 1: maximum retention at today's player pool

Budget for the battle-history window = 75.75 - 36.45 (career) - 12.1 (fixed + semi-fixed) = **27.2 GB**.
At 173 MB per day-of-depth: peak depth **157 days**, less the ~15-day prune-calendar overshoot.

> **Affordable retention at today's pool: ~142 days.** The live **105 days is affordable, with ~1.35x headroom**. The window is not the constraint, and there is no case for shortening it on capacity grounds today.

### Solve 2: maximum player pool at 105-day retention

Let `k` scale the player pool; career, window, snapshot and skeletons all scale with `k`, the gap and matview do not.

`75.75 = 9.0 + k x (36.45 + 20.5 + 1.9 + 1.2)`, so `k = 66.75 / 60.05`:

> **k = 1.11x.** At 105d retention we can afford roughly **1.21M catalog players / 246K active-7d / 73K daily movers**. Today: 1.09M / 221K / 66K. **Headroom is 11%.** That is thin: one good quarter of audience growth consumes it.

### Solve 2b: the same, with the two levers taken

Lever 1 (age-bound the observation JSON at 105d) drops that ceiling from 21.0 to ~12.0 GB. Lever 2 (arm the `battles_json` prune) drops `warships_player` from 13.5 to ~11.5 GB. Career-scope falls to ~25.45 GB:

`75.75 = 9.0 + k x (25.45 + 20.5 + 1.9 + 1.2)`, so `k = 66.75 / 49.05`:

> **k = 1.36x**, roughly **1.48M catalog players / 300K active-7d**. Lever 1 alone gives **1.31x**.

### Solve 3: the coupling (this is the number that matters)

Growing the pool does not merely consume the window budget; it consumes the career budget first, and the career cost is the larger one. At **1.5x today's pool with no lever taken**:

`(75.75 - 9.0 - 1.5 x (36.45 + 1.9 + 1.2)) / (1.5 x 0.173) = 7.42 / 0.2595` = 28.6 days of **peak depth**, less the 15-day prune overshoot:

> **~14 days of retention.** Growing the audience by half, unmodified, would collapse battle-history depth to below where it stood before the 2026-07-20 raise. (Both Solve 1 and Solve 3 subtract the prune overshoot, so the two figures are directly comparable: 142 days today, 14 days at 1.5x the pool.)

**Answer to the operator's question, stated plainly**: 105 days of retention is comfortably affordable and is not what threatens the wall. What threatens the wall is **audience growth of more than about 11%**, because roughly 29 kB per player of raw observation JSON and `battles_json` never ages out. Both levers below convert that ratchet into a rolling window, which moves the constraint from "pool size" back to "retention", where it belongs.

## Levers, ranked

**A statement that applies to every lever below: none of them return bytes to the operating system.** `VACUUM FULL` and `pg_repack` are explicitly out of scope (the 2026-07-21 `VACUUM FULL` on `warships_player` caused a 24-minute site outage). NULLing or deleting JSON marks TOAST chunks dead; autovacuum makes that space reusable *inside the file*; `pg_database_size` and `disk_used` do **not** fall. What these levers buy is the **plateau height**, not an immediate reclaim. Given a central plateau at 80%, plateau height is exactly what is worth buying.

### Lever 1 (recommended, largest): age-bound the observation JSON

Extend `compact_battle_observation_payloads` with an age predicate: NULL `ships_stats_json` and `ranked_ships_stats_json` on every observation of a player who has not been observed within `N` days, with `N = 105` to match battle-history retention.

- **Value**: caps the `BattleObservation` ceiling at (non-hidden active-105d, ~450K) x 1.11 x 16.3 kB, about 8.1 GB live and ~12 GB of relation, against a projected 21.0 GB. That is **~9 GB off the plateau** (80.2% down to about 69%), and it restores pool headroom from 1.11x to 1.31x. Immediate effect: ~180K rows (S: the April, May and June cohorts), about 2.9 GB of live JSON converted to reusable free space.
- **Risk**: a returning dormant player loses their diff baseline permanently; WG serves only current cumulative stats, so it cannot be re-fetched. The mitigating argument is strong: the delta that baseline would produce spans more than 105 days, which the battle-history window cannot represent anyway, and the next observation re-establishes a baseline within one floor cycle. The compactor's docstring still claims `BattleEvent`'s observation FKs are CASCADE; that is stale (migration 0082 relaxed them to `DO_NOTHING` / `db_constraint=False`), and in any case this lever NULLs rather than deletes.
- **Reversible**: the setting, yes; the data, no.
- **Operational constraint**: at `iowait` 19.3% and `load15` 3.13, a mass NULL over ~180K toasted rows must be batched and throttled. The existing machinery already does this (2000 rows/transaction, inter-batch sleep, per-statement timeout). It will **transiently increase** disk and WAL before it helps. Run `--dry-run` first, then in slices.
- **Effort**: small. One predicate in `_compact_candidate_sql`, one env knob, one test.

### Lever 2 (recommended, cheapest): arm `PRUNE_BATTLES_JSON_ENABLED=1`

- **Value**: converts `battles_json` from a permanent per-player ratchet into a 180-day rolling window. Caps `warships_player` at ~11.5 GB against a projected 13.5, so **~2 GB off the plateau**, and it removes an unbounded term from the pool-scaling equation. Combined with Lever 1 the pool headroom goes 1.11x to 1.36x.
- **Cost today**: near zero. The immediate reclaim is only ~178 MB (S, from the audit's per-bucket sampling), because the light long-inactive tail exists. The point is the bound, not the bytes.
- **Risk**: a player inactive more than 180 days loses their career per-ship store until a refresh re-fetches it. This is the documented, tested, intended behaviour of a shipped code path that was simply never switched on; the risk is that "intended" was never validated against live traffic. Deploy it with `--dry-run` first to confirm the candidate count matches the ~178 MB estimate.
- **Reversible**: the flag, yes; the pruned JSON, no (but it is re-fetchable from WG on the next refresh, unlike Lever 1's diff baselines).
- **Effort**: one line in the deploy script plus a Pass update. No code.
- **Also**: reconcile the 07-19 audit's F6, which asserts this prune is working.

### Lever 3 (mandatory regardless): disk alerts

- **Value**: none in bytes; everything in outage avoidance. Set DO alerts at **70% (58.9 GB)** and **80% (67.3 GB)**. On the central path 70% arrives around 2026-09-11 and 80% around 2026-10-06. The 70% alert is the moment to re-measure; the 80% alert, if the levers have not shipped, is the moment to resize.
- **Risk**: none. **Reversible**: yes.

### Lever 4: resize the volume, or enable storage autoscale

- **Resize 80 to 100 GiB**: raises the 90% ceiling from 75.75 to ~94.7 GB, placing even the high-band plateau (74.3 GB) at 69%. **DO managed-Postgres storage can be increased but never decreased**, so this is a permanent cost commitment. Pricing not queried (**A**: roughly $0.20 to $0.25 per GiB-month for added managed-PG storage; verify in the DO console before quoting).
- **Autoscale on**: removes the wall entirely and removes the outage risk. It also removes the cost ceiling and the forcing function that has kept this data model honest; the 07-19 audit's entire yield existed because the wall was real.
- **Risk**: financial, not technical. **Reversible**: autoscale yes; the resize it performs, no.
- **Verdict**: with a central plateau at 80%, this has moved from "optional insurance" to a **reasonable pairing with Levers 1 and 2**. It is not a substitute for them: growth that is unbounded in *shape* is not fixed by more disk.

### Lever 5 (reserve, not recommended): battle-history retention 105 to 60 days

- **Value**: 45 days x 173 MB = **~7.8 GB** off the peak. Comparable to Lever 1, but paid for in product rather than in dead data.
- **Risk**: product regression. The depth was raised deliberately, the parked 90d-window UI branch depends on it, and Solve 1 shows the window is affordable at 142 days. Spending it is spending the wrong budget.
- **Reversible**: the setting, yes; the pruned rows exist in the cold CSV archives but there is no supported live re-insertion path.
- **Verdict**: hold in reserve. If the player pool grows 50% without Levers 1 and 2, it becomes forced, and brutally so (Solve 3).

### Lever 6 (marginal): prune the other never-pruned `warships_player` JSON columns

`tiers_json` 0.68 GB, `ranked_json` 0.69, `achievements_json` 0.63, `randoms_json` 0.54 (S, 2% sample) are kept forever on every player, and unlike `battles_json` they have no prune path at all. The long-dormant share is perhaps 25%, so **~0.6 GB**. Low value at high write cost on the hottest table in the system. Noted for completeness; not recommended.

### Explicitly excluded

Any `VACUUM FULL`, any `pg_repack`, any operation that rewrites a relation. The 2026-07-21 incident is dispositive: `lock_timeout` bounds lock *acquisition*, not lock *hold*, and `warships_player` is the first hop of every request. The current TOAST density (84% on the observation table, effectively 100% on `warships_player`) means there is very little to reclaim in any case.

## How to re-measure

```bash
cd /home/august/code/battlestats/server && set -a && source .env && source .env.secrets && set +a
PGPASSWORD="$DB_PASSWORD" psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require" \
  -P pager=off -c "SET statement_timeout='45s'; SET default_transaction_read_only=on;" -c "<query>"
```

Run these one at a time; the instance saturates around `load15` 2.

**Live configuration first.** Do not trust `CLAUDE.md` or the runbooks for any of these; read the deploy script and the droplet `/etc` env:
```bash
grep -nE "BATTLE_HISTORY_ARCHIVE_RETENTION_DAYS|PRUNE_BATTLES_JSON_ENABLED|BATTLE_OBSERVATION_COMPACT_KEEP|FLOOR_REFRESH_BATTLES_JSON_ENABLED" \
  server/deploy/deploy_to_droplet.sh
# then on the droplet: grep -E '^(BATTLE_|PRUNE_|FLOOR_)' /etc/battlestats-server.env
```

**Footprint and reconciliation**
```sql
SELECT c.relname, pg_size_pretty(pg_total_relation_size(c.oid)) total,
       pg_size_pretty(pg_relation_size(c.oid)) heap,
       pg_size_pretty(pg_indexes_size(c.oid)) idx,
       pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid),0)) toast,
       pg_total_relation_size(c.oid) total_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','m')
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 25;

SELECT pg_database_size(current_database());   -- decimal bytes; pg_size_pretty reports GiB
```

**Insert rates (bounded slices only)**
```sql
SELECT (detected_at AT TIME ZONE 'UTC')::date d, count(*) FROM warships_battleevent
WHERE detected_at >= now() - interval '12 days' GROUP BY 1 ORDER BY 1;   -- uses battle_event_detected_brin

SELECT date d, count(*) rows, count(DISTINCT player_id) players
FROM warships_playerdailyshipstats WHERE date >= current_date - 12 GROUP BY 1 ORDER BY 1;

SELECT date, count(*) FROM warships_snapshot WHERE date >= current_date - 12 GROUP BY 1 ORDER BY 1;
```

**Window depth and the prune calendar**
```sql
SELECT (SELECT min(date) FROM warships_playerdailyshipstats) pdss_min,
       (SELECT min(detected_at) FROM warships_battleevent) be_min;
-- depth = today - min(date). Full depth = min(date) + RETENTION_DAYS (105 live).
-- Timer fires on the 1st and 15th at 03:00 UTC, so peak depth = retention + up to 15 days.
```

**Observation JSON: the growth driver**
```sql
-- composition (cheap; IS NOT NULL does not detoast)
SELECT count(*) sampled, count(*) FILTER (WHERE ships_stats_json IS NOT NULL) with_ships,
       count(*) FILTER (WHERE ranked_ships_stats_json IS NOT NULL) with_ranked
FROM warships_battleobservation TABLESAMPLE SYSTEM (5);

-- compressed on-disk sizes (detoasts; keep the sample small)
SELECT count(*) sampled_rows, count(ships_stats_json) n_ships,
       round(avg(pg_column_size(ships_stats_json))) avg_ships_bytes,
       count(ranked_ships_stats_json) n_ranked,
       round(avg(pg_column_size(ranked_ships_stats_json))) avg_ranked_bytes
FROM warships_battleobservation TABLESAMPLE SYSTEM (0.5);

-- independent cross-check: live TOAST chunks (~2 kB each) and autovacuum health
SELECT s.relname, s.n_live_tup, s.n_dead_tup, s.last_autovacuum, s.autovacuum_count,
       pg_size_pretty(pg_relation_size(s.relid)) sz
FROM pg_stat_all_tables s WHERE s.schemaname='pg_toast'
ORDER BY pg_relation_size(s.relid) DESC LIMIT 5;

-- per-player JSON retention by activity bucket.
-- The 8-30d bucket is the SETTLED coefficient; active-7d is inflated by intra-day
-- accrual since the 12:30 UTC compaction plus the preserved latest-ranked row.
WITH pl AS (SELECT id, last_battle_date FROM warships_player TABLESAMPLE SYSTEM (0.4)),
     j AS (SELECT p.id,
             CASE WHEN p.last_battle_date >= current_date - 7 THEN 'a_active7'
                  WHEN p.last_battle_date >= current_date - 30 THEN 'b_30d'
                  WHEN p.last_battle_date >= current_date - 90 THEN 'c_90d'
                  ELSE 'd_dormant' END bucket,
             (SELECT count(*) FROM warships_battleobservation o WHERE o.player_id=p.id) n_obs,
             (SELECT count(*) FROM warships_battleobservation o
               WHERE o.player_id=p.id AND o.ships_stats_json IS NOT NULL) n_json
           FROM pl p)
SELECT bucket, count(*) players, round(avg(n_obs),2) avg_obs, round(avg(n_json),3) avg_json,
       count(*) FILTER (WHERE n_obs=0) never_observed
FROM j GROUP BY 1 ORDER BY 1;

SELECT count(*) FROM (SELECT DISTINCT player_id FROM warships_battleobservation) z;  -- ~15 s
```

**Player pool and `battles_json` coverage (the capacity denominators)**
```sql
SELECT count(*) total,
       count(*) FILTER (WHERE last_battle_date >= current_date - 7)   active_7d,
       count(*) FILTER (WHERE last_battle_date >= current_date - 30)  active_30d,
       count(*) FILTER (WHERE last_battle_date >= current_date - 90)  active_90d,
       count(*) FILTER (WHERE last_battle_date >= current_date - 180) active_180d,
       count(*) FILTER (WHERE NOT is_hidden AND last_battle_date >= current_date - 365) reachable,
       count(*) FILTER (WHERE battles_json IS NOT NULL) with_battles_json,
       count(*) FILTER (WHERE is_hidden) hidden
FROM warships_player;

-- per-column JSON weight (detoasts; 2% is the practical ceiling on this box)
SELECT count(*) sampled, count(battles_json) n_battles,
       sum(pg_column_size(battles_json)) sum_battles,
       sum(pg_column_size(tiers_json))   sum_tiers,
       sum(pg_column_size(ranked_json))  sum_ranked,
       sum(pg_column_size(achievements_json)) sum_ach,
       sum(pg_column_size(randoms_json)) sum_randoms
FROM warships_player TABLESAMPLE SYSTEM (2);
```

**WAL and the gap**
```sql
SELECT name, setting, unit FROM pg_settings
WHERE name IN ('max_wal_size','min_wal_size','wal_keep_size','max_slot_wal_keep_size','wal_level','archive_mode');

SELECT slot_name, slot_type, active, wal_status,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) retained_wal
FROM pg_replication_slots;

-- WAL generation rate: two samples, subtract
SELECT now(), pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0');
```
`pg_ls_waldir()` is permission-denied for `doadmin`; the WAL directory size cannot be read directly.

**Host disk (instantaneous only; no history exists)**
```bash
TOKEN=$(grep -oP 'access-token:\s*\K\S+' ~/.config/doctl/config.yaml | head -1)
CREDS=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.digitalocean.com/v2/databases/metrics/credentials")
HOST=db-postgresql-nyc3-11231-do-user-8591796-0.m.db.ondigitalocean.com
curl -sk -u "USER:PASS" "https://$HOST:9273/metrics" | grep -E '^(disk_used|disk_total|disk_used_percent|cpu_usage_iowait)'
```

## Validation

- All queries run read-only against `defaultdb` on 2026-08-05 between 19:16 and 19:35 UTC, `statement_timeout` 45 s, `default_transaction_read_only=on`. No writes, no VACUUM, no locks held. Nothing was restarted or reconfigured.
- **Measured (M)**: all per-table sizes, row counts, per-day insert rates, window bounds, distinct observed players (418,175, exact), player-pool counts, `battles_json` coverage, WAL settings, replication-slot state, WAL generation rate, the DO `:9273` disk figures, and the three live env values in the corrections table (deploy script re-verified for this document).
- **Sampled and extrapolated (S)**: observation JSON composition (`TABLESAMPLE SYSTEM (5)`, 171,680 rows) and per-value sizes (`SYSTEM (0.5)`, 16,599 rows); player JSON column sizes (`SYSTEM (2)`, 21,870 rows); per-player JSON retention by activity bucket (`SYSTEM (0.4)`, 4,338 players). The observation-JSON total was **cross-validated by two independent methods** agreeing within 6%: sample-and-extrapolate gives 11.81 GB, and 5,917,220 live TOAST chunks at ~2 kB gives ~11.8 GB.
- **Derived (D)**: the entire 2026-07-21 baseline column in F1 is reconstructed from the audit runbook's Applied log, including a `warships_player` TOAST reclaim (roughly 11 to 7.1 GiB) that the runbook never states directly and that I inferred from the reported 14 to 9.4 GiB relation change. Treat the per-table delta attribution as derived, not measured. Its corroboration is that the per-table sum (558 MB/day) plus the gap delta (41 MB/day) reproduces the independently observed disk slope (599 MB/day) without adjustment.
- **Assumed (A)**: the forward decay shapes of the observation-JSON and `warships_player` slopes; the ~1.2 GB of remaining prune free-space credit; the +5% B-tree equilibrium density allowance; the ~100K/year rate at which observed players age past 365 days; DO storage pricing; the new-player discovery rate (unmeasurable today, `Player` has no `created_at`).
- **The F4 argument stands independently of the derived baseline.** That `pg_wal` is config-bounded near 8 GB rests only on measured settings and measured slot state, not on any reconstruction.
- **Could not measure, stated rather than guessed**: `pg_ls_waldir()` permission denied; no DigitalOcean historical disk time series exists for database clusters (four endpoint shapes tried, all 404), so the operator's three hand-sampled percentages remain the only history; the gap's internal split (WAL vs pghoard spool vs logs vs temp) is bounded by subtraction and configuration only; `pg_stat_user_tables` cumulative counters are unreliable (`n_tup_ins` < `n_live_tup` on `warships_battleevent` with `stats_reset` NULL, cause unknown).
- **Resolved during review**: `BATTLE_OBSERVATION_COMPACT_KEEP` is **1** in the live `/etc` env (operator-verified), not the code default 3. The measured active-7d coefficient of 2.015 is reconciled with keep = 1 in F2. The plateau does not depend on this value, because the ceiling is built from the measured settled coefficient (1.11) rather than from the configured keep.

## Follow-ups

1. **Set the DO disk alerts at 70% and 80%.** Independent of every other decision here. 70% arrives around 2026-09-11.
2. **Reconcile the stale documentation.** `CLAUDE.md` and `runbook-battle-history-archive-prune-2026-06-17.md` both say 92-day retention; live is **105**. The archive runbook's "~197 MB/day, DB lands at ~50 GB" forecast and its "full 92d depth ~2026-09-18" should read **~65-68 GB** and **105d depth on 2026-09-26, first pruning run 2026-10-01, first substantial run 2026-10-15**. The 07-19 audit's F6 should be corrected: the `battles_json` prune is **not** working; it has never been armed.
3. **Pin `BATTLE_OBSERVATION_COMPACT_KEEP` in `deploy_to_droplet.sh`.** It is currently a hand-set `/etc` value with no deploy-script pin: the same trap shape the 07-19 audit's item 10 addressed for the other observation gates. Pin it at 1 to match live.
4. **Ship Lever 2** (`PRUNE_BATTLES_JSON_ENABLED=1`), then **Lever 1** (observation JSON age bound). Together they take the plateau from ~80% to ~69% and pool headroom from 1.11x to 1.36x.
5. **Add a `created_at` to `Player`** (or surface the discovery rate from the crawl journals). Without it the post-plateau slope cannot be measured, only assumed, and that slope determines whether the 80 GiB volume lasts a year or three.
6. **Re-measure at 70% (around 2026-09-11).** Re-run the per-table footprint and the observation-JSON composition. The predictions to test: `PDSS` + `BattleEvent` stop growing after 2026-10-15, and the observation-JSON slope falls below 60 MB/day.
7. **Watch the replication slot.** `max_slot_wal_keep_size = -1` means an inactive slot can fill the volume independently of any finding in this document.

## Related documents

- `agents/runbooks/runbook-db-table-audit-2026-07-19.md`: the 38 GB topline this diffs against, and the Applied log the 07-21 baseline is reconstructed from. Its F5 (observation row retention) is the mechanism F2 extends; its F6 needs the correction noted above.
- `agents/runbooks/runbook-battle-history-archive-prune-2026-06-17.md`: the retention mechanism, and the forecast plus retention figure this document corrects.
- `agents/runbooks/ops-infra-resources.md`: instance sizing.
- `agents/runbooks/archive/runbook-db-cpu-saturation-2026-05-24.md`: the read-only outage the disk ceiling exists to prevent.
