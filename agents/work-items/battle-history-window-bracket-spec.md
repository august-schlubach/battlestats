# Battle-history window bracket + 45d default — spec

- **Date:** 2026-07-30
- **Surface:** Player page → Activity tab → `BattleHistoryCard`
- **Branch:** `feat/player-sparkline`
- **Status:** approved, pending implementation

## Problem

The battle-history sparkline is a trend strip whose date domain silently changes
shape depending on the selected window pill: 30 days for Day/Week/Month, 45 days
for the `45d` pill. Toggling across that boundary reflows every bar, so the strip
reads as a different chart rather than the same chart re-scoped. Nothing in the
strip indicates which slice of it the pills, tiles, treemaps, and table below are
actually reporting on.

Separately, `45d` — the widest window the retention raise made available — is not
the default, so the deepest view the data supports is only reached by an explicit
click.

## Design

### 1. `45d` becomes the default window

`BattleHistoryCard` opens on `fortyfive` instead of `month`.

Two call sites key off the old default and must follow it:

- The standalone-hide guard (`!hasBattles && window === 'month' && !userPickedWindow`).
  Left on `'month'` it can never fire again, because `window` now starts as
  `'fortyfive'`.
- `isWindowEmpty`, which currently returns `false` for `fortyfive`. With the strip
  data 45 days deep, the `fortyfive` pill's emptiness becomes derivable like
  week/month.

**Accepted behavior change:** the standalone card now hides only when a player has
no battles in 45 days, where before it was 30. It therefore appears for a slightly
larger set of players. This is intended.

### 2. The strip domain is pinned at 45 days for every window

`WINDOW_SPARKLINE_DAYS` is replaced by a single `STRIP_DOMAIN_DAYS = 45`. The
`sparklineWindow` fork (`window === 'fortyfive' ? window : 'month'`) is deleted;
the strip fetch always requests `fortyfive`.

At the default window this is the same URL and cache key as the main window fetch,
so `fetchSharedJson` collapses the two into a single request — the same dedup that
already holds for `month` today.

The bars, the lifetime-WR reconstruction, and both entrance animations are
untouched: they take `days` generically. Bars become narrower (45 across the same
width) and, critically, **never reflow between pills**.

`monthByDay` / `monthDays` / `monthLifetime` / `monthLoaded` now carry 45-day data
and are renamed `stripByDay` / `stripDays` / `stripLifetime` / `stripLoaded`. The
rename is confined to `BattleHistoryCard.tsx`; the existing names would otherwise
assert something false. `sumTrailingBattles` reads off the 45-day array — trailing
slices for 7 and 30 are unchanged, and 45 becomes available.

### 3. The window range bracket

A new `WindowRangeBracket` renders directly beneath `InlineSparkline` in its own
`<svg viewBox="0 0 100 7" preserveAspectRatio="none" width="100%">`. Sharing the
chart's 0–100 x domain and its non-uniform stretch makes the bracket ends land
exactly on bar edges at any container width. It is `aria-hidden`: the card header
already announces the window in words ("Last 7 days").

**Geometry.** The bracket is drawn once as a unit — a horizontal rule with a short
vertical tick at each end, spanning x=0→100 — and then placed by one group
transform:

```
left      = (STRIP_DOMAIN_DAYS − spanDays) × (barW + gap)   // exact bar-edge math
transform = translate(left, 0) scale((100 − left) / 100, 1)
```

The right edge stays pinned at x=100 — the newest day — so the bracket grows
leftward into the past, matching the trailing-window semantics of every pill. The
rule and both ticks carry `vectorEffect="non-scaling-stroke"` so neither the
`scaleX` nor the viewBox stretch fattens them.

Spans per pill: `day` 1, `week` 7, `month` 30, `fortyfive` 45.

**Motion.** A single CSS class transitions `transform` and `opacity` on one shared
curve (~420ms ease-out, matching the existing 410ms `sparkline-bar-rise`). Opacity
is 1 below 45 days and 0 at 45. Because both properties ride the same curve:

- `month → 45d`: the bracket expands to full domain width as it dissolves — it
  disappears precisely as it becomes redundant.
- `45d → month`: the exact reverse. It fades in at full width and contracts to 30.

A `prefers-reduced-motion` block drops the transition to `none`, matching the two
existing sparkline keyframes in `globals.css`.

**Color.** `var(--text-muted)` at reduced opacity. The bracket is chrome, not data;
it must not compete with the WR overlay line's `--accent-secondary-mid`.

At the new `45d` default the bracket is absent on first paint. It materializes only
when the user narrows — the affordance appears at the moment it carries meaning.

### 4. Ships treemap default scope

`DEFAULT_TOP_N` in `BattleHistoryTreemaps.tsx` drops 25 → 15 (the Activity-tab ships
map: tiles sized by battles, colored by win rate). The slider range and the clamp
against `playedShipCount` are unchanged, as is the non-persistence of the choice.

## Test plan

**`BattleHistoryCard.test.tsx`**

- The explicit `initial fetch uses window=month (default)` test, plus the comments
  and active-pill assertions that assume Month is the default, move to `45d`.
- New: bracket span per pill (assert the group transform), right-anchoring, and the
  full-width zero-opacity state at `45d`.
- New: the `fortyfive` pill dims when the trailing 45 days are empty.
- Existing dedup helper keys on the fetch `label`, not the URL, so it survives the
  main and strip fetches sharing a URL.

**`BattleHistoryTreemaps.test.tsx`** — default tile count 25 → 15.

## Docs to reconcile

- `CLAUDE.md:137` states "default stays Month" for the Activity-tab window pills.

## Out of scope

- The `year` window and `VISIBLE_WINDOWS` membership.
- Backend windows, retention, or the daily aggregate layer.
- Any change to the bars, the WR overlay, or their entrance animations.
