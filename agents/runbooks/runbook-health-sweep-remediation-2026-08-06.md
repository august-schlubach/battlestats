# Runbook: Health-Sweep Findings — Sequenced Remediation

_Created: 2026-08-06_
_Lifecycle: dated-active · Owner: platform_
_Context: a two-week health sweep (observation floor + clan crawl + full server error-log review, 2026-07-23 → 2026-08-06) found both capture engines healthy and six unrelated defects behind them. Five are live; one is an instrument regression. This runbook is the execution plan for all six._
_QA: every figure below was measured live on battlestats.online 2026-08-06 02:40–03:10 UTC with read-only commands. Code claims carry file:line against `50f0756`. The commands that produced each number are reproduced inline so they can be re-run._
_QA pass 2026-08-06 (second sweep, after first draft): every file:line re-checked against the tree; every behavioural claim converted into an executable test in `server/warships/tests/test_runbook_qa_2026_08_06.py` (8 tests, all passing; full suite 924 passed / 2 skipped). That pass corrected two line/count errors, disproved half of one hypothesis, and found F6 — see "QA log" at the end for what changed and why._
_Status 2026-08-06 (implementation pass): **F1, F2, F3, F4 and F6 are implemented** on branch `docs/health-sweep-remediation-2026-08-06`, TDD, full backend suite **969 passed / 2 skipped**. **F5 is untouched** — it is an operator lever. **Nothing is deployed**: `VERSION` is unbumped, no env changed, no droplet mutated. See the Validation table and the "Implementation log" at the end._

## Purpose

Convert a health sweep into an ordered, gated work plan. Read this before touching any
of the six findings; work them in the order given, **one production lever at a time**,
with an operator acknowledgement between each (standing rule: no autonomous batches of
prod mutations).

The sweep's headline is that the things we normally worry about are fine. The observation
floor and the clan crawl are both healthy and need no tuning. Everything below is
maintenance debt sitting underneath them, and one item (F1) has been quietly consuming a
third of a million upstream API calls per day.

## TL;DR

| # | Finding | Severity | Fix cost | Deploy needed |
|---|---|---|---|---|
| F1 | 42 ship IDs in a permanent WG-fetch loop; ~385k wasted API calls/day | **HIGH** | small code | backend |
| F2 | `enrichment_reclassify_drift_task` fails daily for eu + asia | **MEDIUM** | env only, *or* small code | none / backend |
| F3 | Live 500 on `/api/player/<name>` from an unguarded None (25 in 14d) | **MEDIUM** | one line | backend |
| F4 | `gap_1d` decomposition blinded by the snapshot delta gate | LOW | code + doc | backend |
| F5 | `django.log` 615 MB unrotated; 125 MB stale drain logs | LOW | ops only | none |
| F6 | 16 `/api/fetch/*` routes 500 on a non-numeric player id (13 in 14d) | **MEDIUM** | small code | backend |

**Recommended order: F2 → F3 + F6 → F1 → F5 → F4.** Rationale in "Execution order" below.

F1 and F3 share one root cause worth naming once: **Wargaming returns `{"<id>": null}`
for entities it will not serve.** The key is *present* and the value is *null*. Two
separate call sites mishandle this in two different ways. Any future WG endpoint
integration should assume this shape. F6 is unrelated to that idiom — it is our own
route-typing — but it lands on the same 500 counter, which is why the two had to be
separated before either count could be trusted.

## Baseline: what the sweep found healthy

Recorded so a future reader can tell these findings apart from a capture regression.
Neither engine needs attention.

**Observation floor** — 16 clean daily 04:30Z snapshots, 2026-07-21 → 08-05, fixed config
throughout (`LIMIT=12000 HOURS=8 SELF_CHAIN=1 CHANGE_GATE=1 BULK=na,eu,asia`).

| | active_7d | distinct_productive | cov/7d | % of ceiling |
|---|---|---|---|---|
| na | 51,926 | 12,717 | 24.5% | 59% |
| eu | 91,447 | 27,125 | 29.7% | 87% |
| asia | 64,965 | 21,856 | 33.6% | 79% |
| **TOTAL** | **208,338** | **61,698** | **29.6%** | **77%** |

Two-week TOTAL band 28.2%–35.4%; `active_7d` flat 204k–213k; `never_observed` 366 (band
108–480), no trend. NA's 08-05 dip to 24.5% decomposes to the denominator, not capture:
`active_1d` fell 26,125 → 21,631 the same day, and NA's own band at this config is
23.4%–33.5%. **Not a regression.** Per `/observation` verdict discipline: within noise.

**Clan crawl** — still earning its cost; keep cadence.

| realm | pass captured | classified | yield | yield_frac | overlap |
|---|---|---|---|---|---|
| na | 08-04 | 274,605 | 3,178 | 1.16% | 52,944 |
| asia | 08-03 | 260,796 | 4,228 | 1.62% | 67,760 |
| eu | 08-01 | 471,664 | 15,994 | 3.39% | 89,614 |

