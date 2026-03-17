# Runbook: Landing Active Players Sigma Filter

_Drafted: 2026-03-17_

## Status

Executed on 2026-03-17.

## Purpose

Add a `Sigma` filter button to the landing page `Active Players` section so users can switch the list to the top 40 players by published Battlestats efficiency percentile.

## Source Artifacts

- [agents/work-items/landing-player-sigma-filter-spec.md](agents/work-items/landing-player-sigma-filter-spec.md)
- [agents/reviews/qa-landing-player-sigma-filter-review.md](agents/reviews/qa-landing-player-sigma-filter-review.md)

## Current Behavior Summary

Today the landing page `Active Players` section offers only two list modes:

1. `Random`
2. `Best`

`Best` is currently a win-rate list, not an efficiency list. Landing rows already receive published efficiency fields and can render dense-row sigma icons for `E` players, but users cannot currently switch the list itself to an efficiency-ranked view.

## Intended Change

1. Extend the existing landing players endpoint with `mode=sigma`.
2. Add a `Sigma` button to the `Active Players` control group.
3. Return up to 40 visible, active players with fresh published efficiency percentiles.
4. Order sigma results by percentile descending with deterministic secondary ordering.
5. Reuse the current landing row renderer and landing players fetch path.

## Scope Boundary

In scope:

1. landing-player backend mode support,
2. landing-page `Active Players` mode toggle,
3. focused backend and frontend regression coverage,
4. small durable documentation updates that describe the new landing mode.

Out of scope:

1. changing the efficiency percentile model,
2. changing the dense-row sigma icon visibility rule,
3. player explorer sorting changes,
4. recent-players landing behavior.

## Agent Responsibilities

### Project Manager

1. Keep the tranche limited to the landing-player mode and toggle behavior.
2. Prevent unrelated efficiency-ranking work from expanding the scope.

### Architect

1. Reuse the published efficiency contract instead of creating a second landing-specific score.
2. Keep the new filter on the existing landing endpoint.

### Engineer-Web-Dev

1. Add `sigma` backend mode support.
2. Add the `Sigma` toggle button and fetch wiring.
3. Add focused backend and client tests.
4. Update durable docs if the landing-mode contract changes.

### QA

1. Verify sigma-mode ordering, exclusion, and limit behavior.
2. Verify the landing client switches modes correctly and preserves existing buttons.

## Implementation Sequence

### Phase 1: Backend Mode

1. Extend `LANDING_PLAYER_MODES` with `sigma`.
2. Add a sigma-mode builder using the published efficiency percentile.
3. Preserve the existing landing row payload shape and serialization path.

### Phase 2: Frontend Toggle

1. Extend the landing-player mode union with `sigma`.
2. Add the `Sigma` button next to `Random` and `Best`.
3. Reuse `fetchLandingPlayers(mode)` to request `mode=sigma`.

### Phase 3: Validation

1. Add backend tests for sigma ordering, exclusion, and limit behavior.
2. Add client tests for mode switching and sigma-list display.
3. Perform a focused manual landing-page check if needed.

## Suggested Test Targets

Backend:

1. [server/warships/tests/test_views.py](server/warships/tests/test_views.py)

Client:

1. [client/app/components/__tests__/PlayerSearch.test.tsx](client/app/components/__tests__/PlayerSearch.test.tsx)

## Validation Commands

Focused backend command:

```bash
cd server && /home/august/code/archive/battlestats/.venv/bin/python manage.py test \
  warships.tests.test_views.ApiContractTests.test_landing_players_sigma_mode_orders_by_efficiency_percentile \
  warships.tests.test_views.ApiContractTests.test_landing_players_sigma_mode_excludes_hidden_and_unpublished_players \
  --keepdb
```

Focused client command:

```bash
cd client && npm test -- --runInBand app/components/__tests__/PlayerSearch.test.tsx
```

## Rollback Plan

If sigma mode proves too noisy or incorrect:

1. remove the `Sigma` button from the landing toggle group,
2. stop accepting `mode=sigma` in the landing endpoint,
3. preserve the published efficiency payload fields already used by landing rows.

## Execution Evidence

Implementation landed in:

1. [server/warships/landing.py](server/warships/landing.py)
2. [client/app/components/PlayerSearch.tsx](client/app/components/PlayerSearch.tsx)
3. [server/warships/tests/test_views.py](server/warships/tests/test_views.py)
4. [client/app/components/__tests__/PlayerSearch.test.tsx](client/app/components/__tests__/PlayerSearch.test.tsx)
5. [agents/knowledge/battleships-overview.md](agents/knowledge/battleships-overview.md)

Focused validation passed:

```bash
cd server && /home/august/code/archive/battlestats/.venv/bin/python manage.py test \
  warships.tests.test_views.ApiContractTests.test_landing_players_sigma_mode_orders_by_efficiency_percentile \
  warships.tests.test_views.ApiContractTests.test_landing_players_sigma_mode_excludes_hidden_and_unpublished_players \
  warships.tests.test_views.ApiContractTests.test_landing_players_sigma_mode_caps_results_to_requested_limit \
  --keepdb

cd client && npm test -- --runInBand app/components/__tests__/PlayerSearch.test.tsx
```

## Completion Checklist

- [x] Sigma mode added to landing backend
- [x] Sigma button added to landing client
- [x] Sigma mode orders by published percentile
- [x] Hidden and unpublished rows excluded
- [x] Focused backend tests added
- [x] Focused client tests added
- [x] Validation evidence recorded

## Operating Notes

1. Sigma mode should rank by the published efficiency percentile, not by `player_score` alone.
2. The list-level ranking is separate from the row-level `E`-only sigma icon display policy.
3. Reuse the existing landing endpoint and cache namespace rather than adding a second landing-player API.