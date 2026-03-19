# Spec: Player Route Follow-up Improvements After HAR Recheck

_Captured: 2026-03-19_

_Status: post-fix HAR follow-up and remaining work plan_

## Goal

Capture what the second player-route HAR proved, isolate the remaining bottlenecks, and define the next improvement tranche for `/player/LemmingTheGreat`.

This follow-up is based on the post-change HAR captured for `http://localhost:3001/player/LemmingTheGreat` in `lemming.har`.

## Validation Summary

The first round of fixes worked on the highest-cost regressions:

- The ranked games vs win rate heatmap no longer fails.
  - Baseline: `500` after about `33.3 s`
  - Follow-up: `200` after about `4.8 s`
- The `type_data` redirect waste is gone.
  - Baseline: two slow `301` redirects plus the real fetches
  - Follow-up: one canonical `GET /api/fetch/type_data/<player_id>/`
- Most duplicate heavy panel fetches collapsed.
  - `ranked_data`, `randoms_data`, `player_clan_battle_seasons`, `clan_data`, and `api/player` are no longer duplicated in the HAR

The route is healthier overall, but not done.

## Post-change HAR Findings

### 1. The worst correctness bug is fixed

The prior long-tail blocker:

- `GET /api/fetch/player_correlation/ranked_wr_battles/1018847016/`

now succeeds.

Observed follow-up timing:

- `4823 ms`, `200`

Interpretation:

- The cold-cache fallback and background warm strategy removed the catastrophic failure mode.
- This endpoint is still not cheap, but it is no longer route-breaking.

### 2. The player detail API is now the slowest request on the route

Observed follow-up timing:

- `GET /api/player/LemmingTheGreat/`: `12874 ms`, `200`

Additional live verification after the HAR:

- repeated curl requests returned in roughly `6.5 s`, `8.4 s`, and `8.7 s`
- `time_starttransfer` matched `time_total`, which means the delay is server-side time before the first byte

Interpretation:

- Client-side dedupe removed the duplicate request, but the remaining single request is still too slow.
- This is no longer a duplicate-fetch problem. It is now a backend request-path problem.

### 3. Clan member polling still dominates repeated route work

Observed follow-up duplication:

- `GET /api/fetch/clan_members/1000044008/`: `7` requests, `19859 ms` total

Baseline comparison:

- Previously `8` requests, `22477 ms` total

Interpretation:

- The clan route is improved only marginally.
- The remaining churn comes from the hydration loop rather than duplicate mounts.
- The endpoint still reports many members as hydration-pending, so the client keeps polling.

### 4. A second correlation panel is still duplicated

Observed follow-up duplication:

- `GET /api/fetch/player_correlation/win_rate_survival/`: `2` requests, `3170 ms` total

Interpretation:

- This panel was not migrated onto the shared fetch helper in the first pass.
- It behaves like the earlier duplicated player-route fetches and should be deduped the same way.

### 5. Distribution fetches still show duplicate dev-mode churn

Observed follow-up duplication:

- `GET /api/fetch/player_distribution/battles_played/`: `2` requests, both aborted quickly

Interpretation:

- This is small compared to the player and clan-member bottlenecks, but it is still unnecessary route noise.
- The same shared client-side dedupe layer can absorb it.

## Root Cause Trace

### A. `useClanMembers` still polls aggressively

Client trace:

- `client/app/components/useClanMembers.ts`
- Current behavior before this follow-up pass:
  - fetch immediately when enabled
  - if any member row reports `ranked_hydration_pending` or `efficiency_hydration_pending`, poll again every `2500 ms`
  - continue for up to `6` retries

Server trace:

- `server/warships/views.py` `clan_members(...)`
- `server/warships/data.py` `queue_clan_ranked_hydration(...)`
- `server/warships/data.py` `queue_clan_efficiency_hydration(...)`

Important detail:

- the endpoint exposes both queued and deferred hydration counts in headers
- deferred players are still reported in the pending set, which means the client keeps polling even when the server is mostly waiting for background capacity

Conclusion:

- The client was polling on a single fixed cadence even when the server told it the remaining work was deferred rather than newly queued.
- That is why `clan_members` remained the dominant repeated request after the first optimization pass.

### B. `win_rate_survival` remained outside the shared dedupe path

Trace:

- `client/app/components/WRDistributionDesign2SVG.tsx`

Important detail before this follow-up pass:

- the component still used a direct `fetch(...)`
- no shared in-flight dedupe
- no settled TTL reuse

Conclusion:

- The duplication is consistent with the original player-route duplicate-fetch pattern and should be treated the same way.

### C. The player detail endpoint still performs heavy work on the read path

Trace:

- `server/warships/views.py` `PlayerViewSet.get_object(...)`
- `server/warships/serializers.py` `PlayerSerializer`

Observed read-path work:

