# Player Performance Over Time — Feature Specification

**Author:** Project Manager Agent  
**Date:** 2026-03-08  
**Status:** Draft for Cross-Functional Review  
**Scope:** Player detail experience in the Next.js client  
**Primary Surface:** Player detail right-column chart stack

---

## 1. Objective

**Core question this feature answers:** _"How has this player been performing over recent days, not just in aggregate?"_

The player page currently shows career totals, ship breakdowns, and distribution views by tier and type, but it does not expose a clear time-based view of recent results. Users can see what a player has done overall, but not whether they have been active recently or whether recent play is trending well.

This feature adds a **Performance Over Time** chart derived from the existing player activity series so a user can quickly understand:

1. How active the player has been in the recent rolling window.
2. How many of those recent battles were wins.
3. Whether recent results are clustered, sparse, improving, or flat.
4. How recent momentum complements the existing ship, tier, and type views.

---

## 2. PM Recommendation

**Recommended implementation path:** enhance and mount the existing `ActivitySVG` pattern rather than introducing a brand new backend contract or a second overlapping chart component.

Reasoning:

1. The current activity endpoint already returns the exact daily inputs needed: `date`, `battles`, and `wins`.
2. The existing chart pattern already encodes volume and wins over time, which is the appropriate low-risk first version of "performance over time" for this product.
3. Reusing the existing activity chart keeps scope tight and avoids duplicate D3 lifecycle code.
4. The player detail page already uses isolated chart sections, so the feature fits the current information architecture cleanly.
5. This is a strong MVP feature because it creates immediate user value without requiring new WG API dependencies.

---

## 3. Cross-Agent Input

### Project Coordinator

- Treat this as a chart/data-visualization change that should receive Architect, Engineer, QA, and Safety signoff.
- Keep the artifact explicit and routeable so the change does not become an informal frontend-only tweak.
- Favor a small vertical slice over a broader analytics expansion.

### Project Manager

- This is a low-risk, high-value gap fill on the player page.
- MVP should reuse existing infrastructure and avoid bundling unrelated analytics work.
- Acceptance criteria must focus on visible user outcomes and regression safety.

### Architect

- Prefer reusing the existing activity contract instead of adding a new API shape.
- Avoid creating another fragile D3 component that duplicates fetch/render logic.
- If the existing chart component is touched, prefer ref-scoped rendering over static DOM assumptions.

### UX

- The chart must communicate clear value immediately and never render as a blank unexplained region.
- Loading, empty, and error states must remain explicit and concise.
- The section title and helper copy should make clear that this is a recent-window trend view.

### Designer

- Reuse existing chart typography, muted axis labels, and restrained color treatment.
- Keep the visual hierarchy consistent with the current player page sections.
- Avoid introducing decorative effects or a second visual language for one chart.

### Engineer (Web Dev)

- The lowest-risk implementation is to mount the existing activity chart in `PlayerDetail` and only harden it where necessary.
- Any component edits should stay localized and avoid changing unrelated chart behavior.
- The feature should preserve the current D3 cleanup pattern and avoid new state duplication.

### QA

- Define a manual verification checklist because frontend automated coverage is limited.
- Verify not just render success but hover behavior, empty state behavior, and regression risk on adjacent player-detail sections.
- Treat browser console cleanliness as an explicit check.

### Safety

- Reuse existing neutral fallback language.
- Do not expose raw backend or internal fetch errors in the UI.
- No new sensitive data is introduced; risk is primarily around resilient failure behavior.

---

## 4. Product Scope

### In Scope

1. Add a **Performance Over Time** chart section to the player detail view.
2. Use the existing player activity data series as the source of truth.
3. Show recent daily total battles and wins in a time-based chart.
4. Preserve or improve current loading, empty, and error states.
5. Ensure the chart fits visually and structurally into the existing player page.

### Out of Scope

1. New WG API integrations.
2. A new backend endpoint or materially new activity data model.
3. Mode filters, ship-type filters, or tier-specific overlays.
4. Long-horizon historical analytics beyond the current recent activity window.
5. Predictive trend scoring, ratings, or player-comparison features.

---

## 5. User Experience Specification

### Placement

- Add the feature to the player detail right column after the current ship-type section.
- Use the same section rhythm already established by Top Ships, Performance by Tier, and Performance by Ship Type.
- Separate the section with the same border and spacing treatment used elsewhere in the chart stack.

### Section Title

- Primary title: `Performance Over Time`
- Helper copy: concise explanation that the chart shows recent daily battles and wins.
- Supporting legend copy should remain simple and stable, for example: `Gray = total battles, Green = wins`.

### Chart Behavior

- X-axis represents the recent rolling time window returned by the activity series.
- Y-axis represents number of battles.
- Gray bars represent total battles.
- Green bars represent wins layered within the same daily column.
- Hover reveals the exact date and recent results for that day.

