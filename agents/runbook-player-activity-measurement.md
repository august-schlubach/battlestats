# Runbook: Player Activity Measurement

## Purpose

Provide a reusable, multi-agent decision framework for measuring player activity with the data currently available in Battlestats.

This revision reflects that ranked seasons are now surfaced on the player detail page. The framework now treats ranked participation as an active competitive signal while keeping clan battle activity deferred until player-grain data exists.

## Revision Status

- Revision date: 2026-03-08
- Ranked integration status: live in player detail UI via ranked seasons table
- Scope of this revision: align PM/UX/engineering/QA guidance with ranked now operational

## PM Task

**Task owner:** Project Manager Agent

**Task:** Determine how player activity should be measured without overstating what the current dataset can support.

**Decision standard:**

1. Prefer activity signals that reflect gameplay, not operational timestamps.
2. Separate currently reliable metrics from partially supported or misleading ones.
3. Keep randoms activity and ranked participation as separate but adjacent activity dimensions.
4. Do not treat clan battle participation as a player-level metric until player-level clan battle data exists.

## Current-State Data Inventory

### Reliable Now

| Signal | Source | Grain | Notes |
| --- | --- | --- | --- |
| `last_battle_date` | player profile refresh | player-level | Strong recency signal |
| `days_since_last_battle` | derived from `last_battle_date` | player-level | Good display metric, not a full activity score |
| `activity_json` | snapshot-derived interval series | daily, rolling recent window | Best current time-series activity source |
| `pvp_battles`, `pvp_wins`, `pvp_losses`, `pvp_ratio` | player profile refresh | player-level cumulative | Good context, not time-series |

### Available and Operational

| Signal | Source | Grain | Notes |
| --- | --- | --- | --- |
| `randoms_json` | ship-level random battle aggregation | per ship | Useful for composition and intensity context, not direct time-series activity |
| `ranked_json` | ranked season aggregation | per season | Live in player detail as executive table for seasons, highest league, sprints, wins, and WR |

### Not Suitable as Player Activity Metrics

| Signal | Why Exclude |
| --- | --- |
| `last_lookup` | Measures profile views, not gameplay |
| `last_fetch` | Measures refresh freshness, not gameplay |
| clan battle season summaries | Currently aggregated at clan level across roster, not stored as direct player activity history |

## Cross-Agent Input

### Project Coordinator

- Treat activity measurement as a cross-functional data product, not a UI-only change.
- Require Architect, Engineer, QA, and Safety review before shipping changes to user-visible activity metrics.
- Revisit this runbook at each phase boundary rather than letting assumptions drift.

### Project Manager

- User value comes from clarity and trust, not metric volume.
- The MVP should answer: how recently has this player played, and how active have they been in the recent window?
- Do not collapse all modes into one score until the supporting data is mature enough.

### Architect

- Use `activity_json` and the underlying snapshot model as the current activity backbone.
- Keep gameplay activity separate from operational freshness metadata.
- Treat player-level clan battle activity as a future schema problem, not a present UI shortcut.

### UX

- Users should always understand what each activity metric means and over what time window it applies.
- Empty, stale, and unavailable states must be explicit and non-alarming.
- Avoid presenting a single opaque "activity score" before the ingredients are stable.

### Designer

- Keep activity presentation compact, consistent, and legible.
- Use subdued visual treatment for supporting metrics and stronger hierarchy for recency.
- Introduce additional mode cards only when the data supports them cleanly.

### Engineer (Web Dev)

- Define an explicit activity-metrics contract in the UI layer instead of inferring it ad hoc from multiple endpoints.
- Backfill missing daily dates in recent activity windows with zeros before visualization.
- Keep ranked and randoms adjacent in UI and API contracts; do not blend into a single score without explicit PM signoff.

### QA

- Validate both correctness and interpretation risk.
- Check active, inactive, sparse, stale, and missing-data player profiles.
- Treat browser-console cleanliness and fallback behavior as required checks.

### Safety

- Never display internal fetch or cache timestamps as player activity.
- Do not surface raw backend errors in user-facing activity copy.
- Avoid confidence beyond the dataset: partial data must yield partial claims.

## Measurement Framework

### What Should Count Now

These are the metrics that can be used immediately with current confidence.

| Metric | Definition | Why It Counts Now | Caveat |
| --- | --- | --- | --- |
| Last Battle Recency | `days_since_last_battle` and `last_battle_date` | Clear, player-level, directly meaningful | Recency is not the same as sustained engagement |
| Recent Battle Volume | sum of `activity_json.battles` over recent window | Best available measure of near-term engagement | PvP/random-battle oriented only |
| Recent Active Days | count of days in `activity_json` where `battles > 0` | Distinguishes burst activity from steady cadence | Sensitive to short windows |
| Recent Win Volume | sum of `activity_json.wins` | Useful paired with volume in trend displays | Not sufficient alone as an activity metric |
| Recent Trend Direction | compare most recent segment to previous segment of `activity_json` | Supports up/stable/down activity messaging | Should be described as directional, not predictive |

### What Should Be Excluded Now

| Candidate | Why It Should Not Count Yet |
| --- | --- |
| `last_lookup` as engagement | It measures viewer behavior, not player behavior |
| `last_fetch` as activity | It measures system refresh timing, not gameplay |
| one blended activity score across randoms, ranked, and clan battles | Current data has inconsistent grain and coverage across those modes |
| clan battle participation as player activity | The existing clan battle summaries are roster-level, not player-level historical activity |
| win rate volatility over time | The current randoms/time-series model is not mode-complete enough for that to be trustworthy |

