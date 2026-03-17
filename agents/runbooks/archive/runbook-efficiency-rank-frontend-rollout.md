# Runbook: Efficiency Rank Frontend Rollout

_Drafted: 2026-03-16_

_Archived: 2026-03-16 after player-detail tranche execution_

## Outcome

This runbook was executed successfully for the player-detail surface.

Shipped results:

1. the player-detail header icon was polished into a Battlestats-specific rank marker,
2. tooltip and accessibility copy now describe the icon as a tracked-player rank derived from stored WG badge profile data,
3. the compatibility fallback from the legacy boolean path remains covered by tests,
4. hidden-player suppression is enforced client-side,
5. focused client validation passed.

Execution evidence:

1. implementation: [client/app/components/PlayerDetail.tsx](/home/august/code/archive/battlestats/client/app/components/PlayerDetail.tsx)
2. tests: [client/app/components/**tests**/PlayerDetail.test.tsx](/home/august/code/archive/battlestats/client/app/components/__tests__/PlayerDetail.test.tsx)
3. QA review: [agents/reviews/qa-efficiency-rank-frontend-rollout-review.md](/home/august/code/archive/battlestats/agents/reviews/qa-efficiency-rank-frontend-rollout-review.md)

Focused validation command:

```bash
cd client && npm test -- --runInBand app/components/__tests__/PlayerDetail.test.tsx
```

Result:

1. `PASS`
2. `4` tests passed

## Archived Scope

This runbook covered only the player-detail frontend tranche.

Completed scope:

1. player-detail header icon polish,
2. tooltip wording and accessibility review,
3. alignment with the nearby `Efficiency Badges` section,
4. focused client regression coverage for rank icon behavior.

Explicitly deferred scope:

1. explorer row rollout,
2. clan member row rollout,
3. landing-page usage,
4. backend rank-math changes.

## Follow-up Boundary

Any future rollout into explorer rows, clan rows, or landing surfaces should use a new runbook rather than reopening this archived tranche.