Yield is almost entirely `reactivated` (dormant→active re-detection), which the floor
structurally cannot produce, and `active_7d` is flat, so that yield is exactly offsetting
churn. Trap 1 does not fire despite `discovered_dormant` being near-zero (0–15), because
absolute yield is still thousands per pass. Crawl confirmed **live, not stalled**: asia
mid-pass at 13,226/22,112 clans, `:1:warships:tasks:crawl_all_clans:asia:lock` held.

**Host** — no failed units; disk 33 G/87 G = **39%** (the 2026-08-05 remediation held);
load15 0.79 against the 2.3 alarm; all timers armed, `battlestats-compact-observations`
first firing 2026-08-06 12:32 UTC as expected.

**nginx** — zero unexplained 5xx across the retained window (07-23 → 08-06). All 96
`connect() failed` lines fall inside deploy windows; the largest cluster (37 lines,
08-05 05:45–05:52, one client IP) maps exactly to `battlestats-gunicorn` stopping at
05:45:24 and starting at 05:46:37. The 404 `access forbidden by rule` lines are the
deliberate operator IP blocks.

## Read this before trusting any log query here

Two traps cost real time during this sweep. Both will re-fire on the next one.

**1. journald holds ~3.4 days, not two weeks.** Oldest entry at sweep time was
`2026-08-02T17:59`; the journal is 3.9 GB and F1 is why. So
`journalctl --since "14 days ago"` silently answers a question about a window that does
not exist. For anything older use `/opt/battlestats-server/shared/logs/django.log`, which
spans **2026-04-05 → now** (and see F5).

**2. `journalctl -p err` returns 0 for every Celery unit.** They log to stdout at info
priority, so priority filtering is blind. Grep the text instead — and use journald's own
matcher, not a pipe:

```bash
# right: journald filters internally
journalctl -u battlestats-celery-floor --since "1 day ago" -o cat --no-pager -g "ERROR|Traceback"

# wrong: serializes every info line to text first, times out past ~300s
journalctl -u battlestats-celery-floor --since "7 days ago" --no-pager | grep ERROR
```

Error-line volume by unit at sweep time (3.4-day journal): floor **2,489,990**;
background 323,241; hydration 3,116; crawls 53; gunicorn 71; beat 0; client 0. Better
than 99% of that is F1.

## Findings

### F1 (HIGH): 42 unresolvable ship IDs in a permanent WG-fetch loop

`server/warships/api/ships.py:366` `_fetch_ship_info()`.

For 42 specific ship IDs (`4183209776`, `4183209968`, `4184782288`, `4287543280`,
`4290754544`, …) the function cannot ever succeed, and nothing stops it retrying:

1. `Ship.objects.get_or_create(ship_id=…)` creates a row with no name, type, or tier.
2. `needs_refresh = created or not ship.name or not ship.ship_type or ship.tier is None`
   is therefore **permanently True** for that row, forever.
3. `encyclopedia/ships/` returns `{"<id>": null}`, so the `if data and data.get(str(ship_id))`
   branch fails.
4. The else branch logs two ERROR lines and does `return None` — **without ever caching
   the negative result** and without marking the row unresolvable.
5. The next caller repeats all of it.

These are almost certainly WG test ships; cf. the standing note that WG excludes test-ship
stats from the public API. The set is **stable at exactly 42**, confirmed independently on
the floor worker over 1 day and across floor + background + hydration over 3 days
(`… -g "Null or invalid response data for ship_id" | grep -oE "ship_id: [0-9]+" | sort -u | wc -l`).
It is a fixed roster, not a growing one, which is why a per-ID negative cache fully
resolves it.

**Verified to be real network traffic, not short-circuited upstream.**
`warships/api/client.py:111` `make_api_request` → `_request_api_payload` has no response
cache and no in-flight dedup; it acquires a rate-limiter token and calls `session.get()`.
Corroborated on the droplet over one day on the floor worker alone:

```bash
journalctl -u battlestats-celery-floor --since "1 day ago" -o cat --no-pager \
  -g "Remote fetching ship info" | wc -l                    # 343,404
journalctl -u battlestats-celery-floor --since "1 day ago" -o cat --no-pager \
  -g "Null or invalid response data for ship_id" | wc -l    # 343,563
```

1:1. Every attempt is a real WG call.

Measured cost per day: floor ~343k calls (686k log lines), background ~42k (85k lines),
hydration ~440. **≈385k wasted WG API calls/day and ≈800k ERROR lines/day.**

- **Risk of inaction**: burns the WG rate-limit budget the Redis token-bucket exists to
  protect, on requests that can never succeed; caps journald retention at 3.4 days so any
  real error older than that is unrecoverable; buries genuine errors under a 99%+ noise
  floor; needless `get_or_create` churn on `warships_ship`.
- **Remediation**: negative-cache the null result under the existing `ship:<id>` cache key
  with a sentinel and a TTL measured in hours to days, so a WoWS patch that later publishes
  the ship still heals; and demote both log lines from `logging.error` to `debug`. Keep the
  behaviour of returning `None` to callers unchanged. Optionally also flag the `Ship` row
  as unresolvable so the DB round-trip goes too, but the cache alone removes the API cost.
- **Test**: a WG response of `{"<id>": None}` must produce exactly one upstream call across
  N invocations within the TTL.

### F2 (MEDIUM): `enrichment_reclassify_drift_task` fails daily for eu and asia

