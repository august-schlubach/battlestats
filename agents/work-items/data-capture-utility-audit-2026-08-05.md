# Data-Capture Utility Audit (delta pass over `runbook-db-table-audit-2026-07-19`)

_Created: 2026-08-05_
_Author role: DBA / platform_
_Context: 16 days after the 2026-07-19/21 DB table audit shipped its F-series levers. Managed PG (`db-s-2vcpu-4gb`, PG 18) disk at **54.98% of the 80 GiB hard wall, autoscale OFF**, growing ~600 MB/day; `system_load15` 3.13 on a 2-vCPU box. `pg_database_size` = **36 GB**; ~8 GB of the ~44 GB on-disk is WAL/temp, not tables. The question this audit answers is not "how big is it" but **"is what we capture earning its storage and its write cost."**_
_QA: DB figures are live-measured 2026-08-05 19:16–20:40 UTC, read-only (`statement_timeout` 45–60 s, `default_transaction_read_only=on`), one query at a time on a saturated box. Sampled figures use `TABLESAMPLE SYSTEM (0.15–2)` and are labelled **est.**. `pg_stat_database.stats_reset` is NULL; `pg_stat_statements` was reset **2026-07-09**, so every `pg_stat_statements` number is a **27-day** total, not lifetime. `pgstattuple_approx` cannot read `pg_toast` on DO managed PG — TOAST free space is derived by difference and labelled as such._
_**Env provenance: every production env value cited here was read from the live droplet (`/etc/battlestats-*.env`), not inferred from a code default or from absence in the deploy script.** An earlier draft inferred `BATTLE_OBSERVATION_COMPACT_KEEP=3` from its absence in `deploy_to_droplet.sh` and was **wrong** — prod carries `=1` as a durable manual `/etc` edit. That error, its correction, and the re-derivation it forced are recorded in G2; the same verification was then re-run across every other env claim (Validation)._
_**Scope note: battle-history retention is a fixed product constraint, not a variable.** See G7. No retention reduction is proposed anywhere in this document._

## Purpose

A **delta** ledger against `runbook-db-table-audit-2026-07-19.md` (F1–F11): which shipped levers held in steady state, which drifted, which prior verdicts must be reversed, and — the operator's actual question — **which capture streams are not earning their role**. Findings use a **G-prefix** so they never collide with the F-series; each G-finding names the F-finding it updates.

**Nothing here is a code change. Nothing here was committed. No reclamation operation is proposed** (standing rule in G2).

---

## TL;DR

**Levers that held** (all verified, not assumed):

- **F3.2 delta-gated Snapshot writes — held, and beat forecast.** ~**78K rows/day** (est., range 43K–105K) against the 220–226K/day baseline: **−65%**. Zero-information rows collapsed from **69% → ~2%** of what is written.
- **F3.1 Snapshot downsampler — held.** 1.70 → **1.75 GB** in 16 days (+3%); the June/July bulge starts ageing out of the 90d window ~2026-08-30, so it will *decline*. Post-gate plateau lands at **1.2–1.4 GB**, well under F3's pre-gate 3.7 GB forecast.
- **F5 BattleObservation *row* retention — held.** Fully-empty poll rows down from **19% → ~0.8%** (est.); `n_tup_del` = 2,979,298.
- **F9.2 `ShipPopDailyAgg` — held.** 48 MB / 175K rows; the nightly ~34 s/realm PDSS grouped scan is **gone** from the top-20 `pg_stat_statements`.
- **F8 `checkpoints*` — held.** Absent from `pg_class`.
- **F9.4 tier-type JSON pass — superseded.** Deleted from the code outright (`e1ca962`, 2026-07-27); the 79 residual `pg_stat_statements` calls all predate it. One orphan test reference survives (G1).

**The headline drift — a broken job, not a config choice:**

- **G2 — the nightly BattleObservation payload compaction fails on every run.** Four consecutive nights in the journal window (Aug 02, 03, 04, 05), **4 of 4 failures**, by *two* mechanisms: on Aug 02 the candidate query was killed by the job's own **180 s `statement_timeout`** (3m14s in, zero rows compacted); on Aug 03/04/05 the batch loop was killed by Celery's **540 s soft time limit** at exactly `start + 540 s`. Configuration is correct (`KEEP=1`, `MIN_AGE_HOURS=0`, `MAX_ROWS=0`, all verified live) — the job simply never gets to finish. It NULLs ~**86K rows/day** against ~**94K new JSON rows/day**: a standing **~8K rows/day (~116 MB/day) leak**, plus a measured **~2.1 GB of standing residue** (est.). Two independent measurements agree on that number to within 3%.

**Streams not earning their keep, worst first:**

1. **Player achievements — ~1.9 GB with zero product readers.** `PlayerAchievementStat` (1.3 GB) + `Player.achievements_json` (~596 MB est.), written by the crawl and the incremental refresh, read by **nothing**: no view, no URL, no serializer field, no frontend file, and both call sites discard the return value (verified by reading them).
2. **`warships_player` write amplification — ~1.32 TB of dirtied buffers in 27 days on a 10 GB table.** `floor_gate_skipped_at` alone dirties **457 GB** to stamp a cooldown clock; Django full-row `.save()` variants add **717 GB**. Only **11.2%** of Player updates are HOT.
3. **`_get_hot_player_ids`'s cross-table `player_score` sort — 5,250 minutes of DB CPU in 27 days (~3.2 h/day), the #1 consumer in the database.** F9.1 fixed the clan half of this warmer and never the player half.
4. **`BattleEvent` seq scans — 25.8 billion tuples in 27 days**, and they grow with the committed window. F9.3 was never done.

**F11 verdict, re-scoped: REVERSED — the 14 Phase-7 columns on `BattleEvent` are genuinely write-only and should go.** ~637 MB today, **~1.26 GB at full 105d depth**. Confirmed against *three* consumers, not one: the read path uses 8 delta columns; PDSS carries all 14 analogues and is archived by the same job; and — the check that decides it — **`rebuild_daily_rollup` never reads them either** (it reconstructs only the 8 core columns). Nothing anywhere consumes `BattleEvent`'s copy.

**The capacity framing that matters most.** Retention is a **fixed 105 days** by product decision (G7: 90d is the product target, 45d/60d are waypoints, and the twice-monthly prune needs ~15d of slack). So the **+7.8 GB** landing by late September is a **committed cost, not a lever**. This audit's levers return **~5.7 GB** (G2 2.1 + G4 1.9 + G3 1.26 + G6 0.42). **That leaves a ~2 GB gap between what is committed and what this audit can fund** — plan for it rather than discover it in September.

---

## Composition today (measured)

| Table | heap | TOAST | idx | total | est. rows |
|---|---|---|---|---|---|
| `warships_battleobservation` | 578 MB | **13 GB** | 525 MB | **15 GB** | 3.39M |
| `warships_player` | 1,643 MB | **7,675 MB** | 776 MB | **10 GB** | 1.09M |
| `warships_playerdailyshipstats` | 2,154 MB | — | 2,111 MB | 4,266 MB | 10.47M |
| `warships_battleevent` | 2,159 MB | — | 1,543 MB | 3,702 MB | 11.06M |
| `warships_snapshot` | 994 MB | — | 754 MB | 1,748 MB | 10.89M |
| `warships_playerachievementstat` | 555 MB | — | 750 MB | 1,305 MB | 4.85M |
| `warships_playerexplorersummary` | 203 MB | — | 92 MB | 295 MB | 0.78M |
| `mv_player_distribution_stats` | 66 MB | — | 51 MB | 117 MB | 0.82M |
| `warships_clan` | 36 MB | — | 33 MB | 70 MB | 0.12M |
| `warships_shippopdailyagg` *(new)* | 30 MB | — | 18 MB | 48 MB | 0.18M |
| `warships_shiptopplayersnapshot` | 15 MB | — | 22 MB | 37 MB | 0.10M |
| everything else combined | — | — | — | < 25 MB | — |

New objects since the 07-19 audit: `warships_shippopdailyagg` (F9.2, migration 0085) and `warships_feedback` (80 kB, 2 rows). `checkpoints*` are gone (F8 applied). No unexplained relation is present.

---

## Findings

### G1: The shipped levers — hold/drift ledger

Updates **F3.1, F3.2, F4, F5, F7, F8, F9.2, F9.4**.

