---
name: recapture
description: Read the latest lapsed-player recapture sweep results from the production droplet and give a per-realm yield readout — how many dormant ("gone") players the cheap bulk account/info sweep found have actually returned, split by whether they re-entered the active-7d floor scope (harvested free) and whether they're clanless (the marginal value nothing else recovers). Use when the user says "/recapture", "recapture readout", "how's recapture", "are returning players being found", "lapsed player yield", or asks how the dormant-player recapture sweep is doing. Read-only — never writes, never restarts anything.
---

# recapture

Reads the durable per-run JSON yield snapshots that `recapture_lapsed_players`
writes at the end of each run (`<RECAPTURE_BENCHMARK_DIR>/YYYY-MM-DD_HHMMZ_<realm>.json`,
default dir `/opt/battlestats-server/shared/benchmarks/recapture-lapsed`, sibling
of the crawl-yield / observation-floor benchmarks), and renders a per-realm yield
readout answering: is the daily dormant-pool sweep actually finding returning
players, and how many re-enter floor scope for free? (Files, not the worker
journal: the background worker suppresses module-logger INFO, so a logged summary
line never lands — same reason `/observation` and `/crawl-yield` read files.)

Background: the observation floor only sees active-7d players, so a player who's
been quiet longer is never re-checked and a returner stays invisible to battle
capture until a profile view or clan crawl. The recapture sweep
(`recapture_lapsed_players_task`, per-realm Beat ~10:10/10:30/10:50 UTC) cheaply
re-checks the dormant pool via bulk `account/info`; when a player's
`last_battle_time` has advanced back inside active-7d it rewrites
`last_battle_date` so the existing floor harvests them next cycle. Full context:
`agents/runbooks/runbook-recapture-lapsed-players-2026-06-26.md`.

**Scope.** This measures the **recapture sweep**, not the floor or the crawl. For
floor coverage/freshness use `/observation`; for the clan crawl's discovery /
dormant→active yield use `/crawl-yield` (the crawl is the *other* dormant→active
instrument, scoped to clan members). This skill reads the *last completed run*, not
live worker health.

## When to invoke

- "/recapture", "recapture readout", "how's recapture", "recapture yield"
- "are returning players being found", "lapsed player yield", "did the sweep find anyone"
- After flipping `RECAPTURE_LAPSED_APPLY` or changing the band/limit, to confirm yield

Do **not** invoke for: floor coverage (`/observation`), clan-crawl yield
(`/crawl-yield`), or live worker health (`enrichment-status` / `event-check`).

## How to read it

Pull the latest snapshot per realm plus the live config (so you can tell
apply-mode from detect-only):

```bash
ssh root@battlestats.online '
DIR=/opt/battlestats-server/shared/benchmarks/recapture-lapsed
echo "=== latest snapshot per realm ===";
for r in na eu asia; do
  f=$(ls -1t "$DIR"/*_"$r".json 2>/dev/null | head -1);
  [ -n "$f" ] && { echo "--- $r ($(basename "$f")) ---"; cat "$f"; } || echo "--- $r: (no run yet) ---";
done
echo "=== config (env) ===";
grep -E "^RECAPTURE_LAPSED_" /etc/battlestats-server.env || echo "(no RECAPTURE_LAPSED_* set)";
'
```

If a realm shows "(no run yet)", or its newest file is days old while another
realm's is current, the run is failing before it writes. Check the worker:

```bash
ssh root@battlestats.online 'journalctl -u battlestats-celery-background \
  --since "7 days ago" --no-pager | grep -E "recapture.*(succeeded|Soft time limit|raised)"'
```

Otherwise: either the Beat hasn't fired yet (it runs ~10:10/10:30/10:50 UTC) or
`RECAPTURE_LAPSED_ENABLED` is not `1` (gated off — say so). A manual kick is `recapture_lapsed_players_task.delay(realm="eu")` from a
server-venv `manage.py shell` (or `manage.py recapture_lapsed_players --realm eu
--limit 5000` for a one-off detect-only sample). Snapshots are timestamped and
kept, so a realm's `ls -1t … | head` is "the last run"; older files are history.

## The snapshot fields

Each JSON snapshot carries: `realm`, `mode` (`apply` writes + rotates; `detect`
measures only), `band_days`, `partial`, `aborted`, `abort_reason`, `flush_failed`, `duration_s`,
`candidates`, `scanned`, `wg_calls`, `cursor_stamped`, and the yield breakdown.

`duration_s` (added 2026-08-16) is wall-clock for the pass; older snapshots lack
it. Read it against the realm's soft limit — `RECAPTURE_TASK_OPTS` is 900s
(`server/warships/tasks.py`) — and treat anything above ~85% of that as a
near-miss worth reporting even when `partial` is false. Rates differ ~2x by
realm (asia 35–46 rows/s, na 66–85), so compare a realm against **itself**.

**A missing snapshot is a finding in its own right, and the loudest one.** If a
realm's newest file predates a sibling's by a whole day, do not reach for the
`partial` field to explain it — that field belongs to the *previous* run's file
and describes a different pass. On 2026-08-15 asia's run hit its soft limit and
then **crashed in the truncation handler**, writing nothing; the ops email
reported staleness alongside a `recapture_partial` condition whose operands were
the day-old file, and the two read as one story when they were two. Confirm what
the last run actually did before interpreting any number:

