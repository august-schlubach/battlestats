# Runbook: Player Detail And Ranked Hardening

_Last updated: 2026-03-14_

## Purpose

Stabilize the player-detail and ranked-data surfaces that recently regressed, and give QA a concrete, testable checklist for verification.

This runbook covers four work items:

- player-detail API reads must not fail when the async broker is unavailable,
- ranked league semantics must stay consistent across player detail and clan roster payloads,
- ranked correlation payloads must be served from stable local ranked history without accidental remote refreshes,
- ranked maintenance commands must have clear ownership boundaries between full backfill and ongoing incremental refresh.

## Execution Evidence

- `python manage.py test warships.tests.test_views warships.tests.test_data warships.tests.test_backfill_ranked_command warships.tests.test_incremental_ranked_command warships.tests.test_crawl_scheduler warships.tests.test_ranked_top_ship warships.tests.test_upstream_contracts warships.tests.test_data_product_contracts --keepdb` passed on 2026-03-14.
- `python manage.py test warships.tests.test_views.PlayerViewSetTests warships.tests.test_views.ApiContractTests warships.tests.test_data.RankedDataRefreshTests warships.tests.test_backfill_ranked_command warships.tests.test_incremental_ranked_command warships.tests.test_crawl_scheduler warships.tests.test_ranked_top_ship warships.tests.test_upstream_contracts warships.tests.test_data_product_contracts --keepdb` passed on 2026-03-14.

## Agent Routing

- Engineer-Web-Dev owns implementation and test updates.
- Architect reviews behavior boundaries and maintenance-command split.
- Project Coordinator updates knowledge notes and runbook guidance.
- QA is the final reviewer for each item and must sign off against the success criteria below.

## Task 1: Safe Player-Detail Task Dispatch

### Analysis

Player-detail reads enqueue background refresh tasks for missing clan data or stale player state. When the broker is unavailable, those async `.delay()` calls must not turn a successful read into a 500 response.

The request path should return the player payload using the best local data available and degrade only in the background-refresh behavior.

### Success Criteria

- `GET /api/player/<name>/` returns `200` when the player exists even if Celery broker resolution fails.
- The response still includes the expected player fields such as `kill_ratio`, `player_score`, and `highest_ranked_league` when local data supports them.
- Broker failures are logged as warnings rather than surfacing as HTTP 500 errors.
- Background refresh remains attempted when broker access is healthy.

### QA Verification

1. Run: `python manage.py test warships.tests.test_views.PlayerViewSetTests warships.tests.test_views.ApiContractTests --keepdb`
2. Confirm the tests for broker-failure fallback, player detail kill ratio backfill, and highest ranked league pass.
3. If testing manually with broker disabled, open a known player detail page and confirm the page renders instead of failing.

## Task 2: Ranked League Semantics Across Surfaces

### Analysis

Ranked league data is now used in both player detail and clan roster payloads. The app should report the player's best historical league from non-empty ranked seasons, not only the latest season and not only rows with a fully enriched upstream payload.

### Success Criteria

- Clan member payloads expose `highest_ranked_league` using the best historical ranked season with battles.
- Player detail payloads expose `highest_ranked_league` using the same rule.
- A player with exactly `100` ranked battles is not marked as a ranked-player badge case when the threshold is `> 100`.
- Rows with `0` ranked battles do not affect the chosen highest league.

### QA Verification

1. Run: `python manage.py test warships.tests.test_views.ClanMembersEndpointTests warships.tests.test_views.ApiContractTests warships.tests.test_data.PlayerExplorerSummaryTests --keepdb`
2. Confirm the clan roster tests return `Gold`, `Silver`, and `None` for the seeded players.
3. Confirm the player-detail highest-ranked-league test returns `Gold` for a player whose best league is historical rather than latest.

## Task 3: Ranked Correlation Stability

### Analysis

The ranked win-rate vs. battles correlation endpoint should use current local ranked history and should not trigger remote ranked refreshes during read paths just because top-ship enrichment is absent. Correlation tracked population should include only visible players with ranked history at or above the configured minimum-battle threshold.

### Success Criteria

- `GET /api/fetch/player_correlation/ranked_wr_battles/<player_id>/` returns `200` for seeded visible players with ranked history.
- `tracked_population` counts only visible players whose aggregate ranked battles meet the minimum threshold.
- Hidden players are excluded from the population.
- Players below the minimum threshold are excluded from the population.
- Fresh ranked cache rows are reused even if `top_ship_name` is missing from one or more ranked rows.

### QA Verification

1. Run: `python manage.py test warships.tests.test_views.ApiContractTests warships.tests.test_data.RankedDataRefreshTests --keepdb`
2. Confirm the ranked correlation payload test reports `tracked_population == 2` for the seeded scenario.
3. Confirm the fresh-ranked-cache test proves no remote refresh occurs when `top_ship_name` enrichment is absent.

## Task 4: Ranked Backfill And Incremental Reconciliation

### Analysis

The repo now has two ranked maintenance modes:

- `backfill_ranked_data` is the repair and sweep tool for historic ranked coverage,
- `incremental_ranked_data` is the daily queue-based freshness tool for known ranked players plus discovery candidates.

These tools should not compete. The reconciliation rule is:

- request-time reads do not force ranked refresh just to fill `top_ship_name`,
- backfill is allowed to repair rows that are otherwise fresh but still missing top-ship enrichment,
- incremental refresh remains focused on stale known-ranked rows and new likely candidates.

### Success Criteria

- Backfill resumes from checkpoint and retries failed players before continuing.
- Backfill processes rows missing ranked data, rows missing `ranked_updated_at`, stale rows when requested, and rows missing `top_ship_name` enrichment.
- Incremental refresh still interleaves known-ranked and discovery candidates and respects crawl locks.
- Ranked read paths no longer depend on top-ship enrichment to serve fresh cached ranked rows.

### QA Verification

1. Run: `python manage.py test warships.tests.test_backfill_ranked_command warships.tests.test_incremental_ranked_command warships.tests.test_crawl_scheduler warships.tests.test_ranked_top_ship --keepdb`
2. Confirm backfill processes a seeded player whose ranked rows are fresh but missing `top_ship_name`.
3. Confirm incremental refresh still skips when the clan crawl lock exists and still clears its own lock after completion.
4. Confirm ranked endpoint serialization still includes `top_ship_name` when enrichment is present.

## Documentation Deliverables

- Keep [agents/knowledge/wows-api-contract-strategy.md](agents/knowledge/wows-api-contract-strategy.md) aligned with the layered contract decision.
- Keep [agents/knowledge/wows-account-hydration-notes.md](agents/knowledge/wows-account-hydration-notes.md) aligned with current upstream behavior.
- Keep [README.md](README.md) aligned with the operational split between ranked backfill and ranked incremental refresh.

## QA Sign-Off Template

- Scope reviewed:
- Automated tests run:
- Manual checks run:
- Pass/fail result:
- Open risks or waivers:
