// A one-value channel carrying "the ranked season the pointer is on" between
// the two ranked-tab charts: the season lattice publishes, the season scatter
// above it subscribes and pulses the matching point.
//
// Deliberately NOT React state lifted into PlayerDetailInsightsTabs. That
// component owns the whole tab; a state change on every hover would re-render
// the entire panel — including the battle-history card — many times as the
// pointer crosses a row of 30 boxes. This channel keeps the interaction between
// the two charts that care, and lets the scatter animate its existing SVG
// without a React redraw (a redraw would restart the pulse on every frame).
//
// Module-scope singleton: only one player page is mounted at a time, and both
// charts reset the value when they unmount, so a highlight cannot outlive the
// page that set it.

type SeasonHighlightListener = (seasonId: number | null) => void;

const listeners = new Set<SeasonHighlightListener>();
let highlightedSeasonId: number | null = null;

export const setHighlightedSeason = (seasonId: number | null): void => {
    if (highlightedSeasonId === seasonId) return;
    highlightedSeasonId = seasonId;
    listeners.forEach((listener) => listener(seasonId));
};

export const getHighlightedSeason = (): number | null => highlightedSeasonId;

// Subscribing replays the current value, so a chart that mounts or redraws
// mid-hover picks up the highlight already in flight.
export const subscribeHighlightedSeason = (listener: SeasonHighlightListener): (() => void) => {
    listeners.add(listener);
    listener(highlightedSeasonId);
    return () => {
        listeners.delete(listener);
    };
};
