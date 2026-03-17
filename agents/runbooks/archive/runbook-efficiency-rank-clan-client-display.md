# Runbook: Efficiency Rank Clan Client Display

_Drafted: 2026-03-16_

_Archived: 2026-03-16 after clan/player roster execution_

## Outcome

This runbook was executed successfully for the shared clan-roster client lane.

Shipped results:

1. both the clan detail page and the player detail page now fetch clan-member roster data through the shared `useClanMembers` hook,
2. both routes render the same shared `ClanMembers` surface,
3. the shared roster shows a compact `Updating Battlestats rank icons...` status while efficiency hydration is still pending,
4. the backend clan-efficiency hydration lane now republishes global efficiency-rank snapshot fields after raw player-efficiency refreshes,
5. qualifying clan members regain their published efficiency-rank icon state after the shared roster re-polls.

Execution evidence:

1. shared roster status: [client/app/components/ClanMembers.tsx](client/app/components/ClanMembers.tsx)
2. clan route hook wiring: [client/app/components/**tests**/ClanDetail.test.tsx](client/app/components/__tests__/ClanDetail.test.tsx)
3. player-detail hook wiring: [client/app/components/**tests**/PlayerDetail.test.tsx](client/app/components/__tests__/PlayerDetail.test.tsx)
4. shared roster icon + status coverage: [client/app/components/**tests**/ClanMembers.test.tsx](client/app/components/__tests__/ClanMembers.test.tsx)
5. QA review: [agents/reviews/qa-efficiency-rank-clan-client-display-review.md](agents/reviews/qa-efficiency-rank-clan-client-display-review.md)

Focused client validation command:

```bash
cd client && npm test -- --runInBand app/components/__tests__/ClanMembers.test.tsx app/components/__tests__/ClanDetail.test.tsx app/components/__tests__/PlayerDetail.test.tsx
```

Result:

1. `PASS`
2. `12` tests passed

Live validation highlights:

1. a temporary stale RESIN roster slice returned `X-Efficiency-Hydration-Pending: 3` on first fetch and `0` on follow-up,
2. a temporary stale qualifying-icon fixture in clan `1000064093` republished live icon rows to `SavageCoastie -> II` and `Shinn000 -> III` after the shared roster re-poll loop completed.

## Archived Scope

This runbook covered the shipped clan/player shared roster display behavior.

Completed scope:

1. shared route wiring through `useClanMembers`,
2. shared clan roster icon rendering,
3. visible roster-level warming state,
4. backend snapshot republish integration for the efficiency hydration lane,
5. focused client QA plus live endpoint verification.

Explicitly deferred scope:

1. broader smoke-suite cleanup outside this feature lane,
2. alternate UX treatments for the roster warming state,
3. additional landing or explorer rollout surfaces.

## Follow-up Boundary

Any future changes to roster warming UX, efficiency-rank publication math, or additional surfaces should use a new runbook rather than reopening this archived execution record.
