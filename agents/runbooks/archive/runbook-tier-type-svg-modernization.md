# Runbook: Tier and Type SVG Modernization

## Goal

Bring the older `TierSVG` and `TypeSVG` player-detail charts up to the visual and interaction standard established by the newer `RandomsSVG` chart while keeping their data model and general bar-chart purpose intact.

## Problem Statement

- `TierSVG` and `TypeSVG` still use the older D3 treatment: flat gray backbars, minimal detail handling, older axis styling, and standalone rotated y-axis title labels.
- `RandomsSVG` establishes the newer visual language for player-detail charts and now reads as the design reference.
- The tier and type charts currently feel visually disconnected from the surrounding player page, and their plotting area does not line up cleanly with the randoms chart above.

## Design Reference

Use `client/app/components/RandomsSVG.tsx` design 1 as the canonical reference unless there is a clear, documented reason to diverge.

### Reference Elements to Preserve

- Muted slate axis treatment:
  - axis/tick color: `#64748b`
  - y-label color: `#475569`
  - axis domain stroke: `#cbd5e1`
- Background grid treatment:
  - vertical grid lines: `#e2e8f0`
  - subtle, low-contrast support role only
- Bar system:
  - battle-volume backbar fill: `#dbe4f0`
  - wins bar outline: `#334155`
  - wins fill: WR color ramp already used across charts
  - rounded corners: `rx 3`
- Typographic hierarchy:
  - category labels at `10px`, weight `500`
  - numeric labels and axis copy at `10px`
  - detail header in strong blue `#084594`
  - detail metadata in slate `#475569`
  - separators in `#94a3b8`
- Layout rhythm:
  - keep the plotting area feeling open and horizontally balanced
  - avoid heavy framing, dense borders, or dark scaffolding

## Required Changes

1. Update `client/app/components/TierSVG.tsx` to match the modern chart styling.
2. Update `client/app/components/TypeSVG.tsx` to match the same styling system.
3. Remove the rotated y-axis title labels from both charts.
   - Remove only the axis-title text such as `Ship Tier` and `Ship Type`.
   - Keep the category tick labels (`11`, `10`, `Battleship`, `Cruiser`, etc.) unless a later UX decision explicitly changes them.
4. Align the chart canvas y-axis position with the randoms chart above.
   - Treat the randoms chart left plotting edge as the source of truth.
   - The visible y-axis line and start of the plotting area should line up vertically with the randoms chart plotting area when stacked on the player page.
5. Give both charts a "nice treatment" rather than a mechanical restyle.
   - This means the detail state, spacing, axes, bars, and labels should feel intentionally designed, not merely color-swapped.

## Visual Direction

### What "Nice Treatment" Means Here

- Keep the two-layer bar model because it communicates `battles` versus `wins` clearly.
- Make the charts feel like siblings of `RandomsSVG`, not isolated legacy components.
- Prefer restrained polish:
  - cleaner gridlines
  - better spacing and label balance
  - consistent axis styling
  - consistent detail summary placement
  - smoother hover treatment without novelty animation
- Avoid introducing a separate visual language for tier and type.

### Color Notes

Continue using the existing WR ramp already shared by these charts:

- `> 65%`: `#810c9e`
- `>= 60%`: `#D042F3`
- `>= 56%`: `#3182bd`
- `>= 54%`: `#74c476`
- `>= 52%`: `#a1d99b`
- `>= 50%`: `#fed976`
- `>= 45%`: `#fd8d3c`
- `>= 40%`: `#e6550d`
- else: `#a50f15`

Do not invent a second palette for these charts.

## Layout and Alignment Requirements

### Y-Axis Alignment

- Align the chart drawing area with `RandomsSVG` design 1.
- The left margin should be reconsidered for both charts so the y-axis baseline lands in the same horizontal position as the randoms chart plotting baseline.
- Current state is inconsistent:
  - `RandomsSVG` left margin: `68`
  - `TierSVG` left margin: `70`
  - `TypeSVG` left margin: `96`
- The type chart is the larger offender and must be corrected.

### Canvas Consistency

- Rebalance total width, plot width, and left label space so the alignment fix does not cause cramped labels.
- If necessary, increase total SVG width rather than preserving a cramped legacy width.
- The final result should prioritize visual alignment and readability over strict adherence to the old dimensions.

## Interaction Requirements

- Preserve hover details for each row.
- Modernize the detail presentation to feel closer to `RandomsSVG`:
  - concise top-right summary
  - stronger hierarchy for primary datum
  - supporting text in lower-contrast slate tones
- On hover, avoid jarring color replacement that breaks the win-rate meaning.
  - Prefer subtle opacity or brightness adjustments over changing the semantic fill to an unrelated color.

## Suggested Implementation Approach

1. Audit `RandomsSVG` design 1 for reusable constants and styles.
2. Normalize chart scaffolding across the three bar charts:
   - margins
   - axis styling
   - gridline styling
   - label typography
   - detail summary positioning
3. Refactor `TierSVG` and `TypeSVG` toward the same structure used in `RandomsSVG` where practical.
4. Remove the rotated y-axis title text nodes.
5. Adjust left margin and overall SVG width until the y-axis aligns visually with the randoms chart.
6. Validate stacked layout on the player page, not just isolated SVG output.

## File Targets

- `client/app/components/TierSVG.tsx`
- `client/app/components/TypeSVG.tsx`
- Optional shared helper extraction if it reduces duplication without overcomplicating the change:
  - only do this if the result is simpler and clearly maintainable

## Acceptance Criteria

- `TierSVG` and `TypeSVG` visibly match the modern chart language established by `RandomsSVG`.
- Rotated y-axis title labels are removed from both charts.
- Category tick labels remain readable.
- The plotted y-axis baseline aligns with the randoms chart above on the player-detail page.
- Hover details read cleanly and retain win-rate semantics.
- No new frontend type errors are introduced.
- The updated charts still render correctly on normal desktop widths and narrow viewport player-detail layouts.

## Validation

1. Build frontend:
   - `cd client && npm run build`
2. Manual UI check on player detail pages with populated data.
3. Compare three sections in sequence:
   - `Top Ships (Random Battles)`
   - `Performance by Tier`
   - `Performance by Ship Type`
4. Confirm:
   - y-axis alignment
   - matching axis/grid treatment
   - removed rotated y-axis title labels
   - preserved readability of category labels

## Risks

- Over-correcting margins can clip long ship-type labels.
- Reusing randoms spacing without adjustment may compress tier/type content excessively.
- Hover restyling can accidentally hide win-rate color meaning.

## Non-Goals

- Do not redesign the data model or API shape for tier/type data.
- Do not convert these charts to a different chart family.
- Do not bundle unrelated player-detail redesign work into this pass.

## Handoff Notes

- PM should sequence this as a narrow player-detail polish tranche.
- UX should confirm that removing the rotated y-axis title does not reduce comprehension.
- Engineer should validate alignment on the actual stacked page, not only by matching code constants.
- QA should treat visual alignment and semantic hover behavior as first-class acceptance checks.
