# Doc-estate audit — findings for triage (2026-08-15)

_Created: 2026-08-15_
_Method: four parallel read-only audit agents (CLAUDE.md rules, runbook supersession, memory store, doc-vs-code fact check) plus two scripted gates (registry cross-ref, reference resolver). Branch `docs/doc-estate-pass-2026-08-15`._
_Status: **findings only.** Everything below is UNAPPLIED. What was applied in this pass is listed in §0 so the two are never confused._

## Reading this document

Findings are grouped by what acting on them costs, not by which agent found them.
**Confidence is stated per item.** Two agents returned partial reports with
explicit "not reached" sections (§7), so absence of a finding here is not
evidence of health.

---

## 0. Already applied on this branch — do not re-do

| Commit | What |
|---|---|
| `08a6534` | Registry: 3 unregistered docs added (incl. the authoritative doctrine JSON), owner/section taxonomy drift normalized, 3 colliding aliases disambiguated, 1 stale absolute link |
| `02fe524` | `scripts/check_claude_md.sh` word gate (`CLAUDE_MD_WORD_MAX`, default 1500); CLAUDE.md Django 5→6, stale archived-runbook path, skills list 10→13; 3 pre-archive path references |
| `b6b03da` | CLAUDE.md 6,484 → 1,346 words; two new runbooks written to receive it; `SHIP_BADGE_RETENTION_DAYS`, reclassify budget arithmetic, README `battles_json` state |

---

## 1. NOT a documentation problem — a live defect

### 1.1 Every clan-member cache invalidation in the codebase is a no-op

**Confidence: high. Verified directly, not inherited from an agent.**

```
$ grep -rn "clan:members" server/warships/*.py | grep -v tests
views.py:1523:  cache_key = realm_cache_key(realm, f'clan:members:v4:{clan_id}')   <- the READ
tasks.py:1322:  cache.delete(realm_cache_key(realm, f'clan:members:v3:{clan_id}'))
data.py:5049:   cache.delete(realm_cache_key(realm, f'clan:members:{clan_id}'))
data.py:5102:   cache.delete(realm_cache_key(realm, f'clan:members:{clan_id}'))
data.py:5127:   cache.delete(realm_cache_key(realm, f'clan:members:v3:{clan.clan_id}'))

$ grep -rn "clan:members:v4" server/          # one hit: the read itself
```

The read key was bumped to **v4**; no write site follows. Two sites delete the
bare key, two delete `v3`, **zero delete `v4`**. Effect: clan rosters do not
invalidate on departure reconciliation or refresh — they self-heal only when the
TTL expires.

Aggravating detail: `data.py:5126` carries a comment asserting that the bare key
is "a stale no-op" and `v3` is correct. That comment was true before the v4 bump
and now actively misleads the next reader.

**Fix is small but it is a production behavior change, so it is not in this
pass's scope.** Minimum: `v3` → `v4` at `data.py:5127` and `tasks.py:1322`, plus a
decision on what `data.py:5049`/`:5102` should target, plus the comment. A
regression test should assert the read key and every delete key come from **one
shared builder** — this class of bug recurs precisely because the key is
constructed in five places.

---

## 2. Actively misleading docs — an agent reading these acts on false information

Ordered by blast radius. All confidence high unless noted.

