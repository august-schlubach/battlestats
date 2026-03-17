# Runbook: Streamlined Player PvE Icon Heuristic

_Drafted: 2026-03-17_

## Status

Executed on 2026-03-17.

## Purpose

Replace the split PvE-icon logic with one shared backend heuristic and make all current PvE robot surfaces consume the same derived eligibility signal.

## Source Artifacts

- [agents/work-items/player-pve-icon-streamlined-heuristic-spec.md](agents/work-items/player-pve-icon-streamlined-heuristic-spec.md)
- [agents/reviews/qa-player-pve-icon-streamlined-heuristic-review.md](agents/reviews/qa-player-pve-icon-streamlined-heuristic-review.md)

## Current Behavior Summary

Today there are two live PvE icon rules:

1. player detail uses a local majority-PvE check,
2. clan and landing surfaces use a backend helper with a `>= 4000 PvE battles` escape hatch.

That means the same player can render differently across surfaces, and the absolute-count override can misclassify high-volume PvP players with a side investment in PvE.

## Intended Change

Use one shared heuristic everywhere:

1. `total_battles > 500`
2. `pve_battles = max(total_battles - pvp_battles, 0)`
3. `pve_battles >= 1500`
4. `pve_share_total = pve_battles / total_battles >= 0.30`

Then publish and consume a single `is_pve_player` boolean across all current robot-icon surfaces.

## Scope Boundary

In scope:

1. the shared `is_pve_player` helper,
2. player-detail payload support for `is_pve_player`,
3. player detail header use of the shared flag,
4. clan and landing payloads inheriting the updated helper behavior,
5. focused backend and client regression coverage,
6. small doc updates that remove stale descriptions of the current rule.

Out of scope:

1. redesigning the robot icon,
2. introducing a full mode taxonomy,
3. persisting a database field for PvE eligibility,
4. adding upstream WG calls just for PvE classification.

## Agent Responsibilities

### Project Manager

1. Keep the tranche limited to heuristic unification.
2. Prevent unrelated icon or playstyle work from expanding the scope.
3. Require one shared backend rule before any client-specific polish.

### Architect

1. Keep the rule in shared backend derivation rather than scattered client logic.
2. Preserve additive payload changes where player detail needs the shared flag.
3. Keep the rule explainable from stored totals.

### Engineer-Web-Dev

1. Replace the old helper thresholds.
2. Add `is_pve_player` to player detail payloads.
3. Update player detail to consume the shared flag.
4. Refresh focused tests and stale docs.

### QA

1. Verify the five named example players classify as intended.
2. Verify threshold edge behavior.
3. Verify surface consistency across player detail, clan members, and landing players.

## Implementation Sequence

### Phase 1: Shared Helper

1. Update `is_pve_player(total_battles, pvp_battles)` in [server/warships/data.py](server/warships/data.py).
2. Keep the helper signature unchanged so current call sites remain small.

### Phase 2: Player Detail Contract

1. Extend `PlayerSerializer` additively with `is_pve_player`.
2. Update the player-detail client types to accept the new field.
3. Remove the local player-detail majority-PvE derivation and consume the shared boolean instead.

### Phase 3: Regression Coverage

1. Update clan-members endpoint tests to match the new thresholds.
2. Add player-detail API coverage for `is_pve_player`.
3. Add player-detail client tests that verify the header robot follows payload state.
4. Add landing-player coverage if no existing test already proves the shared helper behavior there.

### Phase 4: Documentation Cleanup

1. Mark the new runbook as executed once validation passes.
2. Update stale knowledge or overview docs that still describe the old rule as current.

## Suggested Test Targets

Backend:

1. [server/warships/tests/test_views.py](server/warships/tests/test_views.py)

Client:

1. [client/app/components/__tests__/PlayerDetail.test.tsx](client/app/components/__tests__/PlayerDetail.test.tsx)
2. [client/app/components/__tests__/ClanMembers.test.tsx](client/app/components/__tests__/ClanMembers.test.tsx) only if rendering behavior needs extra coverage

## Validation Commands

Focused backend command:

```bash
cd server && /home/august/code/archive/battlestats/.venv/bin/python manage.py test \
  warships.tests.test_views --keepdb
```

Focused client command:

```bash
cd client && npm test -- --runInBand \
  app/components/__tests__/PlayerDetail.test.tsx \
  app/components/__tests__/ClanMembers.test.tsx
```

Use narrower test targets if the exact touched methods are obvious.

## Execution Evidence

Implementation landed in:

1. [server/warships/data.py](server/warships/data.py)
2. [server/warships/serializers.py](server/warships/serializers.py)
3. [client/app/components/PlayerDetail.tsx](client/app/components/PlayerDetail.tsx)
4. [client/app/components/entityTypes.ts](client/app/components/entityTypes.ts)
5. [agents/knowledge/battleships-overview.md](agents/knowledge/battleships-overview.md)

Focused regression coverage landed in:

1. [server/warships/tests/test_views.py](server/warships/tests/test_views.py)
2. [client/app/components/__tests__/PlayerDetail.test.tsx](client/app/components/__tests__/PlayerDetail.test.tsx)

Focused validation passed:

```bash
cd server && /home/august/code/archive/battlestats/.venv/bin/python manage.py test \
  warships.tests.test_views --keepdb

cd client && npm test -- --runInBand app/components/__tests__/PlayerDetail.test.tsx
```

## Release Fixtures

Manual or endpoint verification should include:

1. Mebuki: no PvE icon
2. Hungria15: yes PvE icon
3. ShrimpDance: no PvE icon
4. UnitedShipcare: yes PvE icon
5. eisenhowers: yes PvE icon

## Rollback Plan

If the new heuristic proves too strict or too loose:

1. restore the prior helper while keeping any harmless additive player-detail payload field,
2. leave player detail consuming the backend flag if possible,
3. re-tune thresholds in one helper rather than reintroducing surface-specific logic.

## Completion Checklist

- [x] Shared PvE helper updated
- [x] Player serializer exposes `is_pve_player`
- [x] Player detail uses the shared payload flag
- [x] Clan and landing surfaces inherit the new shared rule
- [x] Focused backend tests updated
- [x] Focused client tests updated
- [x] Stale rule docs updated
- [x] Validation evidence recorded

## Operating Notes

1. The new heuristic is intentionally a product-facing playstyle marker, not a definitive account-mode taxonomy.
2. The important product fix is consistency first; threshold tuning remains a separate product judgment if later evidence suggests adjustment.
3. Avoid reintroducing client-local PvE derivation after this tranche lands.