# Runbook: Landing Activity and Attrition Chart

## Goal

Add a new landing-page chart above the existing clan landscape chart that shows whether the tracked player field looks like it is growing, stable, or shrinking.

The chart should match the current landing-page tone: restrained, information-dense, blue-forward, and readable without ornamental clutter.

## Product Framing

This chart is not a raw gameplay time series.

It is a cohort view built from the data the product actually stores reliably today:

- `creation_date`
- `days_since_last_battle`
- `last_battle_date`

The x-axis is account creation month for the last 18 completed months.
Each vertical bar is one monthly account cohort, split by each cohort's current state:

- `active 30d`
- `cooling 31-90d`
- `dormant 90d+`

This makes attrition legible without pretending we have a full historical activity ledger for the entire population.

## Why This Design

The current `Snapshot` table is too sparse and too recent to support a trustworthy population-level historical activity chart.

Live inspection during implementation showed:

- only `124` snapshot rows,
- only `115` distinct players with snapshots,
- coverage beginning on `2026-03-03`.

That is enough for individual player recent-activity views, but not enough for landing-page population history.

The cohort chart is the honest alternative.

## Visual Design

### Main Encoding

- Stacked bars show the number of players observed in each account-creation cohort.
- Segment colors encode current recency state.
- A dark overlaid line shows the trailing 3-month average of `active_players` to provide a compact signal for whether the living part of the field is thickening or thinning.

### Tufte-Inspired Decisions

- Use one compact chart instead of multiple small panels.
- Keep the explanatory text outside the plot and use direct legend copy in the chart header.
- Use subtle gridlines only in support of reading values.
- Put detail text on hover in a lightweight annotation card rather than permanent heavy labels.
- Avoid a second axis; the line is kept on the same count scale as the bars.

## API Contract

### Endpoint

- `GET /api/landing/activity-attrition/`

### Payload Shape

- `metric`
- `label`
- `x_label`
- `y_label`
- `tracked_population`
- `months[]`
  - `month`
  - `total_players`
  - `active_players`
  - `cooling_players`
  - `dormant_players`
  - `active_share`
- `summary`
  - `latest_month`
  - `population_signal`
  - `signal_delta_pct`
  - `recent_active_avg`
  - `prior_active_avg`
  - `recent_new_avg`
  - `prior_new_avg`
  - `months_compared`

## Signal Definition

The summary signal is based on the average number of currently active players in the most recent 6 completed creation cohorts versus the prior 6 cohorts.

- `growing`: recent average is at least `8%` higher
- `shrinking`: recent average is at least `8%` lower
- `stable`: otherwise

This should be read as an observed cohort-health signal, not a claim about the full global game population.

## Files

- `server/warships/data.py`
- `server/warships/serializers.py`
- `server/warships/views.py`
- `server/battlestats/urls.py`
- `server/warships/tests/test_views.py`
- `client/app/components/LandingActivityAttritionSVG.tsx`
- `client/app/components/PlayerSearch.tsx`

## Validation

1. Run targeted backend tests:
   - `docker compose exec -T server python manage.py test warships.tests.test_views.ApiContractTests.test_landing_activity_attrition_returns_monthly_cohorts`
2. Run the client build:
   - `cd client && npm run build`
3. Manual UI check:
   - confirm the new chart appears above the clan chart
   - confirm the new chart uses the same height as the clan chart
   - hover a few cohorts and verify the annotation card matches the bar composition
   - confirm the line reads as a population pulse rather than a second unrelated metric

## Risks

- If `creation_date` coverage changes materially, cohort volumes may shift sharply.
- The signal is sensitive to recently crawled cohorts; it is directional, not absolute.
- If the landing page narrows significantly, month labels may need more aggressive thinning.

## Non-Goals

- Do not claim a literal daily DAU/MAU time series for the whole game.
- Do not derive this chart from sparse `Snapshot` history.
- Do not redesign the existing clan chart in the same pass.
