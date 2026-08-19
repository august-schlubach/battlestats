# Runbook — Player-page charts and the clan activity roster (2026-08-15)

_Created: 2026-08-15_
_Context: extracted verbatim-in-substance from `CLAUDE.md`'s "Key frontend patterns" block during the 2026-08-15 doc-estate pass. This material had no owning document — it was ~700 words of always-loaded context describing component behavior, and the only nearby docs (`runbook-mobile-player-detail-charts.md`, `archive/runbook-tier-type-correlation-rework-2026-07-01.md`) describe components that no longer exist._
_Status: **descriptive, not a change plan.** Everything here is live behavior as of v5.3.9, plus the sticky window pill and the 30/60-day strip domain added 2026-08-19 (v5.4.0, v5.4.1)._

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

## BattleHistoryCard — the strip domain, the default, and the fallback (2026-08-19, v5.4.1)

**The strip shows 30 days on Day/Week/Month and 60 on the 60d pill.** It still
HOLDS all 60 at every setting: days outside the shown domain are positioned at a
negative x and clipped by the viewport, never unmounted. That is what makes the
change a glide in both directions — bars keep their DOM nodes (keyed by date) and
move under a CSS transition on `x`/`width` (SVG2 geometry properties, animatable
as CSS; see `.sparkline-bar-rise rect` in globals.css, 410ms to match the bracket
and the bar-rise). The WR polyline cannot transition — `points` is not an
animatable property — so it re-runs its left-to-right draw on a domain change,
which reads as redrawing over the new span rather than snapping.

Every scale is computed over the VISIBLE slice, not the held array: the bar cap
and the WR line's auto-range both use `days.slice(offset)`. Carrying the 60-day
maximum into the 30-day view would flatten it against a peak the reader can no
longer see. This is the reason the strip is re-rendered per domain rather than
pan-and-zoomed with one transform, which would have been cheaper to animate.

**The card opens on Month, not 60d.** `DEFAULT_BATTLE_HISTORY_WINDOW = 'month'`.
Two consequences worth knowing:

- **The strip no longer shares the default's URL.** It always fetches
  `STRIP_FETCH_WINDOW` (`sixty`) — the span the 60d pill animates out to, and the
  data the fallback reads. So a player page now issues TWO battle-history
  requests (month for the view, sixty for the strip) where it issued one. They
  cannot be collapsed: totals and `by_ship` are aggregated server-side per
  window, so a 30d view is not derivable from a 60d payload. Against a request
  queue capped at 6, that is a real +1.
- **A player with nothing in 30 days is promoted to 60d** once the strip lands,
  and the narrower pills gray themselves through the usual empty-window rule.
  This is a DERIVATION, not a pick: it must never call `writeWindowPref`, or a
  returning player stays pinned to 60d long after Month becomes the better view.
  It defers to a stored pick and to any pill touched this session.

**Two ordering traps this arrangement creates**, both fixed and both regression-tested:

1. **Availability must be judged on the 60-day strip payload, not the selected
   window.** Reading it off the month payload reported "no activity" for a
   30d-empty player, the parent disabled the Activity tab, and the fallback never
   ran — the tab went dark for exactly the population the fallback serves. Found
   against a live player (`Almighty_Magoo` NA: 0 battles in 30d, 1 in 60d), not
   in tests.
2. **The standalone no-battles collapse is gated on `stripLoaded`.** Without it
   the card returns null on the empty month payload and then reappears when the
   fallback lands — a visible flash for the same population.

A consequence to expect rather than treat as a bug: the bracket dissolves
whenever the span equals the shown domain, so with a 30-day backdrop it is
visible only on Day and Week — at Month it now reads as full-width and
transparent, as it already did at 60d.

## BattleHistoryCard — the window pill is sticky (2026-08-19)

The Day / Week / Month / 60d pill row on the Activity tab is remembered in
`localStorage` under `battlestats:battle-history:window:<realm>:<player>:<mode>`
— the same `(realm, lowercased name, mode)` scope the treemap color metric uses,
and for the same reasons: a name is a different account on another realm, a link
differing only in case is the same account, and the page mounts this card twice
(Activity = random, Ranked = ranked) so one tab's pick must not move the other.

Three constraints shape the implementation, and each is load-bearing:

1. **The value is read in an effect, never in the `useState` initializer.**
   `localStorage` is client-only; reading it during the first render desyncs SSR
   from CSR. Same rule as the treemap pref.
2. **Both fetches are gated on the pref having resolved for the current scope**
   (`windowPrefScope !== prefScope` → return). Gating the main fetch is what
   stops a remembered Week from costing two round trips — one for the default,
   one for the correction. The strip fetch does not depend on the stored pick and
   is gated only to preserve fetch ORDER: the window the reader is waiting on
   must reach the priority queue before the constant backdrop.
3. **Only windows with a pill are honoured on read.** `year` is a valid
   `BattleHistoryWindow` the backend still accepts but no pill exposes; restoring
   it would strand the reader on a window they can neither see selected nor leave
   by clicking the pill they are on.

A restored pick counts as an explicit pick (`userPickedWindow`) **only when it
differs from the default** — otherwise remembering `60d` would defeat the
standalone card's no-battles collapse and surface empty cards.

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