| Lever (F-ref) | Verdict | Evidence |
|---|---|---|
| **F3.2** Snapshot delta gate | **HELD — beat forecast** | est. **43K–105K rows/day**, 10-day mean **~78K** (2% sample ×50) vs the 220–226K baseline = **−65%**. Zero-interval share of *written* rows **~2%** (was 69%); the residual is the spec's deliberate carry-forward window-edge seed, not gate leakage. `SNAPSHOT_DELTA_GATE_ENABLED=1` verified live. |
| **F3.1** Snapshot downsampler | **HELD** | 1.70 → **1.75 GB** in 16 d. `n_tup_del` 182,276 (126,188 first run + ~56K across the 07-27 / 08-03 weekly runs). Small deletes are expected: the 90d cutoff (~2026-05-07) still sits **before** the dense June/July region. Plateau: 90 d × 78K/day ≈ **7.0M rows ≈ 1.2–1.4 GB**. `SNAPSHOT_DOWNSAMPLE_ENABLED=1`, `RETENTION_DAYS=90` verified live. |
| **F4** `battle_type` / `last_fetch` drop | **HELD** | Columns absent from `models.py:221–239`; migration 0083 applied. |
| **F5** Observation **row** retention | **HELD** | `n_tup_del` = **2,979,298** (1,965,056 first run + ~1.01M since). Fully-empty polls now **0.8%** of rows (est.), down from 19%. `ROW_RETENTION_ENABLED=1`, `DAYS=32`, `EMPTY_RETENTION_DAYS=7` verified live. **This is the row tier; the *payload* tier is broken — see G2.** |
| **F7** Dead-index drop (0082) | **HELD — no regression; new dead weight accrued** | No table shows a seq-scan pattern attributable to the drop (G6). ~422 MB of *newly* dead/redundant index has accumulated. |
| **F8** `checkpoints*` drop | **HELD** | Not present in `pg_class`. |
| **F9.2** `ShipPopDailyAgg` | **HELD** | Live (48 MB / 175K rows, 438K ins / 263K del — the delete-and-replace rollup is running). The PDSS ship-pop grouped scan no longer appears in the top-20 statements by `total_exec_time`. |
| **F9.4** tier-type JSON pass | **SUPERSEDED (stronger than the fix)** | `_TIER_TYPE_POPULATION_SQL` **deleted** in `e1ca962` (2026-07-27, v4.5.5). `pg_stat_statements` holds 79 calls / 675 min, all between the 07-09 reset and the 07-27 deletion (≈4.4 calls/day — the 72 h rebuild floor was *not* holding at ~1/realm/3 d; moot now). **Orphan:** `warships/tests/test_player_correlation_warm.py:40` still patches `_TIER_TYPE_POPULATION_SQL`, a symbol that no longer exists in `data.py`. |
| **F2** `warships_player` repack | **CORRECTLY NOT REPEATED** | Heap 1,643 MB, 25,774 dead of 1.09M live (~2%), 1,671 autovacuums, last 2026-08-05. Self-maintains exactly as the 07-21 incident note predicted. **Do not repack.** |

- **Risk of inaction**: none for the held levers. The live risk is complacency — the delta-gate and downsampler successes are more than cancelled by G2, and the topline disk number hides that.
- **Remediation**: fix the orphan test reference when that file is next touched.

---

### G2: The BattleObservation payload compaction fails on every run — two timeouts, 4 of 4 nights

Updates **F5** and §3/§7 of `runbook-data-lifecycle-architecture-2026-06-21.md`.

**Correction first, because an earlier draft of this audit got it wrong.** That draft claimed prod ran keep-latest-3 because `BATTLE_OBSERVATION_COMPACT_KEEP` is absent from `deploy_to_droplet.sh` and the code default is `3`. **That inference was invalid and the claim was false.** The live droplet carries:

```
BATTLE_OBSERVATION_COMPACT_ENABLED="1"
BATTLE_OBSERVATION_COMPACT_KEEP=1
```

Absence from the deploy script does not imply the code default is in force — `set_env_value` only rewrites keys it manages, so durable manual `/etc` edits survive deploys. The 07-19 audit had already recorded this correctly ("code 3 vs prod 1 — deploy script is authoritative"). **Configuration is right; the lever that draft proposed does not exist.** What follows is the re-derivation, and it is a better finding.

**The size picture.** The 2026-07-20 `VACUUM (FULL, ANALYZE)` took the relation 12 → **10 GB**. Sixteen days later it is **15 GB** (heap 578 MB, indexes 525 MB, **TOAST 13 GB**):

| Component | Value | Basis |
|---|---|---|
| Rows carrying `ships_stats_json` | **~693K** (20.0% of 3.47M) | est., 2% sample |
| Live `ships_stats_json` bytes | **~9.2 GB** (~14.5 kB/row on disk) | est., 0.15% sample |
| Live `ranked_ships_stats_json` bytes | **~0.5 GB** (~219K rows) | est. |
| **Live JSON total** | **~9.7 GB** | est. |
| **TOAST relation free/dead space** | **~3.3 GB** | **derived by difference**; `pgstattuple` cannot read `pg_toast` here |

Live payload went ~9.3 → ~9.7 GB; the other ~3.3 GB is the file's high-water mark refilling with dead TOAST chunks. **That part is normal and self-correcting** — the space is reused by subsequent inserts. It is not the finding.

