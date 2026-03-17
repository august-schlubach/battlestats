# Runbook: Entity Visit Analytics Phase 2

## Purpose

Extend the Phase 1 entity visit analytics slice so the tracked data is operationally usable and maintainable.

This tranche covers the next three follow-on steps:

1. add an internal consumer for the analytics data,
2. add maintenance commands for rebuild and cleanup,
3. add optional parallel Google Analytics emission without changing the first-party source of truth.

## Preconditions

1. Phase 1 is already merged and migrated.
2. `EntityVisitEvent` and `EntityVisitDaily` exist and are being written.
3. The player and clan route tests and analytics backend tests are green.

## Scope

### In Scope

1. Django admin visibility for `EntityVisitDaily` and `EntityVisitEvent`.
2. A rebuild management command that recomputes daily aggregates from raw events.
3. A cleanup management command that deletes old raw event rows beyond a retention threshold.
4. Optional GA4 parallel emission from the existing client analytics helper.
5. Focused regression coverage for the new commands and client GA path.

### Out Of Scope

1. Public-facing site dashboards.
2. GA4 import back into battlestats.
3. Real-time analytics UI.
4. Changes to the canonical first-party counting rules.

## Recommended Execution Order

### 1. Internal consumer first

Add Django admin registration for the analytics models.

Reasoning:

1. It gives immediate operational value with minimal product risk.
2. It makes verification easier while the maintenance commands are added.
3. It avoids inventing a second dashboard surface prematurely.

### 2. Maintenance commands second

Add two commands:

1. `rebuild_entity_visit_daily`
2. `cleanup_entity_visit_events`

Reasoning:

1. Daily aggregates must be recoverable if drift or bugs are discovered.
2. Raw event storage needs a retention path before long-term usage grows.

### 3. GA4 emission last

Extend the existing client helper so it can optionally emit `entity_detail_view` to GA4 when a measurement ID is configured.

Reasoning:

1. First-party tracking remains the canonical source and is already verified.
2. GA4 should be additive and optional.
3. Shipping GA after the internal consumer and maintenance commands reduces simultaneous debugging surfaces.

## File Targets

Likely touched files:

1. `server/warships/admin.py`
2. `server/warships/management/commands/rebuild_entity_visit_daily.py`
3. `server/warships/management/commands/cleanup_entity_visit_events.py`
4. `server/warships/tests/test_management_commands.py`
5. `client/app/layout.tsx`
6. `client/app/lib/visitAnalytics.ts`
7. client tests related to analytics helper behavior

## Command Design

### `rebuild_entity_visit_daily`

Expected behavior:

1. optionally delete existing `EntityVisitDaily` rows in scope,
2. scan `EntityVisitEvent` rows by date and entity,
3. recompute `views_raw`, `views_deduped`, `unique_visitors`, `unique_sessions`, and `last_view_at`,
4. write a stable JSON summary to stdout.

Recommended flags:

1. `--start-date YYYY-MM-DD`
2. `--end-date YYYY-MM-DD`
3. `--entity-type player|clan`
4. `--dry-run`

### `cleanup_entity_visit_events`

Expected behavior:

1. delete raw event rows older than a retention threshold,
2. keep daily aggregates intact,
3. support dry-run output before deletion.

Recommended flags:

1. `--older-than-days <int>`
2. `--dry-run`

## GA4 Design

### Client behavior

1. Continue sending the first-party POST exactly as Phase 1 does.
2. If `NEXT_PUBLIC_GA_MEASUREMENT_ID` is absent, do nothing extra.
3. If configured and `window.gtag` exists, emit `entity_detail_view` with:
   1. `entity_type`
   2. `entity_id`
   3. `entity_name`
   4. `entity_slug`
   5. `route_path`

### App shell behavior

1. Bootstrap GA only when the measurement ID exists.
2. Keep the app functional when GA loading fails or is blocked.

## Verification Steps

### 1. Admin registration sanity

Check that analytics models appear in Django admin with usable list views and filters.

### 2. Focused backend command tests

Run from `server/`:

```bash
/home/august/code/archive/battlestats/.venv/bin/python manage.py test warships.tests.test_management_commands --keepdb
```

Expected additions:

1. rebuild command recomputes daily rows correctly
2. cleanup command reports and deletes expected rows

### 3. Focused client tests

Run from `client/`:

```bash
npm test -- --runInBand app/components/__tests__/PlayerRouteView.test.tsx app/components/__tests__/ClanRouteView.test.tsx
```

If a dedicated analytics-helper test file is added, include it here as well.

### 4. Optional manual GA validation

If a GA measurement ID is configured locally:

1. load a player detail route,
2. load a clan detail route,
3. confirm the first-party POST still fires,
4. confirm `window.gtag` receives `entity_detail_view`.

## Success Criteria

1. Admin can inspect raw and daily visit rows without direct SQL.
2. Daily aggregates can be rebuilt deterministically from raw events.
3. Old raw events can be safely cleaned up with a dry-run preview.
4. GA4 emission is optional and cannot block page rendering or first-party tracking.

## Rollback Guidance

1. If GA4 emission causes issues, disable it by removing `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
2. If command logic is wrong, rebuild daily aggregates from raw events after the fix.
3. Do not repurpose `last_lookup` timestamps as a fallback counter.