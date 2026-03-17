# Runbook: Player Detail Clan Battle Shield Last-Known-State Hydration

_Drafted: 2026-03-17_

## Status

Executed on 2026-03-17.

## Purpose

Implement a smaller, more consistent hydration pattern for the player-detail header shield so it renders from the last known local state on first paint and reconciles against the existing clan-battle seasons fetch only when that fetch materially changes the displayed result.

## Source Artifact

- [agents/work-items/player-detail-clan-battle-shield-hydration-spec.md](agents/work-items/player-detail-clan-battle-shield-hydration-spec.md)
- [agents/reviews/qa-player-detail-clan-battle-shield-last-known-state-review.md](agents/reviews/qa-player-detail-clan-battle-shield-last-known-state-review.md)

## Current Behavior Summary

Today, the player-detail header shield is the only icon in the tray that does not render from the initial player payload.

Current behavior:

1. `PlayerDetail.tsx` initializes `clanBattleSummary` to `null`,
2. `PlayerClanBattleSeasons.tsx` fetches `/api/fetch/player_clan_battle_seasons/<player_id>/`,
3. the header shield appears only after that child fetch completes and the summary is passed upward.

By contrast, the hidden mask, clan leader crown, PvE robot, sleepy bed, ranked star, and efficiency sigma all derive from the initial player payload or local derivation from that payload.

## Intended Change

1. expose cached clan-battle header fields on the player detail payload,
2. initialize the shield from those cached fields,
3. keep the existing seasons fetch as the authoritative reconciliation path,
4. update the rendered shield only when the fetched summary changes the visible result.

## Scope Boundary

In scope:

1. player detail header shield behavior,
2. additive player payload support for cached clan-battle shield state,
3. reconciliation logic between cached state and seasons fetch,
4. focused tests and docs for the changed contract.

Out of scope:

1. changing clan battle qualification thresholds,
2. redesigning the shield icon itself,
3. adding new browser fetches just for the header,
4. changing clan roster shield hydration.

## Agent Responsibilities

### Project Manager

1. Keep the tranche limited to player-detail shield hydration behavior.
2. Prevent clan roster or unrelated icon changes from slipping into the implementation.
3. Require additive contract and focused validation in the same change.

### Architect

1. Ensure the header reads from existing local/cached state rather than new fetch fan-out.
2. Preserve the current non-blocking player-detail load path.
3. Review whether cached summary fields are the smallest stable contract to add.

### Engineer-Web-Dev

1. Add the cached shield fields to the player payload.
2. Initialize the header from cached state.
3. Reconcile fetched state only on material change.
4. Keep the implementation bounded and reversible.

### QA

1. Verify immediate first-paint shield behavior.
2. Verify no-op reconciliation when the fetched result matches the cached state.
3. Verify state change when fetched summary changes eligibility or color band.
4. Verify failure fallback keeps valid cached state visible.

### Safety / Reliability

1. Confirm no new browser-triggered WG fetch path is introduced.
2. Confirm the player-detail route remains renderable on stale local data.
3. Confirm payload changes are additive and documented.

## Preconditions

1. The initial player payload already carries most header-icon inputs through `PlayerSerializer`.
2. `PlayerClanBattleSeasons.tsx` already computes an authoritative summary after fetch.
3. There is an existing local or cached clan-battle summary source that can back additive player payload fields without synchronous upstream dependency.

## Implementation Sequence

### Phase 1: Current-State Audit

1. Confirm which local backend source can expose last known clan-battle summary for player detail.
2. Confirm exact visible shield state definition:
   - eligible / ineligible
   - win-rate-derived color
   - tooltip text
3. Confirm that no current consumers depend on shield absence during initial load.

### Phase 2: Backend Contract

1. Extend the player serializer additively with cached clan-battle shield fields.
2. Add API-facing tests for the new fields.
3. Update any relevant contract docs if the payload changes.

### Phase 3: Client Initialization

1. Replace `null`-only initial header state with cached initialization from the player payload.
2. Continue mounting `PlayerClanBattleSeasons` unchanged as the detailed seasons owner.
3. Keep the detailed section loading state separate from the header icon state.

### Phase 4: Reconciliation Logic

1. Add a comparison helper that decides whether fetched summary materially changes the header.
2. Skip state updates when fetched summary is equivalent to cached visible state.
3. Keep cached shield state in place on fetch failure.

### Phase 5: Validation

1. Focused client tests for:
   - immediate cached render,
   - no-op reconciliation,
   - changed-state reconciliation,
   - failure fallback.
2. Focused backend tests for additive payload shape and cached summary derivation.
3. Manual browser check on at least:
   - one qualifying player,
   - one non-qualifying player,
   - one player whose fetched summary changes state.

## Suggested Test Targets

Client:

1. `client/app/components/__tests__/PlayerDetail.test.tsx`
2. any existing route-level player-detail tests that assert payload consumption

Backend:

1. `server/warships/tests/test_views.py`
2. `server/warships/tests/test_data.py`
3. serializer-focused tests if present or added in the same tranche

## Validation Commands

Focused client command:

```bash
cd client && npm test -- --runInBand app/components/__tests__/PlayerDetail.test.tsx
```

Focused backend command shape:

```bash
cd server && /home/august/code/archive/battlestats/.venv/bin/python manage.py test \
  warships.tests.test_views \
  warships.tests.test_data --keepdb
```

Use narrower class or method targets once the exact implementation lands.

## Execution Evidence

Implementation landed in:

1. [server/warships/serializers.py](server/warships/serializers.py)
2. [client/app/components/PlayerDetail.tsx](client/app/components/PlayerDetail.tsx)
3. [client/app/components/PlayerClanBattleSeasons.tsx](client/app/components/PlayerClanBattleSeasons.tsx)
4. [client/app/components/entityTypes.ts](client/app/components/entityTypes.ts)

Focused regression coverage landed in:

1. [server/warships/tests/test_views.py](server/warships/tests/test_views.py)
2. [client/app/components/__tests__/PlayerDetail.test.tsx](client/app/components/__tests__/PlayerDetail.test.tsx)

Focused validation passed:

```bash
cd client && npm test -- --runInBand app/components/__tests__/PlayerDetail.test.tsx

cd server && /home/august/code/archive/battlestats/.venv/bin/python manage.py test \
   warships.tests.test_views.PlayerViewSetTests --keepdb
```

## Rollback Plan

If the change regresses player-detail rendering or causes contract issues:

1. remove the cached shield initialization path from `PlayerDetail.tsx`,
2. leave the existing seasons fetch path intact,
3. retain or remove additive payload fields depending on whether they are harmless to keep,
4. restore the current late-arrival shield behavior as the safe fallback.

## Completion Checklist

- [x] Cached shield payload fields identified
- [x] Player serializer extended additively
- [x] Client initializes shield from cached state
- [x] Reconciliation only updates on material change
- [x] Fetch failure preserves cached shield state
- [x] Focused client tests updated
- [x] Focused backend/API tests updated
- [x] Relevant contract docs updated if payload changes

## Operating Notes

1. This change should preserve the current user-facing shield visual language unless implementation explicitly chooses a neutral fallback shield color for partially known cached state.
2. The preferred path is still to carry enough cached summary that the first-paint shield can use its normal win-rate color rather than a neutral placeholder.
3. Do not add a dedicated browser fetch for the shield; reuse the current seasons fetch and the initial player payload.