- sync player lookup fallback for unknown names
- sync clan metadata refresh when clan identity is incomplete
- sync battle-row hydration when `battles_json` is missing
- sync player refresh when `actual_kdr` is missing
- sync explorer-summary refresh when `_explorer_summary_needs_refresh(obj)` returns true

Conclusion:

- The player detail endpoint still has too much synchronous maintenance work coupled to a read request.
- Some of those branches are needed for correctness, but they explain why the route remains server-bound even after duplicate fetches were reduced.

## Implemented In This Follow-up Pass

### 1. Adaptive clan-member polling

Updated:

- `client/app/components/useClanMembers.ts`

Change:

- keep polling while hydration is still pending
- use hydration metadata headers from the server
- slow the next poll interval when the remaining hydration is deferred rather than actively queued

Expected effect:

- fewer `clan_members` requests during long hydration tails
- less repeated route pressure while the server works through queued clan-member refresh tasks

### 2. Shared dedupe for win-rate-survival correlation

Updated:

- `client/app/components/WRDistributionDesign2SVG.tsx`

Change:

- route the correlation fetch through `fetchSharedJson(...)`

Expected effect:

- duplicate `win_rate_survival` requests collapse on the player route

### 3. Shared dedupe for battles-played distribution

Updated:

- `client/app/components/PopulationDistributionSVG.tsx`

Change:

- route population-distribution fetches through `fetchSharedJson(...)`

Expected effect:

- duplicate `player_distribution/battles_played` requests collapse under dev remount churn

## Remaining Improvement Plan

### Priority 0: reduce player-detail read-path latency

Target:

- `GET /api/player/<name>/`

Actions:

- measure which synchronous branch is firing on hot-path player lookups
- separate correctness-critical sync work from maintenance work
- move explorer-summary refresh and any non-essential maintenance off the read path where possible
- consider a short TTL response cache for already-hydrated player detail payloads if the route still remains server-bound after read-path cleanup

Success criteria:

- player detail request drops below the current `6.5 s` to `12.9 s` range
- route no longer waits primarily on `/api/player/<name>/`

### Priority 1: shrink the clan-members polling tail further

Actions:

- remeasure `clan_members` after adaptive polling
- if the count is still high, consider exposing a more precise “active in flight vs deferred only” contract from the endpoint
- stop marking fully deferred players as generic pending if the client should wait longer before polling again

Success criteria:

- `clan_members` request count falls materially below `7`
- repeated clan hydration no longer dominates route-level duplicate work

### Priority 2: preserve client-side fetch dedupe coverage

Actions:

- audit remaining chart and distribution components for raw `fetch(...)` usage on shared, cacheable GET endpoints
- route them through the shared helper where appropriate

Success criteria:

- no repeated correlation or distribution GETs in the next player-route HAR unless the request is intentionally refreshed

## Expected Next HAR Checks

The next `/player/LemmingTheGreat` HAR should verify:

- `GET /api/fetch/clan_members/1000044008/` occurs fewer times than `7`

## Second update HAR delta

The later mixed HAR in `second-update.har` adds two important facts:

- The player-route clan polling fix held after a bounce.
  - `clan_members` fell from `7` requests in `lemming.har` to `1` request in `second-update.har`.
- Landing and cold-cache correlation paths are now the dominant remaining failures.
  - `GET /api/landing/players/?mode=sigma&limit=40` took about `190.4 s`
  - `GET /api/landing/players/?mode=random&limit=40` took about `19.7 s`
  - `GET /api/fetch/player_correlation/tier_type/<player_id>/` took about `17.3 s`
  - `GET /api/fetch/player_correlation/win_rate_survival/` took about `8.7 s`

## Follow-up implementation after the second update HAR

- Landing-page client fetches now use the shared JSON fetch helper with a short TTL, so duplicate mounts and rapid repeat effects collapse into one request.
- Sigma landing mode now orders and limits in SQL and no longer loads `battles_json` and `ranked_json` across the full eligible population before sorting.
- Sigma mode now returns only the fields the landing UI actually renders, derived from the player row and explorer summary.

## Remaining work after this pass

- `random` landing mode can still be expensive on a cold cache because it scans a large eligible id set.
- `tier_type` and `win_rate_survival` still rebuild full-population correlation payloads synchronously on cache miss.
- `update_player_data()` still invalidates landing-player caches aggressively, which can erase much of the one-hour landing cache TTL under active background refresh.
- `GET /api/fetch/player_correlation/win_rate_survival/` occurs once
- `GET /api/fetch/player_distribution/battles_played/` no longer duplicates
- `GET /api/player/LemmingTheGreat/` is meaningfully faster than the current `12874 ms`

## Exit Criteria

This follow-up pass is complete when the next player-route HAR shows all of the following:

- no duplicate `win_rate_survival` fetches
- no duplicate `battles_played` distribution fetches
- a smaller `clan_members` polling tail
- a materially faster player detail request
