# Runbook — The recapture truncation handler crashed and erased its own run (2026-08-16)

_Created: 2026-08-16_
_Context: the 2026-08-15 ops email fired `snapshot_stale:recapture-lapsed:asia` and `recapture_partial:asia`. The alert framed both as "the same asia pass." They are not: the partial condition was reading the **2026-08-14** file, and the staleness was caused by the **2026-08-15** run crashing in its truncation handler and writing no snapshot at all._
_Status: **FIX WRITTEN, TESTED, NOT DEPLOYED.** Branch `worktree-fix+recapture-truncation-handler`. Two regression tests verified failing against the old code. Deploy is a `server/deploy` push plus a `background` worker restart._

## The one-paragraph version

`recapture_lapsed_players` has caught `SoftTimeLimitExceeded` and finalized a partial pass since v5.1.6. On 2026-08-15 the asia run hit its 900s soft limit at 11:05:00 and the handler itself died **117ms later** with `ProgrammingError: can't change 'autocommit' now: connection in transaction status ACTIVE`. Because the snapshot write sat *downstream* of an unguarded `flush()`, the crash erased the record of the whole run — ~26,000 rows scanned, nothing reported. This is the **same shape as the pre-v5.1.6 defect** the handler was built to fix (output gated behind a write that can fail), displaced by one stack frame.

## Mechanism

`SoftTimeLimitExceeded` is delivered as a signal and lands on an arbitrary bytecode boundary. When it lands inside a write's transaction handling, Python unwinds out of Django's `atomic` bookkeeping while the **server-side transaction is still open**. Django's own state then says autocommit; psycopg's connection says `INTRANS`. The next `atomic()` entry calls `set_autocommit(False)`, psycopg checks `_check_intrans_gen`, and raises.

The discriminator is in the timing, and it is worth internalising because it distinguishes this from a slow finalizer:

| day | soft limit fired | handler outcome | gap |
|---|---|---|---|
| Aug 13 | 11:27:31 | `TRUNCATED` logged, snapshot written | **13s** (the recovery flush doing real work) |
| Aug 14 | 11:18:19 | `TRUNCATED` logged, snapshot written | **12s** |
| Aug 15 | 11:05:00.029 | `ProgrammingError`, no snapshot | **117ms** |

Instant failure at the *first* `atomic()` entry means the connection was already dirty on entry. Aug 13 and Aug 14 were **timing luck**, not robustness: the signal happened to land outside a transaction. So this is **latent since v5.1.6 on any realm that truncates**, not a v5.3.10 regression.

## Blast radius — it is not only recapture

`journalctl -u battlestats-celery-background --since "14 days ago" | grep "can.t change .autocommit"` returns three events:

| when | task | consequence |
|---|---|---|
| Aug 10 04:39:00 | `roll_up_player_daily_ship_stats_task` | whole rollup window lost |
| Aug 12 04:39:00 | `roll_up_player_daily_ship_stats_task` | whole rollup window lost |
| Aug 15 11:05:00 | `recapture_lapsed_players_task` | whole snapshot lost |

The rollup task starts at 04:30:00 and blows a **540s** soft limit at 04:39:00 — the identical wall-clock second on both days, which is the signature of a fixed schedule meeting a fixed budget. It has **no** `except SoftTimeLimitExceeded` handler (`recapture_lapsed_players.py` holds the only one in the codebase), so it simply dies; the autocommit error is the *symptom* of where the signal landed, not an extra fault. **This matters more since v5.3.9 put the ship-list all-view on `ShipPopDailyAgg`** — the thing this task builds. A lost rollup day is now a gap in a read path, not just in a table. Not fixed here; see Outstanding.

## The fix (3 defects, one commit)

`server/warships/management/commands/recapture_lapsed_players.py`

1. **Reset the connection in the handler.** `connection.close()`, guarded on `connection.connection is not None and not connection.in_atomic_block`. That flag being False *is* the desync; closing while it is True would set `closed_in_transaction` and break the caller's transaction — which is what a Django `TestCase` always is.
2. **Guard the finalizing `flush()` and carry `flush_failed` into the snapshot.** The snapshot must never again be downstream of a write that can fail. `flush_failed` is a **third axis**, independent of `partial` and `aborted`: the scan's numbers are honest but `cursor_stamped` is short of `scanned`, and those rows retry next run. It is a boolean, not a `status` string, for the same reason `aborted` is — the ops email's `_check_generic_shape` keys on `status` and would fire a redundant condition.
3. **Fix a double-count in `flush()`.** It did `advanced += len(promote)` *before* the write and cleared the buffer *after*, so a signal landing in between left the buffer full and the finalizing `flush()` counted those rows twice — inflating the headline returner figure on exactly the truncated runs the ops mail scrutinises. Now: write → count → clear. Re-running an interrupted write is safe because `bulk_update` and the cursor stamp are both idempotent, so this is correct under every interleaving.

Also guarded the cosmetic sample `Clan` name lookup, which is a DB read that runs after the snapshot is already durable and should never be the thing that fails the task.

## Did the double-count corrupt the recorded history? No.

Worth settling, because asia's Aug 14 snapshot reports **8.74%** yield against NA's 3.63% and EU's 4.22% on Aug 15, and that figure is quoted in the budget runbook's tables. A non-partial run cannot double-count — no async exception means no interrupted flush — so the test is asia's partial days against asia's own non-partial history:

| day | partial | scanned | advanced | yield |
|---|---|---|---|---|
| Aug 06–11 (6 runs) | false | 30,000 | 527–1,486 | **1.76%–4.95%** |
| Aug 12 | false | 30,000 | 0 | 0% (DNS outage; nothing stamped) |
| Aug 13 | **true** | 23,100 | 707 | **3.06%** |
| Aug 14 | **true** | 28,800 | 2,518 | **8.74%** |

**Aug 13 is partial and entirely normal.** If the double-count were distorting partial runs as a class, it would show there too. The arithmetic agrees: `flush()` fires every `CURSOR_STAMP_CHUNK` = 2,000 checked rows, so the `promote` buffer at risk of being counted twice holds roughly 2,000 × yield ≈ **80 rows** — nowhere near the ~1,200 gap between Aug 14 and asia's baseline.

**The better explanation for Aug 14 is the Aug 12 outage.** That pass stamped **zero** rows by design (a failed chunk deliberately skips the rotation stamp; see `runbook-recapture-upstream-failure-guard-2026-08-12.md`), so its 30,000 rows kept a NULL cursor and sorted first again. Aug 13 and Aug 14 therefore worked a slice that had gone unchecked for roughly twice the usual LRU interval, and a longer unchecked interval mechanically yields more returners. Elevated yield after an outage is the system working, not a counter fault.

**So the fix is prospective.** The double-count is a real bug and worth closing, but no recorded figure needs a correction note. Aug 14's 2,518 stands.

## Tests

`server/warships/tests/test_recapture_lapsed_players.py`, both verified failing against the old command and passing against the fix (28 passed).

- `test_snapshot_lands_even_when_the_finalizing_flush_raises`
- `test_interrupted_flush_does_not_double_count_advanced`

**Why the pre-existing truncation tests could not catch this.** `_run_interrupted` raises `SoftTimeLimitExceeded` synchronously from the WG mock, at a controlled point that is never inside a transaction. It tests "truncation is handled." The invariant that was actually violated is **"no failure of the tail write can erase the record of the run"** — which requires failing the tail write directly, not interrupting the scan.

## Detector gap

There is no ops condition for **"the task raised."** A crash surfaces only as staleness, a day late, and — as here — gets mislabelled by a `partial` condition that is reading the previous day's file. This is the same blindness class as the `chunk_errors` note in `runbook-recapture-upstream-failure-guard-2026-08-12.md`: a hole in the pass has no field that says "this pass accounted for nothing," so unrelated detectors each report their own view of it.

## Outstanding

1. **Deploy.** `./server/deploy/deploy_to_droplet.sh battlestats.online`, then restart `battlestats-celery-background`. The asia stripe fires ~10:50 UTC daily; landing before that gets the fix its first real exercise immediately.
2. **`roll_up_player_daily_ship_stats_task` has the same exposure and no handler at all.** Decide between raising its 540s budget and giving it an incremental-flush + finalize path like recapture's. Two lost windows in 14 days, and v5.3.9 made the output load-bearing.
3. **Two detector gaps, both still open, and `flush_failed` opened the second one.**
   - **"The task raised"** — a crash is invisible except as next-day staleness.
   - **`flush_failed` has no condition.** A run that is *not* truncated but whose tail flush fails returns `None`, reports `succeeded` to Celery, and writes a snapshot that reads healthy while `cursor_stamped < scanned`. That is the same silence class this commit just closed, one field over. The cheap version is a condition on `cursor_stamped != scanned` for a non-aborted pass, which subsumes it.
4. ~~**No `duration_s` in the snapshot**~~ **DONE in this commit.** `captured_at` is stamped at task *receipt*, not completion, so duration was reconstructible only from `journalctl "succeeded in Ns"` — which is why every budget question about this task so far has needed a droplet login. `duration_s` is now written on every pass. The near-miss detector it unblocks (duration > 85% of the 900s soft limit) is **not** built yet, and it would have flagged asia days before either failure mode bit. Snapshots written before 2026-08-16 lack the field; consumers must tolerate its absence.
5. **Audit the other soft-limit-bearing periodic tasks** for the same "writes only at the end" shape. Budgets are code constants, not env: `RECAPTURE_TASK_OPTS` is 15 min soft / 16 min hard and the shared `TASK_OPTS` is 27/30, both in `server/warships/tasks.py:36-55` (read 2026-08-16). The 900s and 540s figures in this runbook are the limits the **live journal** reported firing on 2026-08-13/14/15 and 2026-08-10/12 respectively, which is the stronger authority.

## Related

- `runbook-recapture-soft-limit-budget-2026-08-13.md` — the contention diagnosis and the L1–L4 lever order. **This fix is not a lever**; it does not touch the one-at-a-time sequence. Its Step 1 precondition is reconciled there.
- `runbook-recapture-upstream-failure-guard-2026-08-12.md` — the `aborted` axis and the read-`chunk_errors`-first rule.
- `runbook-recapture-lapsed-players-2026-06-26.md` — the sweep's design.
- `runbook-ship-list-rollup-source-2026-08-14.md` — why a lost rollup window now costs a read path.