| # | Doc | Claim | Reality |
|---|---|---|---|
| 2.1 | `runbook-audience-device-optimization-2026-06-06.md` | Reasons throughout against "the current `max-w-6xl` (1152px) page cap" and recommends widening dense viz | `max-w-6xl` has **zero** hits in `client/app`; live doctrine is `mx-auto max-w-[850px]` (`layout.tsx:78`) and `runbook-frontend-final-shape-cleanup-2026-07-15.md` says do not add `lg:`/`xl:` breakpoints. Two of its three P1 targets (`TierTypeHeatmapSVG`, `ClanMembers.tsx`) are deleted files. **An agent routed here fights the live layout doctrine.** |
| 2.2 | `ops-env-reference.md:161` | Documents `SHIP_SEASON_EPOCH`, `is_season_boundary()`, `SHIP_BADGE_SNAPSHOT_DAY_OF_WEEK`, and `manage.py backfill_ship_seasons --wipe` as live | All four have **zero** hits in `server/`+`client/`; the management command does not exist. The fixed-fortnight season model was retired 2026-06-15. This is the file CLAUDE.md names as the env authority, telling an agent to run a command that is gone. |
| 2.3 | `runbook-celery-queue-strategy.md` | "four dedicated workers … `background` **2**"; elsewhere "the current **three**-queue model" | Five queues live (`default`/`hydration`/`background`/`floor`/`crawls`), `background` is `-c 3`. The `floor` queue is absent from the doc entirely. Internally inconsistent as well as wrong. **This is the denominator the recapture contention arithmetic depends on.** |
| 2.4 | `runbook-enrichment-pool-maintenance-2026-06-09.md` | One daily reclassify over all seven buckets at a 420s timeout | Two families since 2026-08-07: daily `drift` (five buckets) and **weekly** `json`, per-realm, at 900s. `--buckets`, `weekly`, `detoast` have zero hits in the runbook. CLAUDE.md is correct; this runbook is not. |
| 2.5 | `runbook-daily-data-refresh-schedule-2026-04-05.md` | Clan crawl "Retired … marked for DO Functions migration"; landing-page warmers enabled every 120 min | `daily-clan-crawl-{realm}` is registered and has its own queue+worker; the landing warmers are in `_RETIRED_SCHEDULE_NAMES` and deleted at post-migrate. Classified `evergreen`. |
| 2.6 | `runbook-umami-event-reference-2026-06-18.md` | Catalogs `landing-player-click`, `landing-clan-click`, `landing-best-sort` as live | All three are on the removed Best boards; zero hits in `client/app`. Also **omits `locale-active`** entirely — the event CLAUDE.md calls the sole measure of sustained non-English usage. |
| 2.7 | `ops-env-reference.md:69` | `BULK_CACHE_BEST_PREWARM_ENABLED` "reversible via `=1`" | Unread by any code; the cohort it would restore (`score_best_clans`) was deleted in 3.0. Setting it to 1 does nothing. |
| 2.8 | `ops-env-reference.md:118` | `WG_REQUEST_THREAD_TIMEOUT_SECONDS` (4) as a live knob | Zero occurrences outside `agents/`. |
| 2.9 | `runbook-ship-list-wr-percentile-2026-06-23.md:48` | all-view is "one `BattleEvent` GROUP BY ship" | Since 2026-08-14 it sums `ShipPopDailyAgg` and falls back to the raw scan only on a gap. One-line reconcile; the rest of the runbook is still authoritative and the pct view genuinely still scans `BattleEvent`. |
| 2.10 | `runbook-landing-featured-boards-decommission-2026-06-22.md` | Task functions/endpoints "kept idle" so the boards can be revived | v3.0 removed them. Needs a reconcile note; **do not archive** — it is the doc that explains the removal. |
| 2.11 | `spec-cache-first-lazy-refresh-policy-2026-03-19.md` | Policy covers the WG API | Does not carry the 2026-08-12 extension to heavy DB aggregations (zero hits for `combat`/`aggregation`). Gap, not falsehood. |

---

## 3. Stale `_Status:_` lines — work is live, the doc says it is not

An agent reading these concludes there is work to do that is already done.

| Doc | Says | Reality |
|---|---|---|
| `runbook-ranked-battle-history-rollout-2026-05-02.md` | EU+ASIA capture gated to `na`; "Phase 6 is the next step" | `deploy_to_droplet.sh:215` pins `na,eu,asia` |
| `runbook-battle-history-rollout-2026-04-28.md` | "ready to push, open PRs … the first task is pushing those eight branches" | Pipeline is production |
| `runbook-ship-badges-rolling-2026-06-14.md` | "Code landed; pending deploy" | Live since June |
| `runbook-streamer-submission-feature-2026-04-07.md` | `is_streamer` promotion "intentionally deferred" | Implemented at `admin.py:54` |
| `runbook-umami-analytics-coverage-2026-06-17.md` | "pending version bump + frontend deploy" | Shipped v2.1.0 and verified next-day (medium-high) |
| `runbook-db-cpu-saturation-2026-05-24.md` | "IN PROGRESS"; root cause `score_best_clans()` | That function is gone; DB resized; disk axis moved on |
| `runbook-multi-realm-hardening.md` | "Phase 8 (i18n) deferred" | Locale system live since v5.0.0 |
| `runbook-enriched-data-features-2026-04-12.md` | "In progress", queued items | Unverified — flagged, not confirmed |

