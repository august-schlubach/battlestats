# Runbook — Player-page charts and the clan activity roster (2026-08-15)

_Created: 2026-08-15_
_Context: extracted verbatim-in-substance from `CLAUDE.md`'s "Key frontend patterns" block during the 2026-08-15 doc-estate pass. This material had no owning document — it was ~700 words of always-loaded context describing component behavior, and the only nearby docs (`runbook-mobile-player-detail-charts.md`, `archive/runbook-tier-type-correlation-rework-2026-07-01.md`) describe components that no longer exist._
_Status: **descriptive, not a change plan.** Everything here is live behavior as of v5.3.9._

## Purpose

Read this before touching the Profile tab's tier figure, the Ships-tab drill-down,
or either clan roster surface. It records behavior that is easy to break by
accident because the mechanisms are non-obvious: a colour damping rule that
exists to prevent a lie, a fetch-ordering race that silently ate a user's
selection, and a roster split whose two blocks answer different questions.

Companions: `runbook-player-fetch-orchestration-2026-06-21.md` (the request layer
all of this fetches through), `runbook-clan-chart-activity-filter-2026-06-18.md`
(the activity-bucket taxonomy collapse, which is upstream of the roster's labels),
`runbook-icon-analysis.md` (the classification-icon inventory).

## TierTypeDietSVG — "Random Battles by Tier" (Profile tab)

Shipped 4.5.3. One bar per played tier x class, anchored to its class baseline.

- **Length = battles**, on one scale shared by every cell, so cells are
  comparable across the whole figure rather than per-row.
- **Fill = win rate** via `wrColorByRatio`, **damped toward a per-theme neutral
  by sqrt(n)** (`tierTypeDietModel.confidenceFromBattles`, full colour at 100
  battles). This is the load-bearing detail: without it a 2-battle 100% cell
  renders as vivid as a 500-battle 60% cell and poses as a strength. Do not
  "fix" the washed-out look of low-n cells — that is the feature.
- Class totals attach as a bottom margin. No legend: the section tooltip carries
  the encoding. Compact branch below 480px.

It **replaced three charts** — the tier x type population heatmap plus the
standalone "Performance by Ship Type" and "Performance by Tier" bar charts, which
were that heatmap's own margins replotted. `TierTypeHeatmapSVG`, `TierSVG`,
`TypeSVG` and `shipBarPlot` are deleted; do not restore them.

### Drill-down, and the nonce that keeps it alive

Clicking a bar opens the Ships tab pre-filtered to that tier x class; clicking a
class total opens it filtered to that class at every tier. Umami event
`player-tier-chart-drilldown`, `source: cell|class`.

**The request carries a nonce.** `RandomsSVG` reseeds its pills from the payload
on every fetch resolve (`ttlMs:0`, so every mount). Once the module cache made
`allShips` non-empty at mount, that reseed silently wiped a drill-down on any
return visit — the user clicked, the Ships tab opened, and the filter vanished.
A live drill-down now re-asserts itself in `applyResult`, and is released the
moment the user touches a pill. If you change the fetch or the cache TTL here,
re-test the *return* visit specifically; a first visit cannot reproduce it.

Class names differ across the two payloads (`Aircraft Carrier` vs `AirCarrier`)
and are matched by abbreviation via `resolveRandomsFilterRequest`.

### The payload is per-player only

Its population layers (`tiles`, `trend`, `tracked_population`) and the ~325 s/realm
`CROSS JOIN LATERAL` over every qualifying player's `battles_json` that built them
were **removed backend-side in 4.5.5** once nothing read them. With them went
`warm_player_tier_type_population_correlation`, the
`TIER_TYPE_POPULATION_REBUILD_HOURS` floor, and this metric's entry in
`warm_player_correlations`.

`/api/fetch/player_correlation/tier_type/<id>/` now computes inline from
`battles_json` and never warms. `X-Tier-Type-Pending` survives for the one
remaining case: a player whose battles were never fetched (`battles_json is None`,
which is **distinct from `[]`** — that distinction has caused a bug before).

## The other player-page figures

- **ActivitySVG** — activity over time.
- **RankedWRBattlesHeatmapSVG** / **ClanBattleWRBattlesHeatmapSVG** — population
  WR-vs-battles correlation heatmaps (metrics `ranked_wr_battles` /
  `clan_battle_wr_battles`). CB population and the player point come from
  `PlayerExplorerSummary.clan_battle_total_battles` /
  `clan_battle_overall_win_rate`. Both served warmed via `warm_player_correlations`
  (daily Beat).
- **RankedSeasonScatterSVG** — ranked-history per-season battles x WR scatter,
  with a league-award row under its x-axis plus `RankedLeagueLegend`.
- **`lib/seasonLattice`** — the ranked tab's *notional* season timeline: one box
  per season in the WG catalog (`GET /api/ranked_seasons/`, player- and
  realm-independent, read straight off `RankedSeason` with no WG call), filled on
  the WR scale where the player played and outline-only where they sat out,
  evenly spaced by season with year dividers wherever the calendar rolls over,
  and the shared league-award mark (`leagueAwardSymbol`: square-on-point = Silver,
  star = Gold+) above each earned box.
- **`lib/seasonTimeline`** — the clan-battle date-scaled season timeline.

## ClanActivityRoster — both clan surfaces

Since 2026-07-15 both roster surfaces render one shared component: the clan page
(`ClanDetail`) and the player page's `PlayerClanSection`. It replaced the removed
`ClanMembers` columns/stacked/inline layouts. Since 2026-07-18 there is **one
shared presentation** — the per-surface `phaseStyle` headers/split fork and the
per-phase paragraphs are gone.

The roster splits in two blocks:

1. **Active PvP** — members with random or ranked battles in the trailing 30d
   window (payload `is_active_pvp`, from `PlayerDailyShipStats`, window
   `CLAN_ACTIVE_PVP_WINDOW_DAYS`) **OR** a current-season CB shield.
   `is_clan_battle_player` rides along deliberately, so a this-season shield
   never sits under the idle rule.
2. An `<hr>`, then **everyone else** in one unlabeled alphabetical block. It is
   unlabeled on purpose: the scatterplot above carries finer recency on both
   surfaces, so a second set of phase labels would be duplicate encoding.

Each block is a fixed four-column grid (2 below `sm`). Each name leads with a
small SVG diamond on the shared WR colour scale (`pvp_ratio` through
`lib/wrColor`). Hidden accounts are named but not linked. Each name carries the
classification-badge tail; gone-dark members (181d+) additionally lead their tail
with the bed icon. Text sizing is `text-base` on the clan page and `text-sm` on
the player page's section, selected via `source`.

**Badge-dispatch logic** — which classification icons render, and in what order —
lives in `ClanActivityRoster.tsx` for rosters and is **inlined separately** in
`PlayerDetail.tsx` for the player-header tray. Two copies; changing one does not
change the other.

### ActivityIcon

A graded "rise-to-bed" recency icon keyed on `activity_bucket`. The backend still
classifies five ways (`_classify_clan_member_activity`, payload contract
unchanged) but the UI collapses to **three phases** via `collapseActivityBucket`
(`clanMembersShared.ts`):

| phase | buckets | mark |
|---|---|---|
| Active <=30d | `active_7d` + `active_30d` | sun |
| Cooling <=180d | `cooling_90d` + `dormant_180d` | half-moon |
| Gone dark 181d+ | — | bed |

Labels and colours mirror the clan-chart legend. The component accepts an
explicit `bucket` or derives one from `daysSinceLastBattle` (`activityBucketFromDays`,
same raw thresholds as the backend). It replaced the old `Nd idle` text plus
bed-only badge on the player-detail header.

## Classification icons

Each is a shared single-purpose component file imported across surfaces:
`HiddenAccountIcon`, `EfficiencyRankIcon`, `LeaderCrownIcon`, `PveEnjoyerIcon`,
`InactiveIcon`, `RankedPlayerIcon`, `ClanBattleShieldIcon`, `TopShipIcon`.
Inventory: `runbook-icon-analysis.md`.

Two facts that inventory does not carry:

- **`PveEnjoyerIcon` is hidden everywhere** (deprecation candidate, 2026-07-15)
  behind the `PVE_ENJOYER_ICON_ENABLED` kill switch exported from
  `PveEnjoyerIcon.tsx`. The component, the `is_pve_player` payload flag, and the
  backend classification all remain intact — flip the constant to restore it.
- **The shared top-ship medal tail** (`ship_badges` -> up to 3 `TopShipIcon`s) is
  factored into `TopShipBadges.tsx`.

`RankedPlayerIcon` and `ClanBattleShieldIcon` both carry **current-season
semantics** via server-computed flags. Ranked spec:
`agents/work-items/ranked-enjoyer-current-season-spec.md`. CB:
`runbook-cb-icon-current-season-2026-07-15.md` — the shield means "logged clan
battles in the current CB season", tinted by current-season WR, and the Clan
Battles tab opens on career 40/2 **OR** the same current-season criteria, so
shield wearers always get the tab.

`ShipTopPlayerBanner.tsx` renders the current T10 top-3 cards above Battle
History (rolling nightly window; the badge tracks the current board generation and
drops the moment the player is displaced), fed by `ship_badges`
(`data.get_player_ship_badges`), linking to `/ship/<id>`.

## Change checklist

- Touching the tier figure's colour: preserve the sqrt(n) damping, or state
  explicitly why a low-n cell should read as confident.
- Touching `RandomsSVG` fetch/cache: re-test a **return** visit for drill-down
  survival, not a first visit.
- Touching badge order: there are two dispatch sites, not one.
- Touching the roster split: `is_clan_battle_player` must keep overriding the
  idle rule, or current-season shield wearers fall below the fold.