### What Should Be Deferred

| Deferred Metric Area | Why Defer | Trigger to Revisit |
| --- | --- | --- |
| Ranked engagement scoring | Ranked participation is now visible, but blended scoring can still mislead | PM-approved weighting model for randoms vs ranked exists |
| Cross-mode activity composition | Requires a clear and user-facing definition of what belongs in the numerator and denominator | Ranked activity is visible and validated |
| Player-level clan battle activity | Requires player-level data storage or endpoint support | Dedicated player-level clan battle model or API exists |
| Predictive activity health or churn model | Needs more stable longitudinal inputs and cohort validation | Broader historical dataset and analysis pass exist |

## Recommended Activity Model

### Phase 0: Current Definition

For now, "player activity" should mean:

1. **Recency:** when the player last fought a battle.
2. **Cadence:** how many recent days included battle activity.
3. **Volume:** how many battles occurred in the recent rolling window.
4. **Momentum:** whether the recent segment is busier, flatter, or quieter than the prior segment.

This phase should not pretend to represent the full WoWs competitive footprint. It is a recent-play model, not a universal activity index.

### Phase 1: Ranked Operational Baseline

Ranked is now a distinct adjacent activity dimension and should remain separate from randoms scoring.

Operational ranked metrics:

1. Ranked seasons participated (latest seasons surfaced).
2. Highest league achieved per season.
3. Sprints played per season.
4. Wins per season.
5. Win rate per season.

Do not merge ranked into a single overall activity score until the product team agrees on weighting and interpretation language.

### Phase 2: If Player-Level Clan Battle Data Exists

Only once player-level clan battle participation is available should the framework expand to:

1. Clan battle participation volume.
2. Clan battle recency.
3. Cross-mode activity composition.
4. A broader engagement model spanning randoms, ranked, and clan battles.

## Candidate Metrics Backlog

### Ship Now

| Metric | Calculation Direction | Rationale |
| --- | --- | --- |
| `days_since_last_battle` | derived from `last_battle_date` | Most intuitive recency measure |
| `battles_last_29_days` | sum of daily activity battles | Core recent volume measure |
| `active_days_last_29_days` | count of daily rows with non-zero battles | Measures cadence, not just burst total |
| `wins_last_29_days` | sum of daily wins | Useful supporting context paired with volume |
| `activity_trend_direction` | compare recent slice to prior slice | Good for concise up/stable/down messaging |

### Add Now (Ranked Live)

| Metric | Source | Rationale |
| --- | --- | --- |
| `ranked_seasons_participated` | `ranked_json` | Distinguishes competitive participation from casual recency |
| `ranked_sprints_played_latest` | latest ranked season summary | Indicates season engagement depth |
| `ranked_wins_latest` | latest ranked season summary | Simple executive outcome signal |
| `ranked_wr_latest` | latest ranked season summary | Comparable efficiency indicator |
| `highest_ranked_league_recent` | `ranked_json` | Useful competitive-intensity summary |

### Defer Until Player-Level Clan Battle Data Exists

| Metric | Why Deferred |
| --- | --- |
| `clan_battle_sessions_recent` | no direct player-level recent clan battle history yet |
| `clan_battle_participation_rate` | no player-level attendance baseline |
| `cross_mode_activity_share` | mode-level inputs are incomplete and inconsistent today |

## Phased Plan

### Now

Goal: define and validate recent activity measurement without mode overreach.

1. Treat `last_battle_date` and `activity_json` as the current source of truth for activity.
2. Design the player activity view/model around recency, cadence, volume, and momentum.
3. Keep ranked and randoms separate in interpretation; keep clan battles out of composite scoring.
4. Use this runbook as the decision baseline for upcoming implementation.

### Next Revision: Composite Model Decision

Goal: decide whether a blended activity model is justified.

1. Evaluate user understanding of separate randoms and ranked signals.
2. Define weighting options and error bars for a potential composite.
3. Decline composite launch if interpretation risk remains high.

### Later, If Player-Level Clan Battle Data Becomes Available

Goal: add a third trustworthy mode rather than guessing from clan-level summaries.

1. Confirm the data model supports player-level clan battle recency and volume.
2. Add clan battle measurement rules to this runbook.
3. Reassess whether a cross-mode activity model is now justified.

## Execution Checklist

- [ ] Confirm current activity metric definitions with PM and Architect.
- [ ] Keep operational timestamps excluded from user-facing activity.
- [ ] Validate empty and stale states for recent activity surfaces.
- [ ] Validate ranked table semantics with PM, UX, and QA.
- [ ] Confirm ranked freshness language remains user-comprehensible.
- [ ] Update this runbook again before any player-level clan battle activity is surfaced.

## Update Triggers

Revisit this runbook when any of the following happens:

1. Ranked schema or UI contract changes.
2. A new player-level competitive activity endpoint is introduced.
3. Clan battle activity becomes available at player grain.
4. The product direction changes from descriptive activity to predictive modeling.

## Definition of Done

This runbook is ready for later execution when:

1. The team agrees on the current definition of player activity.
2. The framework clearly distinguishes current metrics, deferred metrics, and excluded metrics.
3. Ranked integration is explicitly represented in current-state measurement and backlog.
4. No metric in this runbook overclaims what the current dataset can support.
