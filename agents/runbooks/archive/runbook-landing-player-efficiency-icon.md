# Runbook: Landing Player List Efficiency Sigma Icon

_Drafted: 2026-03-17_

## Status

Executed on 2026-03-17.

## Purpose

Roll the Battlestats efficiency sigma icon onto landing-page player lists by extending the existing landing payload with the published efficiency contract and rendering the inline sigma only for resolved Expert rows.

## Source Artifacts

- [agents/work-items/landing-player-efficiency-icon-spec.md](agents/work-items/landing-player-efficiency-icon-spec.md)
- [agents/reviews/qa-landing-player-efficiency-icon-review.md](agents/reviews/qa-landing-player-efficiency-icon-review.md)

## Current Behavior Summary

Today the landing page already renders compact row icons for ranked, PvE, sleepy, clan-battle, and hidden-account state, but it does not publish or render efficiency-rank state at all.

Other current efficiency behavior is already split by surface:

1. player-detail header shows any published efficiency tier,
2. dense clan rows show only `E`,
3. landing rows show nothing yet.

## Intended Change

1. Extend landing player rows additively with the existing published efficiency fields.
2. Reuse the shared `EfficiencyRankIcon` tooltip and inline glyph.
3. Resolve landing visibility with the current dense-row rule: render sigma only when the resolved tier is `E`.
4. Preserve hidden-player suppression and avoid any new landing-specific fetch or hydration lane.

## Scope Boundary

In scope:

1. `/api/landing/players/` payload publication,
2. `/api/landing/recent/` payload publication,
3. landing player row rendering in [client/app/components/PlayerSearch.tsx](client/app/components/PlayerSearch.tsx),
4. focused backend and client regression coverage,
5. landing cache-version updates needed to publish the new fields promptly.

Out of scope:

1. percentile-model changes,
2. widening clan-row visibility beyond `E`,
3. player-detail header behavior,
4. any new browser fetch or polling path for landing efficiency state.

## Agent Responsibilities

### Project Manager

1. Keep the tranche limited to landing payload and landing-row rendering.
2. Avoid reopening broader efficiency-ranking product rules.

### Architect

1. Reuse the shared publication helper rather than duplicating landing-specific efficiency logic.
2. Keep the client rule aligned with existing dense-row surfaces.

### Engineer-Web-Dev

1. Extend landing payloads with published efficiency fields.
2. Bump landing cache versions as needed.
3. Update the landing row component to render the inline sigma only for `E`.
4. Add focused regression tests.

### QA

1. Verify additive publication on landing and recent endpoints.
2. Verify `E` rows render sigma while non-`E` rows do not.
3. Verify existing landing row icons remain intact.

## Implementation Sequence

### Phase 1: Backend Payload

1. Reuse `_get_published_efficiency_rank_payload(player)` during landing row serialization.
2. Publish the additive efficiency fields on random, best, and recent landing player rows.
3. Bump landing player cache versions so cached payloads do not hide the new fields.

### Phase 2: Client Rendering

1. Extend the landing row type in [client/app/components/PlayerSearch.tsx](client/app/components/PlayerSearch.tsx).
2. Import `EfficiencyRankIcon` and `resolveEfficiencyRankTier(...)`.
3. Render the inline sigma only when the resolved tier is `E`.

### Phase 3: Regression Coverage

1. Add backend tests for landing and recent payload publication.
2. Add client coverage for `E`-only landing-row rendering.
3. Verify existing ranked, PvE, sleepy, and clan-battle markers still render.

## Suggested Test Targets

Backend:

1. [server/warships/tests/test_views.py](server/warships/tests/test_views.py)

Client:

1. [client/app/components/__tests__/PlayerSearch.test.tsx](client/app/components/__tests__/PlayerSearch.test.tsx)

## Validation Commands

Focused backend command:

```bash
cd server && /home/august/code/archive/battlestats/activate/bin/python manage.py test \
  warships.tests.test_views --keepdb
```

Focused client command:

```bash
cd client && npm test -- --runInBand app/components/__tests__/PlayerSearch.test.tsx
```

## Rollback Plan

If the landing rollout causes row clutter or payload issues:

1. remove the landing sigma render while leaving additive payload publication in place if harmless,
2. or temporarily stop merging the efficiency payload into landing rows,
3. keep the shared efficiency contract itself unchanged so other surfaces remain stable.

## Execution Evidence

Implementation landed in:

1. [server/warships/landing.py](server/warships/landing.py)
2. [client/app/components/PlayerSearch.tsx](client/app/components/PlayerSearch.tsx)
3. [server/warships/tests/test_views.py](server/warships/tests/test_views.py)
4. [client/app/components/__tests__/PlayerSearch.test.tsx](client/app/components/__tests__/PlayerSearch.test.tsx)

Focused validation passed:

```bash
cd server && /home/august/code/archive/battlestats/.venv/bin/python manage.py test \
  warships.tests.test_views.ApiContractTests.test_landing_players_and_recent_players_expose_published_efficiency_fields \
  --keepdb

cd client && npm test -- --runInBand app/components/__tests__/PlayerSearch.test.tsx
```

## Completion Checklist

- [x] Landing player payload exposes additive efficiency fields
- [x] Recent landing payload exposes additive efficiency fields
- [x] Landing rows show sigma only for resolved `E`
- [x] Existing landing icons remain intact
- [x] Focused backend tests added
- [x] Focused client tests added
- [x] Validation evidence recorded

## Operating Notes

1. Landing is intentionally treated as a dense row surface, not as a miniature player header.
2. The shared resolver should determine the effective tier before any client-side visibility decision.
3. Avoid adding a landing-specific tooltip or glyph variant unless row-density evidence later demands it.