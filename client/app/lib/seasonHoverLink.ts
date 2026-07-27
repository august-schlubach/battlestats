import * as d3 from 'd3';

// Links a season TIMELINE to the season SCATTER above it: hovering a season
// down in the timeline pulses that same season's point up in the scatter, so
// the two views read as one record. Used by the ranked tab (lattice → scatter)
// and the clan-battles tab (timeline → scatter).
//
// Each tab gets its OWN channel — a hover on the clan-battles timeline must not
// disturb the ranked scatter, and season ids are not comparable across the two
// anyway.
//
// Deliberately NOT React state lifted into PlayerDetailInsightsTabs. That
// component owns the whole tab, so hover state there would re-render the entire
// panel — battle-history card included — repeatedly as the pointer crosses a
// row of boxes. It also lets a scatter animate its EXISTING svg: a React redraw
// would rebuild the circle every cycle and the pulse would never advance.
//
// Module-scope singletons: only one player page is mounted at a time, and every
// publisher clears its channel on unmount, so a highlight cannot outlive the
// page that set it.

type SeasonHighlightListener = (seasonId: number | null) => void;

export interface SeasonHighlightChannel {
    set: (seasonId: number | null) => void;
    get: () => number | null;
    // Subscribing replays the current value, so a chart that mounts or redraws
    // mid-hover picks up the highlight already in flight.
    subscribe: (listener: SeasonHighlightListener) => (() => void);
}

const createSeasonHighlightChannel = (): SeasonHighlightChannel => {
    const listeners = new Set<SeasonHighlightListener>();
    let highlighted: number | null = null;

    return {
        set: (seasonId) => {
            if (highlighted === seasonId) return;
            highlighted = seasonId;
            listeners.forEach((listener) => listener(seasonId));
        },
        get: () => highlighted,
        subscribe: (listener) => {
            listeners.add(listener);
            listener(highlighted);
            return () => { listeners.delete(listener); };
        },
    };
};

export const rankedSeasonHighlight = createSeasonHighlightChannel();
export const clanBattleSeasonHighlight = createSeasonHighlightChannel();

// Resting point radius, shared by both scatters (their dots already matched).
export const SEASON_POINT_R = 5;
const PULSE_MAX_R = SEASON_POINT_R * 2.1;
// Half a pulse cycle. One speed for both tabs — a hover on either reads the
// same. Slowed 30% from the original 420ms (420 / 0.7) so the pulse is easier
// to follow.
export const SEASON_PULSE_HALF_CYCLE_MS = 600;

// Pulse the point for `seasonId` inside `container` until the returned stop() is
// called. stop() cancels the in-flight transition and restores the resting
// radius and stroke, so a fast pointer sweep across a row of seasons cannot
// leave a point inflated.
export const startSeasonPulse = (
    container: HTMLDivElement,
    seasonId: number,
    restingStroke: string,
    highlightStroke: string,
): (() => void) => {
    const point = d3.select(container).select(`circle[data-season-id="${seasonId}"]`);
    if (point.empty()) return () => {};

    let stopped = false;
    point.raise().attr('stroke', highlightStroke).attr('stroke-width', 2);

    const grow = () => {
        if (stopped) return;
        point.transition().duration(SEASON_PULSE_HALF_CYCLE_MS).attr('r', PULSE_MAX_R)
            .transition().duration(SEASON_PULSE_HALF_CYCLE_MS).attr('r', SEASON_POINT_R)
            .on('end', grow);
    };
    grow();

    return () => {
        stopped = true;
        point.interrupt().attr('r', SEASON_POINT_R)
            .attr('stroke', restingStroke).attr('stroke-width', 1.5);
    };
};