```bash
ssh root@battlestats.online 'journalctl -u battlestats-celery-background \
  --since "3 days ago" --no-pager | grep -E "recapture.*(received|succeeded|raised|Soft time)"'
```

`raised` with no matching snapshot = a crash, not a truncation.
Runbook: `agents/runbooks/runbook-recapture-truncation-handler-crash-2026-08-16.md`.

**Read `aborted` before anything else.** `true` means a run of unproductive WG
chunks tripped the upstream-failure guard and the pass stopped early
(`RECAPTURE_MAX_CONSECUTIVE_CHUNK_FAILURES`, default 10). **Such a run is
non-informative, not zero-yield**: its outcome buckets are empty and
`cursor_stamped` is 0 *by design*, because a failed chunk deliberately skips the
rotation stamp so those rows retry rather than rotate past unchecked. Report it
as "aborted — upstream", name `abort_reason`, and do **not** read its yield
numbers as a decline. No action is needed; the same rows come back on the next
daily run. Note that `partial` is `false` on an aborted run — the two are
separate axes, so `aborted` cannot be inferred from `partial`.

Before blaming the sweep, check the sibling realms' snapshots from the same
morning: two clean realms rule out credentials and rate limiting immediately and
point at the transport (2026-08-12 was ~20 min of DNS failure on
`api.worldofwarships.asia` alone). Runbook:
`agents/runbooks/runbook-recapture-upstream-failure-guard-2026-08-12.md`.

**Then read `partial`.** `true` means the worker's soft time limit cut the pass
short: everything reported is real and durable (writes flush incrementally), but
it covers only `scanned` of `candidates` rows. A partial run has the *same*
`scanned < limit` signature as a healthy pass that exhausted the pool, so without
this check a truncated realm reads as "maintenance mode, steady state" — which is
exactly how EU/ASIA went unnoticed for two weeks before 2026-08-06. Say
"partial (N of M)" in the readout and treat repeated partials as the signal that
the run no longer fits its budget.

When that happens, **check contention before blaming the sweep**: a partial is as
often the `background` queue being saturated by something else in the same window
as it is the pass genuinely growing. The durations are not in the snapshot (no
`duration_s` field yet) — reconstruct them from `journalctl` and compare against
the realm's own baseline, since the realms differ ~2x in throughput (asia 35–46
rows/s, na 66–85). The levers, their real costs, and a one-at-a-time order for
applying them are in
`agents/runbooks/runbook-recapture-soft-limit-budget-2026-08-13.md`; do not reach
for a lever before Step 0 of that path.

**Then read `flush_failed`** — a THIRD axis, independent of both. `true` means the
scan's own counters are honest but the finalizing write did not land, so
`cursor_stamped` is short of `scanned` and that tail keeps a NULL cursor and
retries next run. Yield figures are still real; rotation progress is what was
lost. Report it as "tail flush failed" and check the worker journal for the
cause.

The yield fields:

- **`advanced`** — players whose WG `last_battle_time` moved past our stored value
  = genuine new activity since we last knew. This is the headline "returners
  found." `advanced / scanned` is the yield rate.
- **`into7d`** — of those, how many landed back **inside active-7d**. These are
  promoted into floor scope and **harvested for free** on the next floor cycle —
  the whole point.
- **`into7d_clanless`** — the subset with no clan. **This is the marginal value**:
  returners the clan crawl structurally can't recover (it only walks clan
  rosters). A profile view is the only other way they'd have been found.
- **`still_lapsed`** — advanced but still outside active-7d (e.g. played once at
  day 200→day 120). Their displayed idle is corrected but the floor won't harvest
  them.
- **`still_dormant`** — checked, no new battles since our stored value (the bulk
  of any healthy sweep). `hidden` / `no_data` / `errors` are the non-productive
  remainder.

## Readout shape

Present a compact per-realm table (realm · mode · partial · scanned · advanced
(yield%) · into7d · into7d_clanless · still_lapsed), then 2–4 sentences of
interpretation:

- **Date-check every row.** A snapshot older than ~2 days for a daily task is
  itself the finding; lead with it rather than reporting its numbers as current.

- Lead with the **into7d_clanless** count across realms — that's the returners
  *only* this sweep recovers; it's the number that justifies the feature.
- Note the **yield rate** (advanced/scanned) and whether it's worth the cadence;
  a healthy dormant pool is mostly `still_dormant`, so low single-digit % yield is
  expected and fine — the question is absolute returner count, not the rate.
- Flag anomalies: `partial=true` (the pass was truncated — see above); a stale
  `captured_at`; `mode=detect` (writes are off — returners are being *measured*
  not *recaptured*, flip `RECAPTURE_LAPSED_APPLY=1`); high `errors`/`no_data`
  (WG trouble); `scanned` much smaller than the band **on a non-partial run**
  (cursor exhausted the pool → maintenance mode, which is the steady state).

End with the live config line: `ENABLED=<0/1> APPLY=<0/1> band=<min-max>d
limit=<n>`, and whether the sweep is doing real work or just measuring.

Read-only: never edit env, restart workers, or dispatch a run unless the user
explicitly asks for a manual kick.