### Empty and Error States

- If no recent activity exists, show a neutral message rather than an empty chart.
- If data fails to load, show a short, non-sensitive fallback message.
- Hidden-stat handling should remain unchanged; the chart must not appear for hidden players if the page already suppresses detailed stats.

---

## 6. Data and API Contract

### Existing Endpoint

`GET /api/fetch/activity_data/<player_id>/`

### Existing Response Shape

```json
[
  {
    "date": "2026-03-03",
    "battles": 3,
    "wins": 2
  }
]
```

### Backend Notes

1. The existing activity payload is derived from `Snapshot.interval_battles` and `Snapshot.interval_wins`.
2. The current backend refresh path and caching behavior are already sufficient for MVP.
3. No serializer or URL changes are required for the initial version.
4. The spec assumes the frontend continues to treat the activity series as the source of recent performance truth.

### Data Contract Guardrails

1. The frontend must tolerate an empty list.
2. The frontend must tolerate transient fetch failure.
3. The chart must not assume more fields than `date`, `battles`, and `wins`.
4. Any future contract expansion should remain backward compatible with the current flat row list.

---

## 7. Acceptance Criteria

### UX and Product

1. The player detail page includes a visible `Performance Over Time` section for non-hidden players.
2. The chart communicates recent daily results without requiring the user to interpret raw totals elsewhere on the page.
3. The section visually matches the existing chart stack and does not feel like a separate tool.

### Frontend Behavior

1. The chart renders using the selected player's `player_id`.
2. The chart appears in the intended order below the existing ship-type chart.
3. Hover details display complete, readable daily information.
4. Empty-state messaging appears when the activity series is empty or effectively empty.
5. Error-state messaging appears without crashing the page.
6. No new hydration warnings or runtime console errors are introduced by the feature.

### Technical and Quality

1. No backend API changes are required for MVP.
2. No TypeScript or editor errors are introduced in touched frontend files.
3. Existing player-detail sections continue to function after the chart is added.
4. The implementation does not duplicate an activity chart component with overlapping responsibilities.

---

## 8. Risks and Mitigations

| Risk                                                                                                 | Severity | Mitigation                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| The existing activity chart is mounted but not visually integrated well into the current page layout | Medium   | Treat placement, heading, helper copy, spacing, and border rhythm as part of the feature, not an afterthought |
| The chart component contains fragile D3 assumptions that become more visible once mounted            | Medium   | Keep the MVP focused, but harden any touched chart logic if required during implementation                    |
| Users interpret raw activity as a complete performance score                                         | Low      | Title the section clearly and explain the encoding in one line of helper copy                                 |
| Empty or sparse activity makes the section feel broken                                               | Low      | Keep the neutral empty-state copy visible and intentional                                                     |
| Frontend-only change regresses adjacent sections silently                                            | Medium   | Require a manual QA checklist covering the full player detail flow                                            |

---

## 9. Implementation Plan

### Phase 1: PM / Architecture Alignment

1. Confirm that MVP reuses the current activity endpoint and chart pattern.
2. Confirm that no new backend work is required for the first release.
3. Confirm final placement and naming on the player page.

### Phase 2: Frontend Delivery

1. Import the activity chart into the player detail screen.
2. Add the new section heading, helper text, and spacing treatment.
3. Mount the chart with the current player's id.
4. If necessary, make minimal hardening updates to the chart component so it behaves safely in its mounted context.

### Phase 3: Verification

1. Validate chart render with a player who has recent activity.
2. Validate empty-state behavior with a player who lacks recent activity.
3. Validate page behavior for hidden-stat players.
4. Validate hover readability and chart positioning in the browser.
5. Validate no regressions in surrounding player-detail components.

---

## 10. QA Checklist

1. Open a player with recent activity and confirm the chart renders.
2. Hover multiple days and confirm the detail text is readable and not clipped.
3. Open a player with no meaningful recent activity and confirm the fallback message appears.
4. Confirm the player detail page still renders Top Ships, Tier, Type, clan area, and back navigation correctly.
5. Confirm there are no new console errors on player-page load.
6. Confirm the page remains readable at common desktop and laptop widths.

---

## 11. Safety and Release Gate

1. User-facing error text must remain neutral and non-sensitive.
2. No backend internals or stack details may surface in the UI.
3. The feature should ship only after Architect, Engineer, QA, and Safety have reviewed the final implementation.
4. Release confidence for MVP is high if the implementation stays within the existing chart and endpoint boundaries.

---

## 12. Definition of Done

1. The spec is approved for routing.
2. The player page includes a recent performance-over-time chart backed by the activity series.
3. The feature meets acceptance criteria without changing the backend contract.
4. Manual QA checks pass.
5. Safety review confirms neutral fallback behavior.