Statement timeout at exactly 420 s, `reclassify_enrichment_status.py:139`:

```
psycopg.errors.QueryCanceled: canceling statement due to statement timeout
django.db.utils.OperationalError: canceling statement due to statement timeout
```

Observed in the retained journal: 08-03 na + eu + asia; 08-04 eu + asia; 08-05 eu + asia.
NA usually passes, consistent with its smaller pool.

**All seven buckets run inside one `transaction.atomic()`**
(`reclassify_enrichment_status.py:135`), so a timeout on any single bucket UPDATE rolls
back all of them. Net effect: **eu and asia have been getting zero `skipped_*` drift
rescue every day.** CLAUDE.md's "~6–11 min/realm observed" straddles the 7-minute cap;
the incremental has simply outgrown it.

**The scoping is intact** — this is genuinely marginal, not a lost filter. `tasks.py`
passes `--recent-hours 25`, and `handle()` applies `base.filter(last_fetch__gte=cutoff)`
(`reclassify_enrichment_status.py:70–72`). Verified explicitly because a dropped filter
would have meant a full-catalog scan (~36 min) and a completely different fix.

**This exact failure mode already happened once and was tuned around.** The code comment
above the timeout reads: *"120s was too tight and silently rolled back the whole pass."*
The cap was raised 120 → 420. The pool has now outgrown 420 as well. Raising it again is
a legitimate immediate fix but is the third instance of the same pattern; the structural
fix below is what stops a fourth.

**Correction from the implementation pass — "silent" was too strong.** The task already
called `logger.exception(...)`, so the traceback *was* emitted at ERROR level; that is how
this sweep found it. What it did not do was fail: it caught, logged, and returned
`{'status': 'error'}`, so Celery recorded `succeeded in 420.02s` and nothing downstream —
Flower, the ops digest, any alert — could tell a lost pass from a good one. The defect is
the mismatch between a loud log nobody reads and a success nothing questions.

- **Risk of inaction**: two of three realms never get `skipped_low_wr` / `skipped_inactive`
  / `skipped_hidden` rows re-evaluated, so returning and newly-eligible players stay parked
  in the wrong enrichment bucket indefinitely. This is precisely the drift the daily Beat
  exists to rescue.
- **Remediation — two levers, and the cheap one is not the safe one.** Read both before
  choosing; this is an operator decision, not a default.

  1. **Raise the cap. Env only, no deploy — cheapest, but the riskier lever.**
     `ENRICHMENT_RECLASSIFY_STATEMENT_TIMEOUT` is currently **unset** on the droplet
     (verified against `/etc/battlestats-server.env`), so it defaults to 420. Set it in
     Pass and regenerate the env file (env files are generated from Pass; do not
     hand-edit). Unblocks eu/asia immediately.

     **Why it carries risk**: it *extends* a long analytical statement rather than bounding
     it, against a shared 2-vCPU managed PG that is periodically saturated by the
     analytical warmers. The task fires at 08:20 / 08:40 / 09:00 UTC. Watch `load15`
     against the 2.3 alarm on the first run.

     **Hard ceiling — and it is the Celery limit, not the lock.** The implementation pass
     corrected this. The binding constraint is `time_limit=1200` (20 min hard) /
     `soft_time_limit=1080` (18 min) on the task itself; the lock
     (`ENRICHMENT_RECLASSIFY_LOCK_TIMEOUT = 25 * 60` = 1500 s) sits *above* both, so it
     cannot expire while the task still runs. The real ordering is::

         budget + statement_timeout <= soft (1080) < hard (1200) <= lock (1500)

     So a raised statement timeout must satisfy `statement_timeout <= 1080 - budget`.
     Note also that this is the third value in the sequence 120 → 420 → N; raising it does
     not stop a fourth, which is why lever 2 is preferred.

  2. **Bound the statement instead. Code, higher effort — the lower-risk lever.** Commit
     per bucket rather than wrapping all seven in one `transaction.atomic()`, so a slow
     bucket costs that bucket alone instead of the whole pass. This both fixes the symptom
     and removes the all-or-nothing rollback that turned a slow query into total data loss
     for two realms. **Preferred if a deploy is affordable.**

     **Safety of per-bucket commit is tested, not assumed**
     (`test_f2_buckets_are_pairwise_disjoint`): the seven bucket querysets are pairwise
     disjoint, so no row is claimed by two buckets and splitting the transaction cannot
     change the final classification. The in-code comment *"Order matters: most specific
     buckets first"* is defensive rather than load-bearing — the filters are already
     mutually exclusive on `battles_json` → `is_hidden` → `pvp_battles` →
     `days_since_last_battle` → `pvp_ratio`.

     **Implementation caveat**: the dry-run path currently relies on
     `transaction.set_rollback(True)` *inside* the shared atomic block
     (`reclassify_enrichment_status.py:144`). Per-bucket commit removes the block that
     makes that work, so `--dry-run` must be reworked in the same change — keep the
     existing `changing.count()` branch and simply never call `.update()`, rather than
     writing and rolling back.

  3. **Observability, either way** — make the failure loud. Return `{'status': 'error'}`
     *and* log at error level with the realm, or re-raise so Celery marks the task failed.
     Smallest change here, largest future value: a task reporting success while doing
     nothing is why this went unnoticed.