---

## 4. Archive candidates — **DONE 2026-08-15, all 12 archived**

> **Executed.** The operator approved the full 12 (4a + 4b) on 2026-08-15. All are
> now under `agents/runbooks/archive/`, registry entries rekeyed to the archive
> path with `status`/`lifecycle` = `archived`, removed from the active README
> index, and 35 in-body references across 17 active files rewritten to the archive
> path. Active runbooks: 113 → 104 (plus 2 written this pass). **§4c was NOT
> archived and remains active, by recommendation.**
>
> Successor banners (`> Superseded by …`) were **not** added — the `runbook-archive`
> skill requires explicit confirmation for those, which was not given. Candidates
> if wanted: the six 4a docs → `runbook-landing-featured-boards-decommission-2026-06-22.md`;
> `runbook-landing-shipleaderboard-refresh-blank-2026-06-18.md` →
> `runbook-shipleaderboard-warm-before-evict-2026-06-18.md`;
> `spec-multi-realm-eu-support.md` → `runbook-multi-realm-hardening.md`.

Archiving is `git mv` + registry rekey + README update (skill: `runbook-archive`).
Twelve of 113. Grouped by confidence.

**4a. The landing "Best boards" cluster — six docs, subject fully removed (high).**
The boards were decommissioned 2026-06-22 and the backend removed in v3.0;
`server/warships/landing.py` no longer exists and `score_best_clans`,
`landing_players`, `landing_clans`, `analytics_top_entities` survive only in two
migrations and one comment.

- `spec-landing-best-by-class.md` (still reads "Approved / Ready for Implementation")
- `spec-best-player-subfilters.md`
- `spec-best-clan-subfilters.md`
- `runbook-landing-best-player-subsort-materialization-2026-04-05.md`
- `runbook-best-clan-eligibility.md` (its "Current State" names a deleted function as source of truth)
- `runbook-landing-medals-filter-2026-06-17.md` (a full implementation plan for a filter bar removed five days later — dead on arrival)

**4b. Superseded in fact (medium to medium-high).**

- `runbook-db-cpu-saturation-2026-05-24.md` — trigger fired, root cause deleted
- `runbook-daily-data-refresh-schedule-2026-04-05.md` — describes an April world, classified evergreen (see 2.5)
- `runbook-ship-banner-ux-pass-2026-06-05.md` — half its subject (`ShipHonors.tsx`) is deleted
- `runbook-audience-device-optimization-2026-06-06.md` — see 2.1; its measured device-mix data is the only salvage
- `runbook-landing-shipleaderboard-refresh-blank-2026-06-18.md` — `_Status: DIAGNOSIS (no code change yet)_`; the fix landed the same day and its runbook names this as the symptom
- `spec-multi-realm-eu-support.md` — near-duplicate of `runbook-multi-realm-hardening.md`, which declares it a dependency and covers phases 1-7

**4c. Trigger fired but DO NOT archive — the doc is still the only reference.**
The registry would say archive; the retrieval path says otherwise.
`runbook-hot-players-engagement-queue-2026-06-10.md` (disabled but revivable, CLAUDE.md links it) ·
`runbook-cb-icon-current-season-2026-07-15.md` (the CB shield semantics authority) ·
`runbook-battle-history-archive-prune-2026-06-17.md` (operational prune reference) ·
`runbook-bulk-battle-observation-capture-2026-06-06.md` (part of the floor family) ·
`runbook-wg-rate-limiter-token-bucket-2026-06-05.md`, `runbook-live-update-cooldown-2026-05-27.md`, `runbook-django-6-upgrade-2026-07-30.md` (cleanly fired, but each is the only account of how that thing works).