**The finding is that ~2.1 GB of the *live* payload should not be live.** With `KEEP=1` a player should carry exactly one JSON generation (plus the latest ranked-carrying row, protected separately by the compaction SQL's `rrn = 1` rule). Measured over 700 players drawn from a page sample and corrected for size-bias by inverse-probability weighting (`E[X] = avg(X/k) / avg(1/k)`):

| Quantity | Value |
|---|---|
| Unbiased mean JSON generations per player | **1.65** (two independent draws bracketed 1.56–1.65) |
| Est. distinct players carrying JSON | ~693K / 1.65 ≈ **420K** |
| **Unbiased mean *residue* per player** — not the player's latest, >24 h old, not ranked-protected | **0.354** |
| **Est. residue rows** | ~420K × 0.354 ≈ **149K** |
| **Est. residue bytes** | 149K × 14.5 kB ≈ **~2.1 GB** |

Decomposition of the raw sample (2,015 JSON rows over 700 players; 1,315 beyond each player's latest): **155 (11.8%) < 24 h old** — normal intra-day accumulation between nightly runs; **363 (27.6%) > 24 h and ranked-carrying** — partly the legitimate `rrn = 1` protection; **797 (60.6%) > 24 h, not latest, not ranked-protected** — pure residue. Every one of those 797 was an eligible candidate on the last nightly run and survived it.

**Why. Read from the droplet journal, not inferred.** `prune_battle_observations_task` starts at 12:30 UTC daily on the `background` queue and **failed on every run in the journal window (4 of 4)** — by two distinct mechanisms:

```
Aug 02 12:30:14  Task prune_battle_observations_task[6a075d10…] received
Aug 02 12:33:14  ERROR … raised unexpected:
                 OperationalError('canceling statement due to statement timeout')
Aug 03 12:30:00  Task … received
Aug 03 12:39:00  WARNING  Soft time limit (540s) exceeded for prune_battle_observations_task
Aug 03 12:39:00  ERROR    … raised unexpected: SoftTimeLimitExceeded()
Aug 04 12:30:00 / 12:39:00   … same
Aug 05 12:30:00 / 12:39:00   … same (release 20260805014505 — not release-specific)
```

1. **Aug 02 — the candidate query itself timed out.** Dead 3m14s in with `canceling statement due to statement timeout`, i.e. the job's own `BATTLE_OBSERVATION_COMPACT_STATEMENT_TIMEOUT` (180 s default, unset in `/etc`) killed the candidate scan. That scan is a full-table **double window-function** pass over 3.47M rows (`_compact_candidate_sql`). When it dies, the run compacts **zero rows**.
2. **Aug 03/04/05 — the batch loop was guillotined.** `prune_battle_observations_task` carries the default `TASK_OPTS` (`tasks.py:22–24`): **`soft_time_limit = 540`, `time_limit = 600`**. It dies at exactly `start + 540 s`, mid-loop — sometimes inside `cur.execute` (`incremental_battles.py:1686`), sometimes inside `time.sleep(sleep_between_batches)` (`:1697`). It does real work, then is cut off.

**The throughput arithmetic closes independently.** From `pg_stat_statements`, the compaction UPDATE shows **1,172 calls / 152 min / 82.6 GB dirtied** over 27 days. At `BATCH_SIZE=2000` that is ≈ **86K rows NULLed per day**. New observations insert at 2,537,063 / 27 d ≈ **94K/day**, each writing a payload that makes its predecessor stale. **Deficit ≈ 8K rows/day ≈ ~116 MB/day of TOAST.** Over the ~18 days since the repack that is ~145K rows — matching the independently sampled 149K residue to within 3%. Two different methods, same answer.

Where the 540 s goes on a *surviving* night: ~43 batches × 7.8 s mean UPDATE ≈ 357 s, plus 43 × 0.5 s sleep ≈ 22 s, leaving ~160 s for the candidate scan — which is a **fixed cost paid once per run regardless of how many rows the run then processes**, and which on Aug 02 exceeded even its own 180 s ceiling. The fixed cost is large and the variable budget is what gets truncated.

- **Risk of inaction**: a permanent ~116 MB/day leak of live TOAST on the largest table in the database, plus a standing ~2.1 GB that never clears — compounding with the committed +7.8 GB from G7 against an 80 GiB wall. Worse, it is **invisible**: the task logs an ERROR nightly and nothing escalates, and the symptom (a growing table) reads as "coverage growth", which is exactly how the lifecycle runbook currently describes it.
- **Remediation** (in order; none is a reclamation op):
  1. **Move the compaction off the Celery worker slot onto a systemd timer**, exactly as `archive_battle_history` and the three retention jobs already are. The precedent *and the rationale* are already written down in `runbook-battle-history-archive-prune-2026-06-17.md`: *"the first-run backlog deletes over many minutes — too long for a Celery soft-time-limit / worker slot."* The `prune_battle_observations` management command already exists and self-gates on `BATTLE_OBSERVATION_COMPACT_ENABLED`, so this is a deploy-script heredoc plus retiring the Beat entry. **Highest-return, lowest-risk item in this audit.**
  2. **Raise `BATTLE_OBSERVATION_COMPACT_STATEMENT_TIMEOUT` above 180 s** regardless of (1) — the candidate scan demonstrably exceeds it on a loaded night, and when it does the run yields nothing at all. This alone converts zero-yield nights into partial-yield nights.
  3. **Interim, zero-deploy**: raise `BATTLE_OBSERVATION_COMPACT_BATCH_SIZE` (currently the 2000 default) and drop `BATTLE_OBSERVATION_COMPACT_SLEEP` from 0.5. Because the candidate scan is a fixed per-run cost, larger batches convert the same wall clock into materially more rows. Narrows the deficit; will not clear the backlog alone.
  4. **Do not repack.** The ~3.3 GB of TOAST free space will be reused by new inserts once compaction converges — that is the correct outcome. If a one-off on-disk reclaim is ever justified it is supervised **`pg_repack` 1.5.2**, never `VACUUM FULL`, never scheduled. The 2026-07-21 outage is the standing reason.
  5. **Add an alert.** A nightly job that has failed every observed night, logs an ERROR each time, and was found only by a manual audit is a monitoring gap as much as a tuning gap.
  6. **Pin `BATTLE_OBSERVATION_COMPACT_KEEP=1`** — see G2b.

#### G2b: `KEEP=1` is correct but undocumented and unpinned — the same trap F7/item-10 was closing

`BATTLE_OBSERVATION_COMPACT_KEEP=1` exists **only** as a durable manual `/etc/battlestats-server.env` edit. It is absent from `deploy_to_droplet.sh`, and the code default is `3`. `runbook-data-lifecycle-architecture-2026-06-21.md` §2/§7 says `KEEP=1` (correct) while the deploy-script comment at line 724 says "keep-latest-3 compaction owns those" (wrong). So the value is right in production, wrong in one doc, and unpinned everywhere.

This is precisely the shape the 07-19 audit's item 10 was closing when it pinned `BATTLE_OBSERVATION_COMPACT_ENABLED` ("it existed only as a manual /etc edit from the 2026-05-24 incident") — the sibling variable was missed.

- **Risk of inaction**: any new environment, any rebuild of `/etc` from Pass that misses this key, or any host migration silently reverts to keep-3 and triples the live JSON footprint. This audit's own first draft was misled by exactly this gap — a fair proxy for how a future operator would read it.
- **Remediation**: `set_env_value BATTLE_OBSERVATION_COMPACT_KEEP 1` in the deploy script, add it to Pass, correct the line-724 comment, and cover it in the env-gate default-alignment test alongside the other pinned gates. Trivial; do it with G2.1.

---

### G3: F11 re-scoped — the 14 Phase-7 columns on `BattleEvent`. **Verdict reversed: drop them.**

Updates **F11** bullet 1 (previous verdict: "keep while the archive contract stands").

| Quantity | Value | Basis |
|---|---|---|
| Phase-7 columns on `BattleEvent` | 14 × `IntegerField(default=0)`, **NOT NULL** (`models.py:684–697`) | code |
| Fixed on-disk width | 14 × 4 B = **56 B/row** | deterministic (no null-bitmap saving; all `int4`, no padding) |
| `BattleEvent` rows today | 11,369,025 | measured |
| **Cost today** | **~637 MB** | computed |
| Live window depth today | 2026-06-13 → 2026-08-05 = **53 days** | measured |
| Retention (fixed — G7) | **105 days** | live `/etc` |
| **Cost at full depth (~2026-09-26)** | **~1.26 GB** | projected, 105/53 |
| Rows with all sampled Phase-7 columns zero | 5.4% | est. — the columns *do* carry signal |

**Why the verdict flips.** The 07-19 "keep" rested entirely on the CSV archive contract. Three checks dissolve it:

1. **`PlayerDailyShipStats` carries all 14 analogues** (`models.py:785–798`) — a complete 1:1 set — and **PDSS is exported by the *same* archive job**, same cutoff, same run.
2. **The read path touches only 8 delta columns** (`views.py`); the Phase-7 *analytics* read PDSS (`data.py:6819–6874`), with `ShipPopDailyAgg` now in front of that.
3. **The decisive check: `rebuild_daily_rollup` never reads them either.** The rollup rebuild/reconcile path (`incremental_battles.py:1447–1494`) reconstructs PDSS rows from stored `BattleEvent` rows using **only** `battles_delta`, `wins_delta`, `losses_delta`, `frags_delta`, `damage_delta`, `xp_delta`, `planes_killed_delta` and `survived` — the 8 core columns. It never touches the Phase-7 deltas. The one plausible consumer of `BattleEvent`'s stored copy does not consume it.

So nothing anywhere reads them off the `BattleEvent` row. The values reach PDSS through the **in-memory event object** inside the same `transaction.atomic()` block (`_update_daily_ship_stats`, `PHASE7_AGG_FIELDS` at `:617–633`), not by a later read of the persisted column.

**One caveat that makes this a code change, not a pure migration.** Because `_update_daily_ship_stats(event)` reads `event.main_shots_delta` off the model instance, dropping the DB columns requires the values to still ride on the object (or be passed as a dict) at rollup time. Contained, but real — which is why this ranks below the env-level levers.

**A separate integrity note surfaced by check 3, worth its own triage:** because `rebuild_daily_rollup` reconstructs only the 8 core columns, **any PDSS day that is rebuilt or reconciled silently loses its Phase-7 values** (they revert to the model default 0) even though the incremental path had populated them. That is a pre-existing latent fidelity gap in the reconciliation path, independent of anything proposed here, and this audit cannot price it. Flagged, not costed.

- **Risk of inaction**: ~1.26 GB of live Postgres at steady state, plus insert-width and WAL cost on a table already taking **6.15M inserts** per 27 days — against a hard disk wall with **+7.8 GB already committed** (G7). At 32d it was ~400 MB and defensible; at 105d it is a top-four reclaimable item.
- **Remediation**: keep the values on the in-flight event object, write them only to PDSS, drop the 14 columns from `BattleEvent` (`incremental_battles.py:934–947` is the sole persister). One migration + one contained write-path change + an archive-manifest column-list note. **Recovers ~1.26 GB** plus width and WAL.

---

### G4: The achievements stream — ~1.9 GB and 3.6M row-writes per 27 days, with **zero product readers**

New finding. Not in the F-series (F11 swept columns, not whole streams). Independently confirmed by the coordinator.

| Component | Size | Churn (27 d) |
|---|---|---|
| `warships_playerachievementstat` | **1,305 MB** (555 heap + **750 MB idx**) | 1,955,553 ins / 1,625,983 del |
| `Player.achievements_json` | **~596 MB** (est., 1% sample) | written on every refresh |
| **Total** | **~1.9 GB** | delete-and-recreate per player |

Reader sweep (`views.py`, `urls.py`, `serializers.py`, `landing.py`, and the whole `client/app` tree):

- **Zero** hits for "achievement" in `views.py`, `urls.py`, `landing.py`.
- **Zero** hits for "achievement" anywhere in the frontend (`client/app`, excluding tests).
- `serializers.py:180` explicitly **excludes** `achievements_json` from the payload.
- `PlayerAchievementStat` appears in exactly one write path (`data.py:576–578`, delete-then-`bulk_create`) and two bookkeeping readers: `player_records.py:72,75` (account merge) and `purge_deleted_accounts.py:206,222` (a GDPR row count written into the purge transcript).
- `data.py:469 _stored_player_achievement_rows` reads it back only to return it to `update_achievements_data`'s caller — and **both call sites are bare statements that discard the return value** (verified by reading them, not inferred): `clan_crawl.py:371` and `incremental_player_refresh.py:199` both call `update_achievements_data(player.player_id, realm=realm)` without binding the result.

Its two largest indexes have **`idx_scan = 0`**: `unique_player_achievement_source` (407 MB) and the pkey (274 MB). As F7 correctly noted, a unique constraint need not increment `idx_scan` to be doing work — but here it enforces uniqueness for a table with no consumer.

- **Risk of inaction**: ~1.9 GB (5% of `pg_database_size`) plus 3.6M row-writes and a WG API call per refreshed player, producing nothing a user can see — and it *grows* with crawl coverage, against a retention commitment that already consumes the headroom.
- **Remediation** (needs a product decision first — "is an achievements surface ever going to ship?"):
  - **If no**: drop `PlayerAchievementStat` and `Player.achievements_json`; delete `update_achievements_data` / `normalize_player_achievement_rows` and the achievements branch of the crawl and incremental refresh. **~1.9 GB + 3.6M writes / 27 d + WG budget.** Two reference sites must be *reconciled*, not merely deleted: `player_records.py:72–75` (the account-merge copy loop) and `purge_deleted_accounts.py:206,222` — the latter writes an `achievements` count into the **GDPR purge transcript record shape**, so removing the model changes an audit artefact. Reference-check that path deliberately.
  - **If yes but not soon**: stop *double*-storing. `achievements_json` is the raw payload; `PlayerAchievementStat` is its normalized mirror. Keeping only the blob reclaims **1.3 GB** and all 3.6M row-writes, and is reversible (the mirror rebuilds from the blob).
  - **Either way**: stop refreshing achievements on the crawl path until a consumer exists.

---

### G5: `warships_player` is the write-amplification centre — ~1.32 TB dirtied in 27 days on a 10 GB table

New finding; extends **F1/F2**'s bloat mechanism from "why the heap doesn't shrink" to "what it costs the box daily".

| Statement | Calls | Total time | **Buffers dirtied** |
|---|---|---|---|
| `UPDATE player SET floor_gate_skipped_at = $1 WHERE player_id IN (…) AND realm = …` | 113,526 | 1,034 min | **457 GB** |
| `UPDATE player SET name=$1, player_id=$2, realm=$3, is_hidden=$4, …` (3 full-row `.save()` variants) | 2.10M + 1.30M + 0.66M | 995 min | **717 GB** |
| `UPDATE player SET battles_json = $1::jsonb, battles_updated_at = $2` | 2,537,051 | 487 min | **241 GB** |
| `UPDATE player SET last_battle_date = …, days_since_last_battle = …` | 2,331,017 | 251 min | **104 GB** |
| **`warships_player` subtotal** | | | **~1.32 TB** |
| `UPDATE snapshot SET interval_battles = (CASE …)` | 1,282,423 | 194 min | 134 GB |
| `INSERT INTO battleobservation …` | 2,537,063 | 230 min | 129 GB |
| `INSERT INTO playerdailyshipstats …` | 5,670,335 | 198 min | 96 GB |
| `UPDATE battleobservation SET ships_stats_json = NULL, …` (compaction, G2) | 1,172 | 152 min | 83 GB |

Whole-database dirtied buffers across the top statements ≈ **1.9 TB / 27 days ≈ 71 GB/day**, of which `warships_player` is **~69%**. **`shared_blks_dirtied` counts dirtied *buffers*, not WAL bytes** — treat every GB/day figure here as a **WAL proxy**, not measured WAL. With `full_page_writes = on` and `wal_compression = off` the two are roughly proportional, which is the plausible source of the ~8 GB `disk_used` − `pg_database_size` gap and of much of the `load15 = 3.13`; the exact WAL volume is not measurable from `pg_stat_statements`.

The amplifier is structural: **only 11.2% of Player updates are HOT** (5,123,833 of 45,853,046 — vs 96.7% on `warships_snapshot`, 94% on `warships_clan`). Every non-HOT update rewrites entries across all 13 Player indexes (776 MB) plus the heap tuple, and TOAST chunks where `battles_json` changes.

Three separable causes:

1. **`floor_gate_skipped_at` (457 GB, 24% of the whole DB's dirtying) is a cooldown clock stored in the hottest relational row in the system.** `BATTLE_OBSERVATION_FLOOR_GATE_SKIP_COOLDOWN_HOURS=8` **verified live** (code default is `0`/off). Written at `incremental_battles.py:1261` in ≤100-row bulk updates; read only at `ensure_daily_battle_observations.py:91` as `IS NULL OR < cutoff`. Its value is intrinsically ephemeral — it suppresses a candidate for 8 hours. As a column on a wide, heavily-indexed, TOAST-carrying row it costs ~4.2 MB of dirtied buffers **per call**.
2. **Django full-row `.save()` (717 GB).** Three statement variants write every Player column across 4.06M calls. Call sites lacking `update_fields=` rewrite the whole row, including forcing a TOAST decision on blobs that did not change.
3. **`battles_json` rewrites (241 GB).** `FLOOR_REFRESH_BATTLES_JSON_ENABLED=1` **verified live**; the floor rewrites an ~11 kB TOASTed blob 2.54M times per 27 days. This one is *earning* it — it keeps active players' displayed stats fresh without a page visit — but it should be counted honestly at ~9 GB/day of dirtied buffers, and it is why a Player repack always refills.

- **Risk of inaction**: this is the CPU/IO saturation, not the storage — and with retention fixed and disk headroom committed, CPU is the axis with the most give. It also guarantees any future Player reclaim is temporary, the trap that produced the 2026-07-21 outage.
- **Remediation** (ranked):
  1. **Move `floor_gate_skipped_at` off the Player row.** A Redis key per `(realm, player_id)` with an 8 h TTL is a semantically exact substitute (ephemeral, per-player, TTL-shaped) and removes **~457 GB / 27 d** of dirtying plus 13 index-entry rewrites per stamped player. Fallback: a narrow two-column side table with one index. Cheapest interim with zero code: set the cooldown to `0` and accept the self-chain refilling its candidate set — which is what the code default already assumes.
  2. **Audit every `Player.save()` for `update_fields=`.** Mechanical, low risk, no migration; targets 717 GB.
  3. **Consider `fillfactor` on `warships_player`.** It will not enable HOT (the changed columns are indexed) but it reduces page splits. Metadata-only ALTER; do **not** pair it with any rewrite.
  4. **Leave `wal_compression = off`.** LZ4 would plausibly halve WAL, but it spends CPU on a CPU-bound box.

---

### G6: The F7 30-day index re-check, run 14 days early — no regression, but ~422 MB of new dead weight

Updates **F7**. Due 2026-08-19; performed 2026-08-05.

**Regression check — negative.** No table shows a seq-scan pattern attributable to migration 0082 (`playerdailyshipstats` 262 seq scans, `player` 878, `battleobservation` 3,518). The two large `seq_tup_read` figures have identified, pre-existing causes:

- `warships_battleevent`: **25,756,389,568 tuples** over 9,817 scans (avg 2.6M/scan) — the ship-grouped warms (G8).
- `warships_playerexplorersummary`: 2,842,883,655 tuples over 10,411 scans — `_get_hot_player_ids` (G8). That query orders by `PlayerExplorerSummary.player_score`, and F7 dropped `explorer_realm_score_idx` on `(realm, player_score)` — but **this is not a regression**: the index had `idx_scan = 0` *before* the drop, so the planner was not using it, and the sort spans two tables (`explorer_summary.player_score`, then `player.pvp_ratio`), which no single index can serve. The drop was correct; the query is the problem.

**New dead / redundant index accumulated since 0082:**

| Index | Size | `idx_scan` | Why droppable |
|---|---|---|---|
| `warships_playerdailyshipstats_mode_5a941e36` | 98 MB | **5** | 0082 dropped the `_like` twin but left the base index. `mode` is 2-valued. |
| `warships_battleevent_mode_983942c4` | 93 MB | 306 | Same shape, same table family. |
| `warships_playerdailyshipstats_player_id_daed36c5` | 98 MB | 6,520 | **Prefix-covered** by `dly_ship_player_date_idx` `(player, -date)`. |
| `warships_battleevent_player_id_1f7bf48a` | 104 MB | 13,852 | **Prefix-covered** by `battle_event_player_time_idx` `(player, -detected_at)`. |
| `mv_player_dist_id_idx` | 29 MB | **0** | 0082 dropped 4 of the matview's 7; this is a 5th with no reader. |
| **Total** | **~422 MB** | | |

Not droppable: `unique_ranked_battle_event_per_obs_pair_per_season` (45 MB, 0 scans) and `unique_ship_pop_daily_agg` (11 MB, 2 scans) are partial-unique constraints doing correctness work that does not increment `idx_scan`. `explorer_eff_rank_idx` (32 MB, 10 scans) is near-dead but cheap post-repack — leave it. `player_last_fetch_idx` (145 MB, 1,168 scans) is low-use but purposeful — leave it.

`dly_ship_player_shipdt_idx` (**550 MB**, 8,823 scans) and `unique_random_player_daily_ship_stats` (**541 MB**) are 1.09 GB of PDSS's 2.11 GB index footprint — PDSS now carries **as much index as heap** (2,111 vs 2,154 MB). Both are load-bearing; noted because it means **each retained PDSS day costs ~2× its raw data**, which is the multiplier on G7's committed growth.

- **Risk of inaction**: ~422 MB, plus insert-time index maintenance on the two highest-insert tables (PDSS 12.76M, `BattleEvent` 6.15M inserts / 27 d) — a write-cost item as much as a storage one.
- **Remediation**: one migration batch — `db_index=False` where a composite covers, `RunSQL("DROP INDEX CONCURRENTLY …")` for the rest. Grep for `mode=` filters not co-filtered by player/date first. Re-check in 30 days.

---

### G7: Retention is a fixed 105 days by product decision — the growth it commits must be funded elsewhere

Updates the retention row of `runbook-battle-history-archive-prune-2026-06-17.md` and `CLAUDE.md`. **This is not a lever and no reduction is proposed.**

**The decision, as it actually stands** (operator, 2026-08-05): **90 days is the product target** for the battle-history read. **45d and 60d are disposable stepping stones toward it, not a selector** — 45d shipped in v4.4.0 on 2026-07-24, 60d lands ~mid-August, 90d ~late September. **105d retention exists specifically to sustain a 90d rolling read**: the prune runs only twice monthly (1st + 15th), so a 90d read needs ~15 days of slack plus safety margin or it goes short between prune runs. **The 15 days of apparent excess is the mechanism, not waste.** The 60 → 80 GiB disk resize was made deliberately to pay for it.

Accordingly: usage of the 45d pill today is **not** evidence about retention — low usage of a waypoint is expected — and it is removed from this audit's open items.

**Documentation reconciliation (the only action here).** Prod runs `BATTLE_HISTORY_ARCHIVE_RETENTION_DAYS=105` (deploy script line 705 and live `/etc`, both verified), raised from 92 on **2026-07-24**. `CLAUDE.md` and `runbook-battle-history-archive-prune-2026-06-17.md` both still say 92. This is **documentation lagging a deliberate change**, not configuration drift — the deploy script and `/etc` are correct. Anyone planning capacity from the docs is 14% low, which is how this audit's own growth input was initially mis-set.

**The committed cost, so it can be planned rather than discovered:**

| Quantity | Value | Basis |
|---|---|---|
| Live depth today | 2026-06-13 → 2026-08-05 = **53 days** | measured |
| `BattleEvent` + PDSS today | **7.97 GB** (3.70 + 4.27) | measured |
| PDSS ingest rate | ~1.4M rows/week ≈ **200K rows/day** | est., 2% sample |
| `BattleEvent` ingest rate | ~**203K rows/day** | derived |
| **At full 105 d depth (~2026-09-26)** | **~15.8 GB** | projected (105/53) |
| **Committed additional growth** | **+7.8 GB** | projected |

- **Risk of inaction**: none from the retention setting itself — it is correct and on schedule. The risk is **arithmetic**: +7.8 GB lands automatically by late September on an 80 GiB wall with autoscale OFF, and this audit's levers total **~5.7 GB** (G2 2.1 + G4 1.9 + G3 1.26 + G6 0.42). **The gap is ~2 GB**, before G2's ~116 MB/day leak is even counted. Every other finding in this document should be read as funding for this commitment.
- **Remediation**:
  1. Correct `CLAUDE.md` and the archive runbook to 105, **recording the 90d-read rationale and the twice-monthly-prune slack** so the number is not "corrected" back by a future reader who sees 45d surfaces and 105d retention.
  2. Track the ~2 GB shortfall explicitly. Cheapest additional sources, none of them retention: closing G2's compounding leak, the 31–180 d `battles_json` tier (~1.09 GB, reversible — G9), and the never-pruned blobs on >180d-inactive players (~858 MB, needs code).
  3. Re-check the disk metric weekly through September rather than monthly; growth is front-loaded by the PDSS index multiplier (G6).

---

### G8: The two heaviest recompute paths — F9.1's fix was applied to half the warmer, F9.3 was never applied

Updates **F9.1** and **F9.3**. 27-day totals from `pg_stat_statements`.

**(a) `_get_hot_player_ids` — 5,250 minutes, the #1 consumer in the database.**

```
SELECT player_id FROM warships_player
LEFT OUTER JOIN warships_playerexplorersummary ON (player.id = pes.player_id)
WHERE player.realm = $1 AND NOT player.name = $2 AND NOT player.is_hidden
ORDER BY pes.player_score DESC NULLS LAST, player.pvp_ratio DESC NULLS LAST, player.name
```

4,096 calls × **76.9 s mean** = **5,250 min** (~3.2 h of DB CPU **per day**), 122 GB dirtied. Source: `data.py:5337–5341`, inside `_get_hot_player_ids`, run by the 30-minute hot-entity warmer × 3 realms.

F9.1 fixed the **clan** half — `_get_hot_clan_ids` now ranks by the denormalized `cached_clan_wr` / `cached_total_battles` instead of a live aggregation. The **player** half was never touched. It is a full-realm join-and-sort with a mixed-table sort key, so no index can serve it; it must be restructured as the clan side was.

**(b) `BattleEvent` ship-grouped warms — 25.8 billion tuples seq-read.**

| Statement | Calls | Mean | Total |
|---|---|---|---|
| `SELECT ship_id, ship_name, SUM(battles_delta) … GROUP BY` | 631 | 126.8 s | 1,333 min |
| `SELECT SUM(battles_delta) FROM battleevent INNER JOIN …` | 2,983 | 26.8 s | 1,333 min |
| `SELECT ship_id, SUM(battles_delta) … GROUP BY` | 2,112 | 21.2 s | 747 min |
| `SELECT ship_id, player_id, player.… FROM battleevent …` | 168 | 135.5 s | 380 min |

≈ **3,793 min / 27 d ≈ 2.3 h/day**, scaling linearly with window depth — the committed 105d fill (G7) roughly **doubles** it by late September. That makes this the one CPU item that gets *worse* on a schedule.

**(c) The floor's candidate query** — `SELECT player_id, name, MAX(observation.observed_at) … WHERE NOT is_hidden AND last_battle_date >= $1 AND realm = $2 GROUP BY`: 2,638 calls × 32.4 s = **1,426 min**. A per-realm group-max over the whole active pool, every floor cycle.

- **Risk of inaction**: (a)+(b)+(c) ≈ **10,470 min / 27 d ≈ 6.5 h of DB CPU per day** on a 2-vCPU instance — this *is* the `load15 = 3.13`. And (b) grows on the retention schedule.
- **Remediation**:
  1. **(a) is the best CPU-per-effort lever in this audit.** Apply the F9.1 pattern: bound the candidate set before sorting (top N by an indexed `Player` column, then order in Python), or denormalize `player_score` onto `Player` where an index can serve it. This is a **warmer**, so *approximate* ordering is entirely acceptable — nothing user-visible depends on exact rank order, which is what makes the fix cheap. **~3.2 h/day.**
  2. **(b)**: finish F9.3 — point the ship-grouped warms at `PlayerDailyShipStats`, or extend `ShipPopDailyAgg` (already aggregating `battles` / `wins` / `frags` / `damage_sum` per realm-ship-day). ~2.3 h/day today, ~4.6 h/day after the 105d fill.
  3. **(c)**: the `MAX(observed_at)` group-max is a denormalization candidate — a `last_observed_at` column on `Player` maintained by the observation writer. Lower priority, and note it would *add* to G5's update churn, so only worth it paired with G5's fixes.

---

### G9: Dead-column and dead-flag sweep — mostly "leave it alone", with two corrections to the F-series

Updates **F6** and **F11** bullets 2–5. Every env value below verified against live `/etc`.

| Item | Prior finding said | Measured today | Verdict |
|---|---|---|---|
| `Player.last_lookup` | F11: "99% NULL; grep for the writer before removal" | **0.88% non-NULL** (est., ~9,600 of 1.09M). But **alive**: written by `visit_analytics.py:64`, read as an ordering key by `data.py:5330`, `incremental_player_refresh.py:123,127`, `incremental_ranked_data.py:146,159`, `backfill_battle_data.py:71`. Index has **4,394 scans**, costs 14 MB. | **Correction to F11 — not dead. Leave it alone.** |
| `Clan.last_lookup` | same | **Genuinely unwritten**: `visit_analytics.py:64` updates only `Player`. Read only by `admin.py:10,32` `list_display`. | Dead, but `warships_clan` is 70 MB total. **Leave it alone.** |
| `StreamerSubmission.notes` | F11: "zero reads; remove opportunistically" | Confirmed zero reads. Table is **8 kB, ~2 rows**. | **Leave it alone.** Schema honesty is not worth a migration on a live table. |
| `PlayerActivityHourly` | F11: "verify the consuming surface still exists" | **It does** — `tasks.py:2227–2234` reads the persisted curve to scale intervals. 72 rows, 80 kB, self-rebuilding. | **Leave it alone.** F11's doubt resolved: alive. |
| `HotPlayer` | F11: "rows retained by design" | 2,400 rows, **1.3 MB**, 0 writes, 0 scans. `HOT_PLAYERS_ENABLED=0` verified live. | **Still the right call.** |
| `EntityVisitEvent` / `Daily` | monthly cleanup gate, default off | 13 MB + 3.5 MB; `ENTITY_VISIT_CLEANUP_ENABLED=0` verified live. | **Leave it off.** The raw events are the only audience-measurement primary source. |
| `ShipTopPlayerSnapshot` | — | 37 MB, 885K ins / 874K del per 27 d — healthy nightly rewrite with its own retention. | **Earning it.** |
| `Player.battles_json` 180d prune | F6: "the 180d prune path is visibly working" | **It has never run.** `PRUNE_BATTLES_JSON_ENABLED=0` (deploy line 751 **and** live `/etc`); `prune_inactive_player_battles_json` has exactly one caller — the management command, which self-gates on that flag. The tail is thin because inactive players never *received* a `battles_json`, not because it was pruned. | **Correction to F6.** See below. |
| `warships_rankedseason` | — | **30 rows, 1,092,778 updates, 4,448 autovacuums, 75,888 seq scans** — an upsert-on-every-`seasons/info/`-fetch same-value write storm. | Byte cost nil; burns autovacuum worker slots (3 configured) on a saturated box. **Cheap fix**: write only on actual change. |

**Player JSON blob attribution** (est., 1% sample, ×~96.8):

| Column | Size | Pruned? | Read by a live surface? |
|---|---|---|---|
| `battles_json` | **~4.74 GB** | prune exists, **never run** | Yes — server-side career per-ship source; excluded from the payload |
| `ranked_json` | ~665 MB | never | **Yes, served to the client** (`serializers.py:174`) |
| `tiers_json` | ~653 MB | never | Yes — 4.08M reads / 27 d in `pg_stat_statements` |
| `efficiency_json` | ~632 MB | never | **Yes, served to the client** (`serializers.py:264`) |
| `achievements_json` | ~596 MB | never | **No — see G4** |
| `randoms_json` | ~516 MB | never | **Yes, served to the client** |
| `activity_json` | ~163 MB | never | Yes — `data.py:2530–2575` |
| `type_json` | ~125 MB | never | Yes — `data.py:4698–4718` |

**`battles_json` by inactivity bucket** (est.): active 0–30 d **3.34 GB**; 31–180 d **1.09 GB**; 181–365 d **194 MB**; >1 y **13 MB**.

- Arming the prune **at its configured 180d threshold returns only ~200 MB** — a destructive job for a rounding error. Leave the threshold alone.
- **But given G7's committed +7.8 GB and this audit's ~2 GB shortfall, the 31–180 d tier (~1.09 GB) is now worth pricing.** It is reversible — the blob refetches on view — and the affected players are by definition not active. It is a threshold change on an already-built, already-tested, already-scheduled job. Flagged as the cheapest *unbuilt* GB available; it needs a supervised `--dry-run` and a decision on the returning-player refetch cost, so it is not a default recommendation.
- Never-pruned blobs on >180d-inactive players total **~858 MB** (est.). A prune tier there is new code for <1 GB — below the line unless the September shortfall bites.

---

### G10: Per-stream fitness-for-purpose

| Stream | What it is FOR | Does the stored shape match that role? | Verdict |
|---|---|---|---|
| `BattleObservation` (15 GB) | Raw WG `ships/stats` blob as the **diff baseline** for `compute_battle_events` | **Shape yes, maintenance no.** Only generation 1 is read, and `KEEP=1` correctly encodes that — but the compactor fails every night, so ~2.1 GB of superseded generations persists and grows ~116 MB/day. The blob itself *is* what the diff needs (the diff spans the whole per-ship array), so "store less per row" is not available; "finish compacting" is. | **Right design, broken maintenance (G2).** |
| `BattleEvent` (3.7 → ~7 GB) | Per-observation-pair deltas; the source PDSS and the ship leaderboard are built from | **Grain right** (the pair is the atomic unit of "what changed"). **Width wrong** — 14 of its 22 delta columns are read by no path at all, including the rollup rebuild (G3). Overlaps PDSS only as a raw layer overlaps its rollup, which is correct design. | **Right stream, 56 bytes/row too wide.** |
| `PlayerDailyShipStats` (4.27 → ~8.5 GB) | The layer **every** UI window resolves to | **Yes** — the best-shaped table in the system, and F9.2 proved it can absorb work from `BattleEvent`. Its depth is a committed product requirement (G7), not excess. Watch that its index footprint now equals its heap, so each retained day costs ~2× raw. | **Earning it.** |
| `Snapshot` (1.75 GB) | Daily cumulative career totals → the 28/29-day activity series and the mover KPI | **Yes, now.** The delta gate removed the 69% that recorded "this player did nothing today"; the reader already treats a missing date as a zero interval. The audit's cleanest success. | **Earning it.** |
| `Player` JSON blobs (~8.1 GB) | `battles_json` = career per-ship baseline; the rest = derived payloads served or read by live surfaces | **Yes, with one exception** (`achievements_json`). F6's "do not extract these relationally" stands: `battles_json` is the *only* career-scope per-ship store — `BattleEvent`/PDSS are window deltas. | **Earning it, except achievements (G4).** |
| `PlayerAchievementStat` (1.3 GB) | A normalized mirror of `achievements_json` | **No.** No product surface, no frontend reference, both large indexes at 0 scans, and the callers of its only accessor discard the result. | **Not earning it (G4).** |
| `PlayerExplorerSummary` (295 MB) | Wide read-model for the efficiency / CB / ranked icon set | **Yes**; F1's repack held (203 MB heap, 14,658 dead of 781,891). 30.7M updates but 31% HOT — acceptable for a read-model. | **Earning it.** |
| `EntityVisitEvent` / `Daily` (17 MB) | First-party audience measurement | Yes; the only primary source for the returning-visitor KPI. | **Earning it.** |
| `ShipTopPlayerSnapshot` (37 MB) | Nightly ship standings + profile badges | Yes; ephemeral by design, self-pruning. | **Earning it.** |
| `ShipPopDailyAgg` (48 MB) | Collapse the nightly PDSS ship-pop scan | Yes — 48 MB bought back a 34 s/realm nightly scan. **The model this audit wants replicated for `BattleEvent` (G8b).** | **Earning it, exemplary.** |
| `PlayerActivityHourly` (80 kB) | Hour-of-day interval scaling | Yes; self-bounding 72-row buffer. | **Earning it.** |
| `HotPlayer` (1.3 MB) | Disabled engagement queue; retained audit trail | Yes at this size. | **Leave it alone.** |
| `RankedSeason` / `ClanBattleSeason` (216 kB) | Durable season catalogues for the icon criteria | Shape right; **write pattern wrong** (1.09M same-value updates on 30 rows). | **Earning it; fix the churn cheaply (G9).** |

---

## Ranked remediations (expected return per unit of risk)

Retention is fixed (G7) and is **not** on this list. Storage figures are steady-state; CPU figures are per day.

| # | Action | Return | Risk | Effort |
|---|---|---|---|---|
| **1** | **Make the observation compaction actually finish** (G2) — move `prune_battle_observations` to a systemd timer like the other retention jobs; raise its 180 s `statement_timeout`; interim, raise `COMPACT_BATCH_SIZE` and drop `COMPACT_SLEEP` | **~2.1 GB standing residue + stops a ~116 MB/day leak** | **Low** — the command exists, self-gates, and the systemd precedent + rationale are already in the archive runbook | Deploy-script heredoc (+ env tweaks) |
| **2** | **Fix `_get_hot_player_ids`'s cross-table sort** (G8a) | **~3.2 h/day of DB CPU** — the largest single consumer | **Low** — warmer-only, approximate ordering acceptable, no payload contract | Small code |
| **3** | **Pin `BATTLE_OBSERVATION_COMPACT_KEEP=1`** in Pass + deploy script; correct the line-724 comment; cover in the env-gate alignment test (G2b) | Durability — prevents a silent 3× regression of the largest table | **Very low** | Trivial |
| **4** | **Move `floor_gate_skipped_at` to Redis** (G5.1) — or set the cooldown to `0` today at zero effort | **~457 GB dirtied / 27 d** (~17 GB/day; a WAL proxy) | **Low–medium** — the cooldown is inherently ephemeral; `=0` is what the code default already assumes | Small code, or an env flip |
| **5** | **Retire or de-duplicate the achievements stream** (G4) | **~1.9 GB** (or 1.3 GB keeping the blob) + 3.6M writes / 27 d + WG budget | **Low–medium** — needs a product decision, then a deliberate reconcile of the GDPR-transcript shape | Migration + code |
| **6** | **Drop the 5 redundant/dead indexes** (G6) | **~422 MB** + insert amplification on the two highest-insert tables | **Low** — grep `mode=` filters first; `CONCURRENTLY`; 30-day re-check | One migration |
| **7** | **`Player.save(update_fields=…)` audit** (G5.2) | **~717 GB dirtied / 27 d** | **Low** — mechanical, no schema change | Small code, many sites |
| **8** | **Drop the 14 Phase-7 columns from `BattleEvent`** (G3) | **~1.26 GB** at full depth + insert / WAL width | **Medium** — values must stay on the in-flight event object for the PDSS write; archive manifest column list changes | Migration + contained code change |
| **9** | **Finish F9.3** — point the ship-grouped warms at PDSS / `ShipPopDailyAgg` (G8b) | **~2.3 h/day today, ~4.6 h/day after the 105d fill** | **Medium** — payload equivalence must be proven per warm | Moderate code |
| **10** | **Reconcile the docs to 105d + rationale** (G7) and **`RankedSeason` write-only-when-changed** (G9) | Prevents a future "correction" back to 92; removes 1.09M same-value updates | **Very low** | Trivial |
| *(held)* | *31–180 d `battles_json` prune tier* (G9) | *~1.09 GB, reversible* | *Medium — touches the returning-player path* | *Threshold change + supervised dry-run* |

**Explicitly leave alone:**

- **Any reclamation operation.** `warships_player` self-maintains (~2% dead, 1,671 autovacuums). `BattleObservation`'s ~3.3 GB of TOAST free space **will be reused by new inserts once G2 converges** — that is the correct outcome, and the 2026-07-21 outage is the standing reason not to touch it. If a one-off reclaim is ever justified it is supervised **`pg_repack` 1.5.2**, never `VACUUM FULL`, never scheduled.
- **Battle-history retention.** Fixed product decision (G7).
- **The `battles_json` prune at its configured 180d threshold**: ~200 MB for a destructive job.
- **`wal_compression`**: trades CPU on a CPU-bound box.
- **`StreamerSubmission.notes`, `Clan.last_lookup`, `PlayerActivityHourly`, `HotPlayer`, entity-visit cleanup**: all < 20 MB, several alive.
- **`Player.last_lookup`**: F11 flagged it; it is alive and its index is used.

---

## How to re-measure

Session preamble for every query (one at a time — the box saturates at `load15` 2):

```bash
cd /home/august/code/battlestats/server && set -a && source .env && source .env.secrets && set +a
PGPASSWORD="$DB_PASSWORD" psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require" \
  -P pager=off -c "SET statement_timeout='45s'; SET default_transaction_read_only=on;" -c "<query>"
```

**Env provenance — do this FIRST. Never infer a prod value from a code default or from absence in the deploy script; durable manual `/etc` edits survive deploys.**

```bash
ssh root@battlestats.online 'grep -hE "^(BATTLE_OBSERVATION_|BATTLE_HISTORY_|SNAPSHOT_|PRUNE_|ENTITY_VISIT_|SHIP_|FLOOR_|HOT_)" /etc/battlestats-*.env | sort -u'
```

**G2 — is the compaction task completing?** (the check this audit initially skipped)

```bash
ssh root@battlestats.online "journalctl -u battlestats-celery-background --since '-8 days' --no-pager \
  | grep -iE 'prune_battle_observations' | tail -25"
# Healthy = no SoftTimeLimitExceeded and no 'canceling statement due to statement timeout'.
# A kill at start+540s means the batch loop was cut off; a kill ~3 min in means the
# candidate scan blew BATTLE_OBSERVATION_COMPACT_STATEMENT_TIMEOUT and the run yielded zero.
```

**Composition + counter validity**

```sql
SELECT c.relname, pg_size_pretty(pg_relation_size(c.oid)) heap,
       pg_size_pretty(COALESCE(pg_relation_size(c.reltoastrelid),0)) toast,
       pg_size_pretty(pg_indexes_size(c.oid)) idx,
       pg_size_pretty(pg_total_relation_size(c.oid)) total, c.reltuples::bigint rows
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','m')
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 40;

SELECT pg_size_pretty(pg_database_size(current_database())),
       (SELECT stats_reset FROM pg_stat_database WHERE datname=current_database()),
       (SELECT stats_reset FROM pg_stat_statements_info);   -- check BOTH before trusting any counter
```

**G1 — Snapshot delta gate + zero-interval share** (2% sample; `warships_snapshot` has **no date-leading index**, so never `GROUP BY date` unsampled)

```sql
SELECT date, count(*) sampled, count(*)*50 est_rows,
       count(*) FILTER (WHERE interval_battles=0)*50 est_zero
FROM warships_snapshot TABLESAMPLE SYSTEM (2)
WHERE date >= current_date - 9 GROUP BY date ORDER BY date;

SELECT date_trunc('month',date)::date month, count(*)*50 est_rows, count(DISTINCT date) dates
FROM warships_snapshot TABLESAMPLE SYSTEM (2) GROUP BY 1 ORDER BY 1;
```

**G2 — observation composition** (`IS NOT NULL` reads the null bitmap only; it never detoasts)

```sql
SELECT count(*) sampled,
       count(*) FILTER (WHERE ships_stats_json IS NOT NULL) w_json,
       count(*) FILTER (WHERE ranked_ships_stats_json IS NOT NULL) w_ranked,
       count(*) FILTER (WHERE last_battle_time IS NULL AND ships_stats_json IS NULL
                          AND ranked_ships_stats_json IS NULL) empty_rows
FROM warships_battleobservation TABLESAMPLE SYSTEM (2);
```

**G2 — live TOAST bytes** (small sample: this one *does* detoast)

```sql
SELECT count(*) n, count(*) FILTER (WHERE ships_stats_json IS NOT NULL) n_ships,
       pg_size_pretty(sum(pg_column_size(ships_stats_json))::bigint) ships_bytes,
       count(*) FILTER (WHERE ranked_ships_stats_json IS NOT NULL) n_ranked,
       pg_size_pretty(sum(pg_column_size(ranked_ships_stats_json))::bigint) ranked_bytes
FROM warships_battleobservation TABLESAMPLE SYSTEM (0.15);
```

**G2 — compaction residue** (the decisive query). The player draw is **size-biased** — a player with more JSON rows is likelier to land in a page sample — so per-player means MUST be inverse-probability weighted: `E[X] = avg(X/k) / avg(1/k)`. Reporting the raw `avg(k)` overstates by ~1.7×.

```sql
WITH s AS (SELECT DISTINCT player_id FROM warships_battleobservation TABLESAMPLE SYSTEM (0.8)
           WHERE ships_stats_json IS NOT NULL),
     p AS (SELECT player_id FROM s ORDER BY random() LIMIT 700),
     r AS (SELECT o.player_id, o.observed_at,
                  (o.ranked_ships_stats_json IS NOT NULL) AS has_ranked,
                  ROW_NUMBER() OVER (PARTITION BY o.player_id
                                     ORDER BY o.observed_at DESC, o.id DESC) AS rn
           FROM warships_battleobservation o JOIN p ON p.player_id=o.player_id
           WHERE o.ships_stats_json IS NOT NULL),
     c AS (SELECT player_id, count(*) AS k,
                  count(*) FILTER (WHERE rn>1 AND observed_at < now()-interval '24 hours'
                                     AND NOT has_ranked) AS residue
           FROM r GROUP BY 1)
SELECT count(*) players,
       round(avg(k),3)                                        AS biased_mean_k,
       round((1.0/avg(1.0/k))::numeric,3)                     AS unbiased_mean_k,
       round((avg(residue::numeric/k)/avg(1.0/k))::numeric,3) AS unbiased_mean_residue
FROM c;
-- Converged compaction => unbiased_mean_residue ≈ 0.
```

**G3 / G7 — window depth** (`detected_at` has only a BRIN; use the pkey)

```sql
SELECT (SELECT detected_at FROM warships_battleevent ORDER BY id ASC  LIMIT 1) oldest,
       (SELECT detected_at FROM warships_battleevent ORDER BY id DESC LIMIT 1) newest,
       (SELECT date FROM warships_playerdailyshipstats ORDER BY date ASC LIMIT 1) oldest_pdss;

SELECT date_trunc('week',date)::date wk, count(*)*50 est_rows
FROM warships_playerdailyshipstats TABLESAMPLE SYSTEM (2) GROUP BY 1 ORDER BY 1;
```

**G5 / G8 — cost and churn** (the `LIMIT` must be inside the subquery; an outer `regexp_replace` over all 2,667 rows times out)

```sql
SELECT calls, round((total_exec_time/60000)::numeric,1) tot_min,
       round((shared_blks_dirtied*8.0/1024/1024)::numeric,2) dirty_gb, left(query,150) q
FROM (SELECT * FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20) s;

SELECT calls, round((total_exec_time/60000)::numeric,1) tot_min,
       round((shared_blks_dirtied*8.0/1024/1024)::numeric,2) dirty_gb, left(query,150) q
FROM (SELECT * FROM pg_stat_statements ORDER BY shared_blks_dirtied DESC LIMIT 12) s;

SELECT relname, n_live_tup, n_dead_tup, seq_scan, seq_tup_read, idx_scan,
       n_tup_ins, n_tup_upd, n_tup_hot_upd, n_tup_del, autovacuum_count
FROM pg_stat_user_tables ORDER BY (n_tup_ins+n_tup_upd+n_tup_del) DESC LIMIT 25;
```

**G6 — index sweep**

```sql
SELECT t.relname tbl, i.relname idx, pg_size_pretty(pg_relation_size(i.oid)) sz, s.idx_scan,
       (SELECT count(*) FROM pg_constraint pc WHERE pc.conindid=i.oid) is_constraint
FROM pg_stat_user_indexes s
JOIN pg_class i ON i.oid=s.indexrelid JOIN pg_class t ON t.oid=s.relid
WHERE pg_relation_size(i.oid) > 8*1024*1024 AND s.idx_scan < 20000
ORDER BY pg_relation_size(i.oid) DESC;
```

**G9 — Player blob attribution + inactivity buckets** (1% sample; scale ×96.8, not ×100)

```sql
SELECT CASE WHEN last_battle_date IS NULL THEN 'never'
            WHEN last_battle_date >= current_date-30  THEN 'a_0_30d'
            WHEN last_battle_date >= current_date-180 THEN 'b_31_180d'
            WHEN last_battle_date >= current_date-365 THEN 'c_181_365d'
            ELSE 'd_over_1y' END bucket,
       count(*)*100 est_players,
       pg_size_pretty((sum(pg_column_size(battles_json))*100)::bigint) est_battles_json
FROM warships_player TABLESAMPLE SYSTEM (1) GROUP BY 1 ORDER BY 1;
```

---

## Validation

- **Live, read-only, serial.** All DB queries 2026-08-05 19:16–20:40 UTC against `defaultdb` with `default_transaction_read_only=on` and a 45–60 s `statement_timeout`. No writes, no locks, no reclamation, one query at a time (a parallel capacity-projection agent was working the same instance). Droplet access was read-only: `grep` on `/etc` and `journalctl`; nothing restarted, nothing edited.
- **Counter provenance.** `pg_stat_database.stats_reset` is **NULL** → `pg_stat_user_tables` / `pg_stat_user_indexes` counters are cumulative and directly comparable with the 07-19 audit. `pg_stat_statements_info.stats_reset = 2026-07-09 11:20 UTC` → **every `pg_stat_statements` figure is a 27-day total**; 2,667 of 5,000 slots used, so **no eviction** — absence from that view is meaningful.
- **Env provenance — corrected method, and the error that forced it.** **An earlier draft inferred `BATTLE_OBSERVATION_COMPACT_KEEP=3` from its absence in `deploy_to_droplet.sh` and was wrong** (prod is `1`, a durable manual `/etc` edit that `set_env_value` preserves). That invalidated the draft's #1 remediation entirely. After the correction the whole sweep was re-verified against live `/etc`: `COMPACT_ENABLED=1`, `COMPACT_KEEP=1`, `ROW_RETENTION_ENABLED=1/DAYS=32`, `EMPTY_RETENTION_DAYS=7`, `ARCHIVE_ENABLED=1`, `ARCHIVE_RETENTION_DAYS=105`, `SHIP_LEADERBOARD_WINDOW_DAYS=45`, `SNAPSHOT_DELTA_GATE_ENABLED=1`, `SNAPSHOT_DOWNSAMPLE_ENABLED=1/RETENTION_DAYS=90`, `PRUNE_BATTLES_JSON_ENABLED=0`, `ENTITY_VISIT_CLEANUP_ENABLED=0`, `FLOOR_REFRESH_BATTLES_JSON_ENABLED=1`, `FLOOR_GATE_SKIP_COOLDOWN_HOURS=8`, `HOT_PLAYERS_ENABLED=0`. **No other claim in this document moved as a result.** `COMPACT_MIN_AGE_HOURS`, `COMPACT_MAX_ROWS`, `COMPACT_BATCH_SIZE` and `COMPACT_STATEMENT_TIMEOUT` are genuinely unset, so their code defaults (`0` / `0` / `2000` / `180 s`) do apply — which is what makes G2 a scheduling-and-timeout failure rather than a configuration one.
- **Sampling.** `TABLESAMPLE SYSTEM` at 2% (`snapshot`, `battleobservation` composition, `battleevent`, `playerdailyshipstats`), 1% (`player` columns), 0.8% (observation multiplicity/residue), 0.15% (observation TOAST bytes). All derived figures labelled **est.**. Per-player means are inverse-probability weighted; the naive size-biased mean (2.63–2.85) would have overstated the excess by ~1.7×. Two independent draws bracketed the unbiased multiplicity at **1.56–1.65**.
- **G2's residue figure is corroborated twice.** Sampled residue (~149K rows ≈ 2.1 GB) and the independent throughput deficit (86K NULLed/day vs 94K created/day ≈ 8K/day × ~18 days ≈ 145K rows) agree to within ~3%.
- **G2's failure evidence is direct, not inferred.** Four consecutive scheduled runs (Aug 02–05) read from the droplet journal, all four failing, with task ids and both distinct exception types quoted. The journal window returned nothing before Aug 02 (retention), so **how long this has been failing is not established** — only that it fails on every run that can be observed.
- **Derived, not measured.** The ~3.3 GB of `BattleObservation` TOAST free space is **13 GB relation − ~9.7 GB sampled live payload**. `pgstattuple_approx` cannot read `pg_toast` on DO managed PG. Treat as ±0.5 GB.
- **Projections.** G3's full-depth figure and G7's ~15.8 GB scale today's 53-day depth linearly to 105 days. This **assumes a flat ingest rate**; if coverage keeps growing they are underestimates. Marked *projected*.
- **Deterministic, not sampled.** G3's 56 B/row is arithmetic: 14 `NOT NULL int4` columns pack without padding or null-bitmap saving.
- **Code sweep.** `models.py` in full; per-field and per-symbol greps across `data.py`, `views.py`, `serializers.py`, `tasks.py`, `incremental_battles.py`, `landing.py`, `urls.py`, `visit_analytics.py`, `player_records.py`, `clan_crawl.py`, the management-command tree, `deploy/deploy_to_droplet.sh`, and the whole `client/app` tree. Call sites cited as "discards the return value" (G4) and "never reads them" (G3) were **read**, not inferred from grep shape.
- **Not verifiable from the repo.** Celery Beat schedules live in the DB (`django_celery_beat`); task start times were read from the journal instead.
- **Open measurement.** How many consecutive nights G2 has been failing (journal retention truncated the window at 6–8 days). Worth establishing before sizing the backlog precisely — the residue may be larger than 2.1 GB if the failure predates the 07-20 repack.

## Related docs

- `agents/runbooks/runbook-db-table-audit-2026-07-19.md` — the F-series this delta-audits; its Applied log and the 2026-07-21 `VACUUM FULL` outage note.
- `agents/runbooks/runbook-battle-history-archive-prune-2026-06-17.md` — the archive/prune mechanism; **retention figure stale (says 92; prod is a deliberate 105 since 2026-07-24, sustaining the 90d read target)**. Also the source of G2's remediation precedent: retention sweeps belong on systemd timers, not Celery worker slots.
- `agents/runbooks/runbook-data-lifecycle-architecture-2026-06-21.md` — the per-table lifecycle matrix; `KEEP=1` is correct there, but §3's "coverage-bound, decelerating" claim for `battleobservation` needs G2's decomposition.
- `agents/work-items/snapshot-delta-gated-writes-spec.md` — the delta gate verified in G1.
- `agents/work-items/ship-pop-daily-rollup-spec.md` — the F9.2 pattern G8b wants replicated.
- `agents/runbooks/runbook-db-cpu-saturation-2026-05-24.md` — the incident that created the compaction job G2 finds broken.