- **Separate defect found while testing F2 — the plan is disjoint but NOT exhaustive.**
  `pvp_ratio` is the plan's only nullable comparison operand
  (`FloatField(null=True)`; `days_since_last_battle` is `IntegerField(default=0)` and
  cannot be NULL, so only the win-rate split can strand a row). Neither `pvp_ratio__lt`
  nor `pvp_ratio__gte` is true for SQL NULL, so **a player with a NULL `pvp_ratio` matches
  no bucket at all** and reclassify can never correct their `enrichment_status` —
  independent of the timeout, and unfixed by either lever above. Proven by
  `test_f2_plan_is_disjoint_but_NOT_exhaustive`. Size the affected population before
  deciding whether to care:
  ```sql
  SELECT realm, count(*) FROM warships_player
   WHERE pvp_ratio IS NULL AND battles_json IS NULL AND is_hidden = false
   GROUP BY realm;
  ```
  If non-trivial, add an explicit terminal bucket rather than widening an existing filter.
- **Validation**: after the change, `-g "enrichment_reclassify_drift_task"` for eu and asia
  should show completion under the cap on two consecutive days. If lever 1 was taken, also
  check `load15` during the 08:20–09:00 UTC window.

### F3 (MEDIUM): live 500 from an unguarded None — the `{"id": null}` idiom again

`server/warships/api/clans.py:81`:

```python
return data.get(str(player_id), {}) if data else {}
```

When WG returns `{"<player_id>": null}` this yields **`None`, not `{}`** — the `{}` default
only applies when the key is *absent*, and here the key is present with a null value. The
caller at `server/warships/data.py:5177` is unguarded:

```python
clan_membership = _fetch_clan_membership_for_player(player.player_id, realm=player.realm)
clan_id = clan_membership.get("clan_id") or player_data.get("clan_id")   # AttributeError
```

Which produces exactly the observed trace, a hard 500 on `/api/player/<name>`:

```
File ".../warships/views.py", line 404, in get_object
File ".../warships/data.py", line 5415, in update_player_data
AttributeError: 'NoneType' object has no attribute 'get'
```

Note `data.py` already guards the *player* payload immediately above
(`if not player_data: … return`, line 5164); only the clan-membership payload is unguarded.

**Still present in current main (`50f0756`).** Frequency is low and bursty because it
depends on WG emitting a null membership payload: **25** Django 5xx across 2026-07-23 →
08-06 — not all 38 in the window; the other 13 are F6 below — and **none since
2026-08-02**. Per affected player it repeats until WG stops returning null: `hipbluedog`
10× on 07-25 and 3× on 07-26.

**Causal chain verified end-to-end, not inferred.** The production traceback names
`data.py:5415` in release `20260724205924`; that release is no longer on disk, but the
commit deployed at that timestamp is `0b54f55`, and `git show 0b54f55:server/warships/data.py`
line 5415 is exactly `clan_id = clan_membership.get("clan_id") or player_data.get("clan_id")`,
with `views.py:404` the `update_player_data(...)` call above it. A later trace (release
`20260730175918`, 08-02) names `data.py:5177` — the **current** main line number — so the
citation is stable across both releases. Counts corroborate: exactly 25 `AttributeError:
'NoneType' object has no attribute 'get'` and exactly 25 `in update_player_data` frames in
the window.

- **Risk of inaction**: a real user-facing 500 on the primary product surface, invisible
  from journald within days because F1 caps retention and because it is bursty.
- **Remediation**: one line, at the source rather than the call site, so every caller
  benefits: `return (data.get(str(player_id)) or {}) if data else {}`.
- **Test**: `_fetch_clan_membership_for_player` must return `{}` for a WG payload of
  `{"<id>": None}`. Worth also asserting `update_player_data` completes for that case.
- **Sweep**: grep for the same `.get(key, {})`-on-a-nullable-value shape elsewhere in
  `warships/api/`. F1 and F3 are two instances of one upstream idiom; there may be more.

### F4 (LOW): `gap_1d` decomposition was silently blinded by the snapshot delta gate

`SNAPSHOT_DELTA_GATE_ENABLED` went live 2026-07-20. The observation-floor benchmark's
`gap_1d` buckets flipped overnight and have stayed flipped:

| snapshot | `non_pvp_active` | `no_snapshot_pair` | total |
|---|---|---|---|
| 2026-07-18 | 18,380 | 5,856 | 25,034 |
| 2026-07-19 | 16,980 | 5,178 | 23,055 |
| **2026-07-21** | **64** | **21,088** | 21,883 |
| 2026-08-05 | 156 | 19,894 | 21,229 |

**Totals are unchanged (~21–25k), so this is an instrument regression, not a data
regression.** The classifier needs two `Snapshot` rows to form a pair; the delta gate
stopped writing rows for players whose PvP stats did not move, which is exactly the
`non_pvp_active` population it used to identify. The gap is still the same size; we simply
can no longer name its largest component.