**Unsure — do not act without a check:** `runbook-data-lifecycle-architecture-2026-06-21.md` carries `archive_on: all-tables-have-retention-policy` and never mentions `ShipPopDailyAgg` or `Feedback`. The former has a derived retention; `Feedback` was not verified.

---

## 5. Retrieval-path gaps

### 5.1 `agents/runbooks/README.md` indexes 39 of 104 runbooks

> **Updated 2026-08-15 after the §4 archival.** Nine now-archived entries were
> removed from the index, so the count moved from 48/113 to **39/104**. The gap is
> unchanged in substance: 65 active runbooks are still absent, still concentrated
> in 2026-07/08 work. The blocker named below is now cleared — the archive set is
> settled, so the index can be rebuilt against a stable list.


`agents/README.md` tells agents to use it "to select the few runbooks relevant to
the task instead of scanning the whole directory". 65 are unreachable that way,
and the gap is not random — it is nearly all 2026-07/08 work: recapture (all
three), ship-list rollup, locale adoption, ops email, traffic email, top-ships
warm, worktree prereqs, Django 6, health sweep, post-deploy verification.

**The newest operational knowledge is exactly what the documented retrieval path
cannot see.** Not rebuilt in this pass because §4 would change its contents;
rebuild after the archive decision. Twelve of the 113 should not appear (§4a/4b).

### 5.2 Eight runbooks reachable only through the registry

Not via README, CLAUDE.md, or any other doc:
`runbook-clan-chart-activity-filter-2026-06-18.md`, `runbook-clan-departure-reconciliation-2026-06-15.md`,
`runbook-django-6-upgrade-2026-07-30.md`, `runbook-frontend-final-shape-cleanup-2026-07-15.md`,
`runbook-hidden-profile-chart-warming-2026-07-11.md`, `runbook-landing-medals-filter-2026-06-17.md`,
`runbook-ship-badge-current-generation-2026-07-08.md`, `runbook-top-random-battle-players-2026-06-16.md`.

### 5.3 `agents/work-items/` is entirely unregistered (25 live files)

Consistent with convention — but five are specs CLAUDE.md routes to **by name**:
`feedback-submission-spec.md`, `ranked-enjoyer-current-season-spec.md`,
`snapshot-delta-gated-writes-spec.md`, `client-locale-toggle-spec.md`,
`ship-leaderboard-ux-refresh-spec.md`. Either register those five, or accept that
a doc CLAUDE.md depends on has no tags, aliases, or `archive_on`.

### 5.4 No runbook exists for the ship-combat request-thread fix

The 2026-08-12 move of the 36s ShipStats population aggregation off the request
thread (`warm_ship_combat_pop_task`, `X-Ship-Combat-Pending`, the durable
`:published` copy) is recorded only in CLAUDE.md and `ops-env-reference.md`. It is
a live client contract — clients must branch on `pending` before `clusters.length`
— with no owning document. Both audit agents flagged it independently.

---

## 6. Line-number citations rot faster than they can be maintained

Sampled 18 citations in the three most recently written, most operationally loaded
runbooks. **10 of 18 wrong — a 56% miss rate in docs 2 to 10 days old.** Drift is
20 to 320 lines and clusters in `tasks.py`, `incremental_battles.py` and `data.py`,
the three fastest-growing files. Examples: `_compact_candidate_sql` cited at
`incremental_battles.py:1517`, actually 1547; `roll_up_player_daily_ship_stats_task`
cited at `tasks.py:2563`, actually 2885; `RECAPTURE_LAPSED_LIMIT` cited at
`tasks.py:2322`, actually 223.

Note that `runbook-db-disk-remediation-2026-08-05.md:340-348` is itself a
QA-verification section asserting "✓" against citations that have since rotted.
The verification was true when written.

