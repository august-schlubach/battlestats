# Runbook: Integrated Clan Activity Filter Strip

## Goal

Add a clan activity filter strip inside the top of the clan scatterplot so roster activity and player performance can be read in the same graphic.

This version must satisfy these explicit requirements:

- build the activity view into the top of the clan chart rather than rendering a separate graphic above it
- use a one-line activity strip ordered from `active now` on the left to `no recency` on the right
- when hovering an activity section, keep matching player circles visible in color and fade the other circles to light grey
- preserve the main point of the clan plot: see which players are active and where they sit in the battles-vs-win-rate field
- keep the chart width aligned to the `900px` clan chart width

## Product Framing

The clan page already shows battle volume and win rate, but those views can flatter a dead roster. The integrated strip answers a different question:

- how many members are still playing now
- how many are cooling off
- how much of the roster is effectively dormant

It uses the field the product already stores reliably for each player:

- `days_since_last_battle`

## Chart Design

The first draft is a compact one-line activity strip embedded at the top of the scatterplot.

- `0-7d`: active now
- `8-30d`: still warm
- `31-90d`: cooling
- `91-180d`: dormant
- `181d+`: gone dark
- `unknown`: recency unavailable

The full strip always represents `100%` of clan members. Each segment represents that inactivity band's share of the visible roster.

Segments must appear in this fixed order:

- `active now`
- `still warm`
- `cooling`
- `dormant`
- `gone dark`
- `no recency`

Hover detail shows the roster slice. More importantly, hover changes the scatterplot itself: matching players stay visible in color while the rest fade to light grey. That makes activity immediately legible in the same spatial field as performance.

## Design Principles

- Keep the activity strip and scatterplot in one visual system so one informs the other.
- Use the strip as an interaction surface, not as a second independent chart.
- Keep the left-to-right ordering fixed from most active to least known.
- Let color encode recency severity, not ornament.
- Keep support text and hover details light so the scatterplot remains the main field of attention.
- Avoid pretending we have a full clan activity time series when we only have current recency.

## API Contract

Endpoint:

- `GET /api/fetch/clan_members/<clan_id>/`

Additional fields used by the chart:

- `days_since_last_battle`
- `activity_bucket`

`activity_bucket` values:

- `active_7d`
- `active_30d`
- `cooling_90d`
- `dormant_180d`
- `inactive_180d_plus`
- `unknown`

## Files

- `agents/designer.md`
- `client/app/components/ClanSVG.tsx`
- `client/app/components/ClanDetail.tsx`
- `client/app/components/ClanMembers.tsx`

## Validation

1. Run targeted backend tests:
   - `docker compose exec -T server python manage.py test warships.tests.test_views.ClanMembersEndpointTests`
2. Run the client build:
   - `cd client && npm run build`
3. Manual UI check on a populated clan:
   - verify the activity strip renders inside the top of the clan chart, not as a separate panel
   - verify the segments appear left-to-right from `active now` through `no recency`
   - verify hovering a segment keeps matching players visible in color
   - verify non-matching players fade to light grey instead of competing visually
   - verify the filtered points still show their relative battles and win-rate positions clearly
   - verify member pills show recency text in the roster list

## Risks

- The chart reflects current inactivity, not longitudinal churn.
- Some players may carry stale recency if upstream refreshes lag.
- Very small clans may produce sparse bars; that is expected and still informative.

## Non-Goals

- Do not infer a true monthly clan-retention history from current player records.
- Do not redesign the clan members section beyond exposing recency clearly.