- **Risk of inaction**: modest but real. `/observation`'s routing rule — "a dominant
  `non_pvp_active` means the residual gap is a capture-surface question, not a
  floor-throughput deficit, so do not raise cadence off it" — can no longer be evaluated,
  because the bucket is now structurally empty. A future operator reading a 20k
  `no_snapshot_pair` could mistake a known-benign PvE population for unclassifiable loss
  and tune the floor against a phantom.
- **Remediation**: reclassify from the per-day checked-set cache the delta gate already
  maintains (it knows it *checked* a player and found no movement, which is precisely
  `non_pvp_active`), rather than inferring movement from the presence of a second Snapshot
  row. Failing that, re-base the instrument and document the new meaning.
- **Doc**: `.claude/skills/observation/SKILL.md`'s `gap_1d` guidance currently describes a
  state that can no longer occur; reconcile it in the same change. Cross-check
  `agents/work-items/snapshot-delta-gated-writes-spec.md`, which did not anticipate this
  reader.

### F5 (LOW, housekeeping): unrotated and stale logs on the droplet

In `/opt/battlestats-server/shared/logs/`:

- `django.log` — **615 MB, unrotated since 2026-04-05.** Do not simply delete it: it is
  currently the *only* error record reaching back beyond journald's 3.4 days, and it is
  what made the two-week portion of this sweep possible at all. It wants logrotate with a
  retention long enough to keep ≥30 days, applied **after** F1 lands (F1 is a large share
  of its growth too).
- `drain_p0.log` … `drain_p4.log` — 125 MB combined, untouched since 2026-06-10. Stale
  artifacts of a completed one-off. Deletable.

- **Risk of inaction**: low today at 39% disk, but this is the same class of slow
  accumulation the 2026-08-05 disk remediation exists to prevent.
- **Remediation**: add a logrotate stanza for `django.log`; delete the drain logs.

### F6 (MEDIUM): 16 `/api/fetch/*` routes 500 on a non-numeric player id

**Found during the QA pass, not the original sweep.** Attributing all 38 window 5xx to F3
was wrong: 25 are F3, and the remaining **13 are this, a structurally different defect.**

`server/battlestats/urls.py` declares **16 route entries across 7 distinct fetch
endpoints** (`activity_data`, `player_clan_battle_seasons`, `player_summary`,
`randoms_data`, `ranked_data`, `tier_data`, `type_data`; each has a trailing-slash and a
no-slash variant) with a `<str:player_id>` converter:

```python
path('api/fetch/ranked_data/<str:player_id>/', ranked_data, name='fetch_ranked_data'),
path('api/fetch/player_summary/<str:player_id>/', player_summary, name='fetch_player_summary'),
```

The captured string is passed straight into a numeric ORM filter — e.g.
`server/warships/views.py:600` `Player.objects.filter(player_id=player_id, realm=realm)` —
so a non-numeric value raises inside Django's field coercion and escapes as an unhandled
500 rather than a 400 or 404:

```
File ".../django/db/models/fields/__init__.py", line 2125, in get_prep_value
ValueError: Field 'player_id' expected a number but got 'Detralon'.
```

**Last seen 2026-07-27** — older than F3's last occurrence (08-02), so neither is
currently firing; both are latent and traffic-dependent. Two distinct triggers observed in
the window, both real traffic:

| trigger | occurrences | what it looks like |
|---|---|---|
| a player **name** on an id-typed route | 11 | `Detralon` ×9, `AutisticHippo12`, `DusksFinalDemise` |
| the literal string **`"None"`** | 2 | `/api/fetch/ranked_data/None/` |

The `Detralon` burst is instructive: 9 500s inside two seconds (16:50:03–16:50:05 on
07-25), covering **all 7 affected endpoints** (`player_summary` and `tier_data` twice).
That the burst hits exactly the endpoint count is the point: **one bad id fans out to a
500 on every chart endpoint the player page requests**, so the user-visible failure is a
wholly broken page, not one missing chart. The `"None"` cases point at a client-side bug: a null id is
being stringified into the URL rather than the request being suppressed.

- **Risk of inaction**: unhandled 500s on the primary product surface, one per chart
  endpoint; they also pollute the 5xx counter badly enough that they masked themselves —
  F3's blast radius looked 50% larger than it is until these were separated out.
- **Remediation**:
  1. **Server** — validate at the boundary. Either change the converter to
     `<int:player_id>` (Django then returns a clean 404 for a non-numeric segment, no view
     change) or coerce with an explicit guard returning 400. Prefer the converter: it is
     16 mechanical edits in one file and cannot be forgotten in a new view. Check first whether any
     caller legitimately passes a *name* to these routes — if so, the fix is to resolve
     name → id in the view, not to reject.
  2. **Client** — stop emitting `None`. Find the call site that builds
     `/api/fetch/<chart>/<id>/` and suppress the request when the id is nullish, rather
     than interpolating it.
- **Test**: each fetch route must return 4xx, never 5xx, for `Detralon` and for `None`.
- **Note**: F6 is *not* the WG `{"<id>": null}` idiom; it is our own route typing. It
  shares only the symptom.

## Execution order

Do not batch. One production lever at a time, with an acknowledgement between each.

1. **F2 first**, because every day it waits is another day eu and asia get no drift
   rescue. But pick the lever deliberately: raising the cap is env-only and instant yet
   lengthens a heavy statement on a shared DB, while per-bucket commit needs a deploy and
   is the safer, permanent fix. If a backend deploy is already coming for F3/F1, prefer
   lever 2 and skip the env change entirely.