**Proposal, not a fix: cite `file.py::symbol_name` instead of `file.py:NNNN`.**
Grep-resolvable, survives insertion, and reviewable. Retrofitting all ~500
citations is not worth it; changing the convention going forward is.

Counterpoint worth keeping: numeric env defaults in `ops-env-reference.md` were
checked mechanically — **1 mismatch in 82** (§0, fixed). The rot there is in
*existence* (§2.2, 2.7, 2.8), not in values. A dead-variable sweep is warranted;
a numeric sweep is not.

---

## 7. Coverage — what this audit did NOT reach

State this before trusting any absence above.

- **`agents/contracts/**` was not audited at all** (delegated, no result).
- **The 132 archived runbooks** and 29 work-items were not audited.
- Older runbooks (2026-04 → 06) got mechanical symbol extraction only, no
  adjudication separating "documents a removal" from "presents as live".
- **Memory store: roughly half.** ~72 candidate files were still being verified
  when the session ended. `project_fe_shipped_history_consolidated.md` (60K) was
  not read in full and contains at least four "NOT deployed"/"unmerged" strings
  of unresolved status.
- A systematic dead-symbol sweep of the 2026-07/08 runbooks was delegated and did
  not return; §2 findings there are incidental, not exhaustive.

---

## 8. Memory store (outside the repo — `~/.claude/projects/.../memory/`)

Recorded here for completeness; not repo state, and not versioned with it.

**Clean:** 319 `[[links]]` across 129 files resolve, **0 dangling**. Index has no
duplicates and no line pointing at a missing file. All 16 `feedback_*` files carry
the required **Why:**/**How to apply:** structure.

**Rotted — the env-authority cluster (high).** Four memories assert prod values the
deploy script contradicts, which is the exact error class one of them exists to
prevent: `project_ship_leaderboard_window_30d_shipped` (claims
`SHIP_LEADERBOARD_WINDOW_DAYS` is not set in prod — it is pinned (45 when this
was written; 60 since 2026-08-18); and cites
retention 32 where it is 105), `project_battle_history_archive_prune_live` (92d),
`reference_infra_resources` (92d projection), `project_30d_window_worldview` (32d).

**Other verified rot:** `project_about_saga_parked` points at a branch, worktree
and commit object that **no longer exist** — lost work, not parked;
`project_ship_leaderboard_wr_weight_levers` still reads as an open recommendation
for weights that were adopted and are now the code default;
`project_correlation_published_freeze` and `project_pve_icon_hidden_kill_switch`
cite deleted components; `project_clan_members_cache_key_v3` describes §1.1 as a
v3 problem when the read has moved to v4.

**Two unindexed files — recommend delete, not index.**
`project_ship_winners_held_purged_2026-06-08.md` opens "**SUPERSEDED 2026-06-14**"
and defers to an indexed memory. `project_umami_events_check_2026-06-12.md` is a
dated reminder 64 days past its trigger whose durable half already exists as
`reference_umami_event_query_recipe.md`.

**Consolidation:** 47 of 145 memories are release notes; ~45 duplicate a named
runbook. Proposed clusters (survivor named, not a delete list) — FE release notes
9→1, ship leaderboard 8→2, recapture 4→1, disk/DB 6→2, observation floor 6→2. Each
cluster has a non-repo half that must be carried forward: the YIQ-vs-`d3.hsl().l`
luminance rule, "`compareRows` has a `default:` branch so a missing `case` is a
*silent* wrong sort", "Playwright e2e is maintained but wired to NO CI job", and
"raising the ship floor BACKFIRES (delists whole ships via the population guard)".

---

## 9. Suggested order

1. **§1.1** — the only live defect here.
2. **§4** — decide archives; §5.1 is blocked on it.
3. **§5.1** — rebuild the README index once, against the post-archive set.
4. **§2.1–2.6** — the misleading six, in that order.
5. **§3** — status-line sweep; mechanical once someone confirms each.
6. **§6, §5.3, §5.4** — convention and coverage changes.
7. **§7** — re-run the unreached scopes before trusting silence.
