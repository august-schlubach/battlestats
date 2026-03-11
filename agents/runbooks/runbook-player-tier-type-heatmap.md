# Player Tier-Type Heatmap Runbook

## Status

Planned only. No feature implementation has been executed yet.

This runbook was prepared after exercising the new routed agentic workflow on the feature request. The workflow selected a hybrid orchestration path as the best fit because the request mixes planning, UX consistency, API work, and implementation.

## CrewAI Recommendation

Use CrewAI deliberately here as a planning and review layer, not as a single all-persona monolith.

This feature spans product framing, API contract design, chart UX, and release validation, but the actual coding work is still a conventional Django plus Next.js implementation task. The right fit is:

- CrewAI first, with a planning-focused crew to shape the work packet.
- LangGraph or direct engineering execution second, once the packet is stable.
- CrewAI again at the end for QA and safety review if the implementation meaningfully changes API behavior or player-detail UX.

Do not start with the full 8-persona CrewAI sequence for this feature. It is broader than needed for the initial planning pass and adds noise without improving the implementation packet.

## Recommended Crew Shape

### Phase 1: Planning Crew

Use a hierarchical CrewAI planning pass with these roles only:

- `project_coordinator`
- `project_manager`
- `architect`
- `ux`
- `designer`

This is the right first crew because the open questions are:

- exact endpoint contract
- aggregation semantics for population tiles versus player overlay
- chart behavior and empty states
- placement and copy alignment on the player page

Validated dry-run for this phase:

- workflow id: `crew-0625eb67ee9c`
- process: `hierarchical`
- run log: `server/logs/agentic/crewai/crew-0625eb67ee9c.json`

Expected artifacts from this phase:

- Coordinator: routing plan and dependency order
- PM: scope, non-goals, acceptance criteria, and feature risks
- Architect: endpoint contract, aggregation approach, rollback, and operational checks
- UX: primary flow, edge states, and accessibility checks
- Designer: visual constraints, component states, and responsive notes

### Phase 2: Implementation and Release Crew

After the planning packet is accepted, use a sequential CrewAI pass with:

- `engineer`
- `qa`
- `safety`

Validated dry-run for this phase:

- workflow id: `crew-8ebfd7ba8cbb`
- process: `sequential`
- run log: `server/logs/agentic/crewai/crew-8ebfd7ba8cbb.json`

This second crew should not replace implementation. Its purpose is to structure the handoff, test scope, and release decision around the finished change.

Expected artifacts from this phase:

- Engineer: touched surfaces, implementation notes, verification steps, and follow-ups
- QA: verified criteria, regression scope, issues, and release recommendation
- Safety: reviewed scope, mitigations, residual risks, and release decision

## Recommended Orchestration Path

Use the feature in three explicit stages.

### Stage A: CrewAI Planning

Run a planning-only CrewAI dry run first to shape the work packet:

```bash
cd server
PYTHONPATH=$PWD /home/august/code/archive/battlestats/.venv/bin/python scripts/run_agent_crew.py "plan a player-detail tier-vs-type heatmap feature with API surface test expansion" --roles project_coordinator,project_manager,architect,ux,designer --process hierarchical --dry-run --json
```

Use this stage to finalize:

- endpoint contract
- acceptance criteria
- chart state coverage
- test additions and fixture choice

### Stage B: Guarded Execution

Once the planning artifacts are stable, execute implementation through the guarded path. Preferred command:

```bash
cd server
PYTHONPATH=$PWD /home/august/code/archive/battlestats/.venv/bin/python scripts/run_agent_workflow.py "implement the player-detail tier-vs-type heatmap, add API surface coverage, and validate the change" --engine hybrid --json
```

Use hybrid here because the task becomes mixed:

- the CrewAI planning packet still matters
- the implementation needs deterministic execution and verification gates

If the work is already fully specified and no further persona synthesis is needed, a direct LangGraph execution path is also acceptable.

### Stage C: CrewAI Release Review

After code and tests are complete, run the implementation-review crew:

```bash
cd server
PYTHONPATH=$PWD /home/august/code/archive/battlestats/.venv/bin/python scripts/run_agent_crew.py "prepare implementation and release validation for a player-detail tier-vs-type heatmap" --roles engineer,qa,safety --process sequential --dry-run --json
```

Use this stage to confirm:

- the endpoint contract matches the shipped payload
- view tests and smoke coverage are sufficient
- the player-detail UX change is safe to ship

## CrewAI Handoff Gates

Do not begin implementation until the Phase 1 planning crew has converged on these points:

- final endpoint path and payload keys
- whether population tiles count ship rows, players, or another normalized unit
- player overlay semantics for sparse cells
- empty-state threshold for players with too little tier/type diversity
- exact test fixture to use in view tests and smoke coverage

Do not close the feature until the Phase 2 review crew can point to:

- passing view tests for the new endpoint
- passing smoke coverage for the new endpoint
- successful client build with the new player-detail chart mounted
- no regressions in existing player-detail sections

## Why This Crew Split Fits This Feature

This heatmap is not a broad product initiative. It is a focused analytics feature with one new endpoint, one new chart, and a narrow extension to test coverage.

That means:

- PM, Architect, UX, and Designer are useful before code starts.
- Engineer, QA, and Safety are useful once a real implementation exists.
- Running all personas together from the start would over-coordinate a relatively contained change.

The feature should use CrewAI to improve the packet quality and release discipline, while keeping the actual coding path lean.

## Feature Request

Add a new heatmap to the player detail page.

Placement:

- Put it below the existing charts on the player detail page for now.

Behavior:

- Show the player’s tier-vs-type performance record.
- Compare the player’s result against the trend of all players, similar to the existing win-rate-vs-survival heatmap.
- Keep the interaction, typography, loading pattern, and explanatory UX aligned with the existing player detail visualizations.

## Product Intent

The current player page shows:

- top ships
- ranked seasons
- performance by tier
- performance by ship type
- global win-rate and survival distributions

What is missing is a bivariate view that answers:

- Which tier and ship-type combinations does this player actually favor?
- How does the player’s tier/type mix compare to the broader population trend?
- Is the player over-indexed toward specific classes or tiers relative to peers?

This heatmap should fill that gap without replacing the current tier and type charts.

## Recommended UX Shape

### Placement

- Insert after the existing `Performance by Ship Type` section on the player detail page.
- Use the same `DeferredSection` and `LoadingPanel` pattern already used for the current heatmap/distribution charts.

### Visual Design

- Reuse the current player detail visual language:
  - section title in the same style
  - short explanatory helper text above the chart
  - pale blue grid/axes, slate labels, and Battlestats chart rhythm
- Keep the chart width responsive and aligned to the right-column chart stack.
- Use a real heatmap background plus a player marker or highlight overlay, following the established pattern in the existing correlation heatmap.

### Interaction Model

- Hover on a tile should show:
  - tier
  - ship type
  - population density or count
  - player battles or win rate in that tier/type cell if present
  - trend comparison text
- If the player has no battles in a tier/type cell, do not force a marker there.
- If the player lacks enough tier/type diversity, show a useful empty-state message instead of a blank chart.

### Copy Guidance

- Short heading suggestion: `Tier vs Type Profile`
- Helper text suggestion:
  - `Darker tiles show where the tracked player base clusters by tier and ship type. The player marker shows where this captain spends most of their battles, so you can compare their ship mix with the broader population trend.`

## Recommended Technical Approach

### Why a New Endpoint Is Needed

The current page already uses separate endpoints for:

- `/api/fetch/tier_data/<player_id>/`
- `/api/fetch/type_data/<player_id>/`
- `/api/fetch/player_correlation/win_rate_survival/`

But the requested feature is not a simple combination of the current tier and type summaries. Those existing endpoints flatten the data into one dimension each, while the new chart needs a two-dimensional population baseline plus a player-specific overlay.

Use a new dedicated endpoint rather than stitching the existing tier and type endpoints together client-side.

### Recommended API Shape

Add a new endpoint under the existing correlation family, for example:

- `/api/fetch/player_correlation/tier_type/<player_id>/`

Recommended response shape:

```json
{
  "metric": "tier_type",
  "label": "Tier vs Ship Type",
  "x_label": "Ship Type",
  "y_label": "Tier",
  "tracked_population": 12345,
  "tiles": [
    {
      "ship_type": "Destroyer",
      "ship_tier": 10,
      "count": 412
    }
  ],
  "trend": [
    {
      "ship_type": "Destroyer",
      "avg_tier": 8.7,
      "count": 2030
    }
  ],
  "player_cells": [
    {
      "ship_type": "Destroyer",
      "ship_tier": 10,
      "pvp_battles": 122,
      "wins": 71,
      "win_ratio": 0.582
    }
  ]
}
```