2. **F3 and F6 together, next.** Both are user-facing 500s on the player surface and both
   are small; shipping them in one backend deploy avoids paying the deploy + version-bump
   + client-rebuild cost twice. F3 is one line. F6 is a converter change across 16 route
   declarations plus one client guard. Do the 5xx re-measure *after* both, since they
   share a counter.
3. **F1 third.** Highest value but the largest blast radius: it changes caching behaviour
   on the floor's hot path, so it wants its own deploy and a day of watching. Confirm
   afterwards that the null-response error rate collapses and that `Remote fetching ship
   info` no longer tracks it 1:1.
4. **F5**, once F1 has landed and the log's real growth rate is known.
5. **F4 last.** It costs no correctness today; it costs a future operator a wrong
   conclusion. Take it when the observation instrument is next touched.

**Version discipline**: F1, F3 and F4 are code, so each deploy needs a `VERSION` bump per
`./scripts/release.sh`, and — mandatory, even though these are backend-only —
`./client/deploy/deploy_to_droplet.sh battlestats.online` afterwards, because
`NEXT_PUBLIC_APP_VERSION` is captured at frontend build time. F2 and F5 are not code and
need neither.

## Validation

To be filled in as each finding closes. Each entry should carry the date, the lever, and
the measured before/after.

| # | Code | Deployed | Lever applied | Evidence |
|---|---|---|---|---|
| F1 | ✅ | ☐ | negative cache on a separate key + logs demoted to debug + catalog-sync invalidation | `test_f1_*` (5 tests) |
| F2 | ✅ | ☐ | per-bucket commit + dry-run rework + wall-clock budget + order rotation + `partial` status | `test_f2_*` (16 tests) |
| F3 | ✅ | ☐ | `(data.get(...) or {})` at `clans.py:81` | `test_f3_*` (6 cases) |
| F4 | ✅ | ☐ | classifier reads `Player.activity_updated_at` | `test_f4_*` |
| F5 | ☐ | ☐ | **operator lever, untouched** | — |
| F6 | ✅ | ☐ | `PlayerIdConverter` on 16 route entries | `test_f6_*` (24 cases) |

**Deployment is a separate, gated step.** `VERSION` is unbumped and nothing is on the
droplet. Per the standing rule these ship one lever at a time with an acknowledgement
between each; and per the versioning rule every bump — even backend-only — must be
followed by `./client/deploy/deploy_to_droplet.sh battlestats.online`, because
`NEXT_PUBLIC_APP_VERSION` is captured at frontend build time.

**Re-measure recipes.**

```bash
# F1 — measure the FETCH line, not the error line.
# The fix demotes "Null or invalid response data" to debug, and the workers run at
# INFO (`logging.basicConfig(level=logging.INFO)`, ships.py), so that string
# disappears entirely: a post-deploy zero would prove nothing. " ---> Remote
# fetching ship info" stays at INFO and is the number that must actually fall
# (floor: 343,404/day pre-fix -> near-zero, since only a cache miss reaches WG).
ssh root@battlestats.online 'journalctl -u battlestats-celery-floor --since "1 day ago" \
  -o cat --no-pager -g "Remote fetching ship info" | wc -l'
# Corroborate that the sentinel is what is suppressing them:
ssh root@battlestats.online 'redis-cli --scan --pattern "*ship:unresolvable:*" | wc -l'   # expect ~42

# F2 — should show completion under the cap for eu and asia on consecutive days
ssh root@battlestats.online 'journalctl -u battlestats-celery-background --since "3 days ago" \
  -o short-iso --no-pager -g "enrichment_reclassify_drift_task"'

# F3 + F6 — 5xx share one counter, so always split them by exception type
ssh root@battlestats.online 'L=/opt/battlestats-server/shared/logs/django.log
  awk "/^2026-08/,0" $L | grep -aE "^[A-Za-z_][A-Za-z_.]*(Error|Exception): " \
    | sed -E "s/[0-9]{4,}/<N>/g" | sort | uniq -c | sort -rn | head'
#   AttributeError: 'NoneType' object has no attribute 'get'   -> F3
#   ValueError: Field 'player_id' expected a number but got ... -> F6

# F4 — the two buckets should stop being degenerate
ssh root@battlestats.online 'ls -1t /opt/battlestats-server/shared/benchmarks/observation-floor/*.json \
  | head -1 | xargs cat' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print({r: v['gap_1d'] for r,v in d['realms'].items()})"

# journald retention — expect this to lengthen materially after F1
ssh root@battlestats.online 'journalctl --disk-usage; journalctl --no-pager -o short-iso | head -1'
```

## Follow-ups

- **Audit `warships/api/` for the `{"<id>": null}` idiom.** F1 and F3 are two independent
  mishandlings of one upstream behaviour, found by accident in the same sweep. A deliberate
  grep for `.get(str(` and `.get(…, {})` across the API layer is cheap and likely to find
  more.
- **A task that returns `{'status': 'error'}` while Celery records success is a systemic
  observability hole**, not an F2-specific one. Worth a pass over the other periodic tasks
  for the same shape.
