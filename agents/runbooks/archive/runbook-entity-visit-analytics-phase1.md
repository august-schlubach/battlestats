# Runbook: Entity Visit Analytics Phase 1

## Purpose

Implement and verify the first production slice of player/clan visit analytics so battlestats can answer which entity detail pages get the most visits.

Phase 1 includes:

1. route-level client emission from player and clan detail routes,
2. first-party raw event storage,
3. daily aggregate storage,
4. top-entities reporting API,
5. focused backend and client regression coverage.

## Artifacts

1. Spec: `agents/work-items/player-clan-visit-analytics-spec.md`
2. QA review: `agents/reviews/qa-player-clan-visit-analytics-review.md`

## Implementation Surfaces

1. `server/warships/models.py`
2. `server/warships/visit_analytics.py`
3. `server/warships/serializers.py`
4. `server/warships/views.py`
5. `server/battlestats/urls.py`
6. `client/app/lib/visitAnalytics.ts`
7. `client/app/components/PlayerRouteView.tsx`
8. `client/app/components/ClanRouteView.tsx`

## Execution Steps

### 1. Generate and apply database changes

From `server/`:

```bash
/home/august/code/archive/battlestats/.venv/bin/python manage.py makemigrations warships
/home/august/code/archive/battlestats/.venv/bin/python manage.py migrate
```

Expected result:

1. a new migration for `EntityVisitEvent` and `EntityVisitDaily`
2. migration applies cleanly

### 2. Run focused backend verification

From `server/`:

```bash
/home/august/code/archive/battlestats/.venv/bin/python manage.py test warships.tests.test_entity_visit_analytics --keepdb
```

Expected result:

1. ingest endpoint stores events and aggregates
2. cooldown dedupe works
3. duplicate `event_uuid` replay is ignored
4. bot traffic is ignored
5. top-entities endpoint ranks player and clan rows correctly

### 3. Run focused client verification

From `client/`:

```bash
npm test -- --runInBand app/components/__tests__/PlayerRouteView.test.tsx app/components/__tests__/ClanRouteView.test.tsx
```

Expected result:

1. routed player detail still loads correctly
2. routed clan detail still loads correctly
3. analytics helper is invoked only after successful route resolution
4. failed route loads do not emit analytics

### 4. Spot-check endpoint shapes if needed

Optional manual checks after the server is running:

1. `POST /api/analytics/entity-view/`
2. `GET /api/analytics/top-entities/?entity_type=player&period=7d&metric=views_deduped&limit=25`
3. `GET /api/analytics/top-entities/?entity_type=clan&period=7d&metric=views_deduped&limit=25`

## Success Criteria

1. migrations apply without errors
2. backend analytics tests pass
3. client route tests pass
4. player/clan page rendering remains resilient if analytics transport fails
5. rankings read from daily aggregates rather than hot page endpoints

## Notes

1. Phase 1 intentionally uses first-party tracking as the canonical source.
2. Google Analytics integration remains a later parallel lane, not part of this runbook.
3. `Player.last_lookup` and `Clan.last_lookup` remain freshness markers and are not repurposed as visit counters.