### Backend Data Source

Use `Player.battles_json` as the source of truth for the player overlay and for the population aggregation.

Expected aggregation shape:

- Population heatmap tiles:
  - count players or ship rows by `(ship_type, ship_tier)` across non-hidden players with a minimum battle threshold.
- Player overlay:
  - aggregate only the selected player’s `battles_json` into `(ship_type, ship_tier)` cells.
- Trend layer:
  - summarize average tier by ship type or another simple population ridge/centroid that can be rendered consistently with the existing heatmap concept.

### Backend Files Likely Touched

- `server/warships/data.py`
- `server/warships/serializers.py`
- `server/warships/views.py`
- `server/battlestats/urls.py`
- `server/warships/tests/test_views.py`
- `server/scripts/smoke_test_site_endpoints.py`

### Frontend Files Likely Touched

- `client/app/components/PlayerDetail.tsx`
- new component, likely `client/app/components/TierTypeHeatmapSVG.tsx`

## API Surface Test Plan

The feature should expand the API surface test coverage in two places.

### 1. Contract-Level View Tests

Add focused tests to `server/warships/tests/test_views.py` covering:

- successful payload for `/api/fetch/player_correlation/tier_type/<player_id>/`
- 404 for unsupported or missing player cases if appropriate
- payload keys:
  - `metric`
  - `label`
  - `x_label`
  - `y_label`
  - `tracked_population`
  - `tiles`
  - `trend`
  - `player_cells`
- non-empty tiles when enough fixture data exists
- correct player overlay aggregation for a player with mixed tier/type rows

### 2. Live Smoke Test Coverage

Extend `server/scripts/smoke_test_site_endpoints.py` with a new smoke case, for example:

- `player_correlation_tier_type_<fixture_name>`

Validation should assert:

- 200 status
- dict payload
- required keys present
- `tiles` is a list with at least one row
- `player_cells` is a list with at least one row for the selected fixture player

### Fixture Requirement

Use a stable player fixture with populated `battles_json` across multiple ship types and tiers. Confirm that fixture before implementation to avoid brittle smoke coverage.

## UX Consistency Plan

To stay consistent with the current player detail experience:

- Use `DeferredSection` like the win-rate-vs-survival chart.
- Match the section title, helper text, and spacing rhythm used in `PlayerDetail.tsx`.
- Reuse D3 chart conventions already present in:
  - `WRDistributionDesign2SVG.tsx`
  - `LandingClanSVG.tsx`
- Keep the empty/error/loading states explicit and visually aligned.

## Implementation Sequence

1. Define the backend payload and serializer contract.
2. Implement the new population + player overlay aggregation in `data.py`.
3. Add the view and route.
4. Add contract tests in `test_views.py`.
5. Add the smoke-test case to `smoke_test_site_endpoints.py`.
6. Build the new D3 component for the player detail page.
7. Mount it under the existing charts in `PlayerDetail.tsx`.
8. Run targeted backend tests, client build, and smoke tests.

## Acceptance Criteria

- A new tier-vs-type heatmap appears under the existing player detail charts.
- The chart compares the player’s tier/type usage to the broader player trend using a real heatmap treatment.
- The chart follows the current player detail UX language and deferred loading pattern.
- The backend exposes a typed API endpoint for the new chart.
- API surface tests are expanded with both targeted view coverage and smoke coverage.
- No regressions in current player detail charts.

## Validation Commands To Use After Implementation

```bash
cd server
LANGGRAPH_CHECKPOINT_POSTGRES_URL='' DB_ENGINE=sqlite3 DJANGO_SETTINGS_MODULE=battlestats.settings DJANGO_SECRET_KEY=test-secret PYTHONPATH=$PWD /home/august/code/archive/battlestats/.venv/bin/python -m pytest warships/tests/test_views.py
```

```bash
cd client
npm run build
```

```bash
cd server
/home/august/code/archive/battlestats/.venv/bin/python scripts/smoke_test_site_endpoints.py
```

## Rollback

- Remove the new player-correlation endpoint and serializer additions.
- Remove the new player-detail heatmap component.
- Remove the new smoke-test case if it depends on the removed endpoint.

## Execution Gate

This runbook is ready for implementation. Execution has not started yet.