- **A 5xx count is not a finding until it is split by exception type.** Attributing all 38
  to F3 was the original draft's largest error, and it took one `grep` of the exception
  lines to disprove. Do that split first, next time, before writing any attribution.
- **Consider whether the `/observation` and `/crawl-yield` skills should surface an error
  budget.** Both engines were healthy and both hid a broken daily task behind them; neither
  skill reads worker error rates by design, and this sweep only found F2 because the error
  logs were reviewed separately.

## Related

- `agents/runbooks/runbook-db-disk-remediation-2026-08-05.md` — the disk work whose
  remediation held (39% at sweep time); F5 is the same accumulation class.
- `agents/runbooks/runbook-enrichment-pool-maintenance-2026-06-09.md` — the design F2 is
  currently failing to deliver for eu and asia.
- `agents/runbooks/runbook-bulk-battle-observation-capture-2026-06-06.md` — the floor
  benchmark whose `gap_1d` instrument F4 degrades.
- `agents/work-items/snapshot-delta-gated-writes-spec.md` — the change that caused F4.
- `.claude/skills/observation/SKILL.md` — needs the F4 reconciliation.

## QA log (2026-08-06, second pass)

The first draft of this runbook was written from a live sweep and reviewed by inspection.
This pass re-checked every file:line against the tree and converted every behavioural
claim into an executable test. Recorded here so the corrections are auditable and so the
same mistakes are not repeated on the next sweep.

**Harness**: `server/warships/tests/test_runbook_qa_2026_08_06.py`, 8 tests, all passing.
Full backend suite after adding it: **924 passed, 2 skipped** (~8 s).

```bash
cd server && DJANGO_SECRET_KEY=k DB_ENGINE=sqlite3 \
  python -m pytest warships/tests/test_runbook_qa_2026_08_06.py --nomigrations -q
```

**Historical note — the harness was designed so it could not go red during remediation.**
While the findings were open, the two behaviour tests asserted the *post-fix* behaviour
under `@pytest.mark.xfail(strict=False)`, so they xfailed before the fix and xpassed after
it; `xfail_strict` is unset in this repo, so both outcomes passed. That was verified by
simulation rather than argument: applying the real F3 one-liner and re-running the suite
gave **925 passed, 1 xfailed, 1 xpassed**, green, with the xpass as the signal.

**That scaffolding is gone.** F1/F3/F4/F6 are implemented, so those tests are ordinary
regression tests now and the `xfail` markers have been removed. The transcription guard
(`test_f2_transcription_still_matches_the_production_plan`) is also gone, and for a better
reason than the fix: F2's implementation extracted `Command.build_plan()`, so the harness
calls the production plan directly instead of re-declaring it, and the entire class of
transcription drift no longer exists. Its job is now split between
`test_f2_documented_bucket_order_is_unchanged` (pins the seven buckets and their order) and
`test_f2_no_shared_transaction_survives_in_handle` (fails if a future refactor hoists the
shared `transaction.atomic()` back out of the loop, reintroducing F2).

### Corrected

| # | Claim as first written | Corrected to | How found |
|---|---|---|---|
| F2 | atomic block at `reclassify_enrichment_status.py:134` | **:135** | line read |
| F2 | "six-bucket plan" (twice) | **seven** buckets | counted in a test |
| F3 | 38 window 5xx are F3 | **25** are F3; 13 are F6 | grouped 5xx by exception type |
| F2 | dry-run caveat absent | `set_rollback` at **:144** must be reworked | reading the atomic block |

### Confirmed (was asserted, now proven)

- **`.get(key, {})` returns `None` for a present-but-null key.** Tested directly, plus the
  proposed fix `(data.get(k) or {})` against all four payload shapes, plus the live
  `_fetch_clan_membership_for_player` returning `None` today.
- **F3's causal chain**, end to end. The 07-24 traceback's `data.py:5415` resolves at
  commit `0b54f55` to exactly the `clan_membership.get("clan_id")` line; the 08-02
  traceback names `data.py:5177`, the current main line. Counts agree at 25/25.
- **F1's loop is real network traffic.** `_request_api_payload` contains no `cache.get` /
  `cache.set` (asserted by source inspection in the harness), and three successive
  `_fetch_ship_info` calls produce three upstream calls with no cache entry written.
- **The 42-ship roster is stable**, not growing: identical count on the floor worker over
  1 day and across all three workers over 3 days.
- **Per-bucket commit is safe.** The seven bucket querysets are pairwise disjoint, tested
  against the real ORM rather than argued from the filter text — and guarded against
  transcription drift by the source-inspection test described above.
- **The `--recent-hours 25` scoping is live**, which is what makes F2 "marginal" rather
  than "a lost filter". Asserted in the same drift guard, so a future removal breaks a
  test instead of silently invalidating the diagnosis.

### Disproved

- **Half of the hypothesised NULL gap does not exist.** The draft reasoning assumed both
  `days_since_last_battle` and `pvp_ratio` could be NULL and strand a row. The model says
  otherwise: `days_since_last_battle` is `IntegerField(default=0)`, so it cannot be NULL
  and cannot strand anything. Only `pvp_ratio` (`FloatField(null=True)`) can. The gap is
  real but half the size, and the test was narrowed to match.

### Found

- **F6** — 16 `/api/fetch/*` routes 500 on a non-numeric player id. It existed in the logs
  the whole time and was invisible because it was pooled into F3's 5xx count.

## Implementation log (2026-08-06)

TDD throughout: every change began with a test that was watched to fail for the right
reason. Full backend suite **969 passed, 2 skipped**. Branch
`docs/health-sweep-remediation-2026-08-06`. **Nothing deployed.**

### What the code changed

| Finding | Files |
|---|---|
| F1 | `warships/api/ships.py` — `SHIP_UNRESOLVABLE_CACHE_SECONDS`, `_unresolvable_cache_key()`, negative-cache check + write, `logging.error` → `logging.debug`, `sync_ship_catalog` invalidation |
| F2 | `warships/management/commands/reclassify_enrichment_status.py` — `_plan_in_documented_order()`, `build_plan(rotation=)`, per-bucket `transaction.atomic()`, `--rotation`, `--budget-seconds`; `warships/tasks.py` — `_reclassify_budget_seconds()`, named Celery limits, `partial` status |
| F3 | `warships/api/clans.py` — one line |
| F4 | `warships/management/commands/benchmark_observation_floor.py` — `_was_checked_on_latest_date()` + classifier branch; `.claude/skills/observation/SKILL.md` reconciled |
| F6 | `battlestats/urls.py` — `PlayerIdConverter` + 16 route entries |

### Decisions the runbook did not anticipate

**F6 — a custom converter, not `<int:>`.** `<int:player_id>` was the runbook's
recommendation and it worked, but it broke **8 existing tests**: the views are typed
`player_id: str` and the whole downstream chain (cache keys, `fetch_*` helpers) receives
that string, so `<int:>` silently widened a contract far beyond what F6 needed. Replaced
with `PlayerIdConverter` (`regex = r'[0-9]+'`, `to_python` returns the **string**). Same
routing-level 404 for a bad id, zero contract change, full suite green.

**F6 — no client guard was needed.** The runbook proposed one for the `"None"` case. The
client types `playerId: number` and every call site interpolates it; a JS null would
render `"null"`, not `"None"`. The capital-N spelling is Python's, and no server-side code
builds these URLs, so the traffic is external (bot or hand-edited). The converter rejects
it regardless. **No client change was made.**

**F6 — an eighth endpoint.** `player_correlation` carries the same `<player_id>` segment
and was never observed 500ing, purely because nothing hit it with a bad id. Fixed and
covered with the other seven.

**F2 — bucket-order rotation, which the runbook did not foresee.** Per-bucket commit
removes the accidental fail-fast bound (the first timeout used to abort the pass), so the
pass needs its own. But the budget can only be `soft_limit - statement_timeout - slack` =
**600 s**, which is *below* the slowest observed pass (~660 s), so truncation is expected
rather than hypothetical — and with a fixed order the same tail buckets would be dropped
every single day, forever. That is the same silent-indefinite-loss shape F2 exists to fix.
`build_plan(rotation=)` rotates the start point by day of year so every bucket leads once
per cycle. This is only sound because the buckets are pairwise disjoint, which the QA pass
had already proved; `test_f2_rotation_does_not_change_the_final_classification` pins it.

**F2 — `raise` was considered and not taken.** The task has no `autoretry_for`, so
re-raising would not have caused a retry storm. It would, however, change Celery's
accounting for a *partially successful* pass, which per-bucket commit now makes the normal
degraded mode. Returning `{'status': 'partial', 'failed_buckets': [...],
'skipped_buckets': [...]}` plus an ERROR-level `INCOMPLETE` log carries strictly more
information than a boolean failure. Revisit if a monitor ever needs task-state rather than
log-grep.

**F4 — the disambiguator is durable, not a cache.** The concern going in was that the
delta gate's per-day checked-set might not be readable for the day the 04:30Z benchmark
measures. It turned out not to be needed: `update_snapshot_data` refreshes
`Player.activity_updated_at` on **both** its branches, written and `skipped-unchanged`, so
a same-day value already proves the player was checked. That is a Postgres column with no
TTL, so the documented fallback (re-base the instrument) was not required.

### The QA harness is now a real regression suite

Both `xfail` tripwires are gone — their findings are fixed, so they are ordinary tests
again. `_build_plan()` no longer transcribes the production plan: F2's fix extracted
`Command.build_plan()`, so the disjointness proof now exercises the real thing and the
transcription-drift guard was replaced by `test_f2_documented_bucket_order_is_unchanged`
plus `test_f2_no_shared_transaction_survives_in_handle`, which fails if a future refactor
hoists the shared `transaction.atomic()` back out of the loop.

### Still open

- **F5** — operator lever (logrotate for `django.log`, delete the stale `drain_p*.log`).
  Untouched; needs an acknowledgement.
- **Deployment of F1–F4, F6** — needs a `VERSION` bump, a backend deploy, and the
  mandatory client rebuild. One lever at a time.
- **The F2 `pvp_ratio IS NULL` exhaustiveness gap** — still open; size it with the query in
  F2 before deciding whether it warrants a terminal bucket.
