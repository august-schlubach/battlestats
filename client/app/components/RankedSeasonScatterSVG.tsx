import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { chartColors, drawSvgMessage, resolveContainerChartWidth, type ChartTheme } from '../lib/chartTheme';
import { LEAGUE_AWARD_MIN_ORDER, leagueAwardSymbol, leagueOrderFrom } from '../lib/rankedLeagueGlyph';
import wrColor from '../lib/wrColor';
import { setHighlightedSeason, subscribeHighlightedSeason } from '../lib/rankedSeasonHighlight';
import { PLAYER_ROUTE_PANEL_FETCH_TTL_MS } from '../lib/playerRouteFetch';
import { fetchSharedJson, isAbortError } from '../lib/sharedJsonFetch';
import { degradationMonitor } from '../lib/degradationMonitor';
import { usePlayerRequestSignal } from '../context/PlayerRequestScopeContext';
import { useRealm } from '../context/RealmContext';
import { withRealm } from '../lib/realmParams';

// One ranked season, trimmed to the fields the scatter plots. Mirrors the
// RankedSeasons table's payload (same /api/fetch/ranked_data endpoint).
interface RankedSeasonPoint {
    season_id: number;
    season_label: string;
    total_battles: number;
    win_rate: number; // 0..1 fraction
    highest_league?: number;
    highest_league_name?: string;
    start_date?: string | null;
}

// First 4-digit run in the season's start date (ISO "YYYY-…" or similar).
const seasonYear = (startDate?: string | null): string | null => {
    const match = /(\d{4})/.exec(startDate ?? '');
    return match ? match[1] : null;
};

// League ordinal (0 Bronze/unknown, 2 Silver, 3+ Gold and above). Silver+ get a
// drop-line + medal icon at the axis.
const leagueOrder = (season: RankedSeasonPoint): number => leagueOrderFrom(season.highest_league_name, season.highest_league);

interface RankedSeasonScatterSVGProps {
    playerId: number;
    isLoading?: boolean;
    // 600 matches the heatmap default; the real width is the container's, so the
    // scatter and heatmap resolve to the SAME width and compact breakpoint.
    svgWidth?: number;
    svgHeight?: number;
    theme?: ChartTheme;
}

const RANKED_FETCH_RETRY_DELAY_MS = 350;
const RANKED_PENDING_RETRY_DELAY_MS = 1500;
const RANKED_PENDING_RETRY_LIMIT = 12;

const delay = (timeoutMs: number): Promise<void> => new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
});

// y-domain: pad the observed WR range out to 5-point gridlines, clamp to
// [0,100], and hold a minimum 15-point span so a single season (or two nearly
// equal ones) doesn't get its spread stretched across the whole height.
const winRateDomain = (wrValues: number[]): [number, number] => {
    const minWR = Math.min(...wrValues);
    const maxWR = Math.max(...wrValues);
    let lo = Math.max(0, Math.floor((minWR - 4) / 5) * 5);
    let hi = Math.min(100, Math.ceil((maxWR + 4) / 5) * 5);
    if (hi - lo < 15) {
        const mid = (lo + hi) / 2;
        lo = Math.max(0, Math.floor((mid - 7.5) / 5) * 5);
        hi = Math.min(100, lo + 15);
        if (hi - lo < 15) lo = Math.max(0, hi - 15);
    }
    return [lo, hi];
};

// Base point radius, shared by drawChart and the lattice-hover pulse below.
const SCATTER_POINT_R = 5;
const PULSE_MAX_R = SCATTER_POINT_R * 2.1;
const PULSE_HALF_CYCLE_MS = 420;

// Pulse the point for `seasonId` until told otherwise. Driven by hover on the
// season lattice below the scatter, so the two views read as one record: the
// box under the pointer and its point up here move together.
//
// Animates the EXISTING svg rather than re-rendering: a React redraw would
// rebuild the circle every cycle and the animation would never advance. The
// returned stop() cancels the in-flight transition and restores the resting
// radius, so a fast pointer sweep across the row can't leave a point inflated.
const startSeasonPulse = (
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
        point.transition().duration(PULSE_HALF_CYCLE_MS).attr('r', PULSE_MAX_R)
            .transition().duration(PULSE_HALF_CYCLE_MS).attr('r', SCATTER_POINT_R)
            .on('end', grow);
    };
    grow();

    return () => {
        stopped = true;
        point.interrupt().attr('r', SCATTER_POINT_R)
            .attr('stroke', restingStroke).attr('stroke-width', 1.5);
    };
};

const drawChart = (
    container: HTMLDivElement,
    seasons: RankedSeasonPoint[],
    svgWidth: number,
    svgHeight: number,
    theme: ChartTheme,
    emptyMessage: string,
): void => {
    const colors = chartColors[theme];
    const plot = seasons.filter((season) => (season.total_battles || 0) > 0);

    d3.select(container).selectAll('*').remove();
    if (plot.length === 0) {
        drawSvgMessage(container, emptyMessage, { width: svgWidth, height: 120, color: colors.labelMuted });
        return;
    }

    // margin.left MUST match the heatmap (52 / 38) so the two y-axes line up;
    // right also matches so the plots share a right edge. compact uses the same
    // svgWidth < 480 threshold the heatmap uses.
    const compact = svgWidth < 480;
    // Bottom room is sized for the award row: the Silver/Gold+ marks get their
    // own band under the x-axis, clear of both the axis line and the tick
    // labels, with the axis title below that.
    const margin = compact
        ? { top: 16, right: 8, bottom: 60, left: 38 }
        : { top: 20, right: 18, bottom: 70, left: 52 };
    const axisFontSize = compact ? '9px' : '10px';
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    const svgRoot = d3.select(container).append('svg')
        .attr('width', svgWidth)
        .attr('height', svgHeight);
    const svg = svgRoot.append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    const battlesVals = plot.map((season) => season.total_battles);
    const wrVals = plot.map((season) => season.win_rate * 100);
    const maxBattles = Math.max(...battlesVals);

    // x = battles, linear from 0 so the axis reads honestly; pad the top so the
    // busiest season's dot doesn't sit on the right edge.
    const x = d3.scaleLinear()
        .domain([0, Math.max(maxBattles * 1.08, maxBattles + 1)])
        .range([0, width]);
    const [yLo, yHi] = winRateDomain(wrVals);
    const y = d3.scaleLinear().domain([yLo, yHi]).range([height, 0]);

    // Gridlines (y) for reading WR bands.
    svg.append('g')
        .selectAll('line')
        .data(y.ticks(compact ? 3 : 5))
        .enter()
        .append('line')
        .attr('x1', 0).attr('x2', width)
        .attr('y1', (tick: number) => y(tick)).attr('y2', (tick: number) => y(tick))
        .attr('stroke', colors.gridLine)
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.35);

    // Axes.
    svg.append('g')
        .style('color', colors.labelText)
        .attr('transform', `translate(0, ${height})`)
        .call(d3.axisBottom(x).ticks(compact ? 3 : 5, '~s').tickSizeOuter(0).tickPadding(compact ? 26 : 30))
        .selectAll('text')
        .style('font-size', axisFontSize);
    svg.append('g')
        .style('color', colors.labelText)
        .call(d3.axisLeft(y).ticks(compact ? 3 : 5).tickSizeOuter(0).tickFormat((tick: number) => `${tick}%`))
        .selectAll('text')
        .style('font-size', axisFontSize);

    // Axis titles.
    svg.append('text')
        .attr('x', width / 2).attr('y', height + (compact ? 52 : 60))
        .attr('text-anchor', 'middle')
        .style('font-size', axisFontSize)
        .style('fill', colors.labelMuted)
        .text('Ranked Battles');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2).attr('y', compact ? -28 : -40)
        .attr('text-anchor', 'middle')
        .style('font-size', axisFontSize)
        .style('fill', colors.labelMuted)
        .text('Win Rate');

    // Hover detail sits in the top margin, right-aligned with the plot's right
    // edge, so it never collides with the points.
    const detail = svg.append('g')
        .attr('class', 'hover-detail')
        .attr('transform', `translate(${width}, ${compact ? -14 : -16})`)
        .style('opacity', 0)
        .style('pointer-events', 'none');
    const detailText = detail.append('text').attr('x', 0).attr('y', 0)
        .attr('dominant-baseline', 'hanging').attr('text-anchor', 'end');

    const showDetail = (season: RankedSeasonPoint) => {
        detailText.selectAll('*').remove();
        detailText.append('tspan')
            .style('font-size', '14px').attr('font-weight', '700').style('fill', colors.accentLink)
            .text(season.season_label);
        const year = seasonYear(season.start_date);
        if (year) {
            detailText.append('tspan')
                .attr('dx', 8).style('font-size', '13px').style('fill', colors.labelMuted)
                .text(year);
        }
        if (season.highest_league_name) {
            detailText.append('tspan')
                .attr('dx', 12).style('font-size', '13px').style('fill', colors.labelText)
                .text(season.highest_league_name);
        }
        detailText.append('tspan')
            .attr('dx', 12).style('font-size', '13px').style('fill', colors.labelText)
            .text(`${season.total_battles.toLocaleString()} Battles`);
        detailText.append('tspan')
            .attr('dx', 12).style('font-size', '13px').style('fill', colors.labelText)
            .text(`${(season.win_rate * 100).toFixed(1)}% WR`);
        detail.style('opacity', 1);
    };

    const cx = (season: RankedSeasonPoint) => x(season.total_battles);

    // Silver/Gold+ seasons get a small metal award just below the x-axis at the
    // season's x. Shape/size/metal come from the shared league-award glyph, so
    // the same season wears the same mark on the season lattice below.
    const medalSeasons = plot.filter((season) => leagueOrder(season) >= LEAGUE_AWARD_MIN_ORDER);
    const iconY = height + (compact ? 13 : 15);
    const symbolGen = d3.symbol();
    svg.append('g').selectAll('path')
        .data(medalSeasons).enter().append('path')
        .attr('class', 'medal-icon')
        .attr('transform', (season: RankedSeasonPoint) => `translate(${cx(season)}, ${iconY}) rotate(${leagueAwardSymbol(leagueOrder(season), colors).rotate})`)
        .attr('d', (season: RankedSeasonPoint) => {
            const award = leagueAwardSymbol(leagueOrder(season), colors);
            return symbolGen.type(award.type).size(award.size)();
        })
        .attr('fill', (season: RankedSeasonPoint) => leagueAwardSymbol(leagueOrder(season), colors).color)
        .style('pointer-events', 'none');

    // One circle per season, colored by win rate. r5 matches the clan-battle
    // scatter's dots (hover → 7 on both).
    const circleR = SCATTER_POINT_R;
    const circles = svg.append('g').selectAll('circle')
        .data(plot).enter().append('circle')
        // The join key the season lattice below hovers against.
        .attr('data-season-id', (season: RankedSeasonPoint) => season.season_id)
        .attr('cx', (season: RankedSeasonPoint) => x(season.total_battles))
        .attr('cy', (season: RankedSeasonPoint) => y(season.win_rate * 100))
        .attr('r', circleR)
        .attr('fill', (season: RankedSeasonPoint) => wrColor(season.win_rate * 100))
        .attr('stroke', colors.barBg).attr('stroke-width', 1.5)
        .style('cursor', 'pointer');

    circles.append('title')
        .text((season: RankedSeasonPoint) => {
            const league = season.highest_league_name ? `${season.highest_league_name} · ` : '';
            return `${season.season_label}: ${league}${season.total_battles.toLocaleString()} battles, ${(season.win_rate * 100).toFixed(1)}% WR`;
        });

    circles
        .on('mouseover', function onOver(this: SVGCircleElement, _event: MouseEvent, season: RankedSeasonPoint) {
            d3.select(this).attr('r', circleR * 1.4).attr('stroke', colors.labelText);
            showDetail(season);
        })
        .on('mouseout', function onOut(this: SVGCircleElement) {
            d3.select(this).attr('r', circleR).attr('stroke', colors.barBg);
            detail.style('opacity', 0);
        });
};

const RankedSeasonScatterSVG: React.FC<RankedSeasonScatterSVGProps> = ({
    playerId,
    isLoading = false,
    svgWidth = 600,
    svgHeight = 240,
    theme = 'light',
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { realm } = useRealm();
    const requestSignal = usePlayerRequestSignal();
    const [seasons, setSeasons] = useState<RankedSeasonPoint[] | null>(null);
    // True while the endpoint is still serving []+pending (cold cache), so the
    // chart shows "loading" instead of the settled-empty message.
    const [pending, setPending] = useState(true);

    // Fetch ranked seasons (same endpoint + pending-retry as the RankedSeasons
    // table; fetchSharedJson dedups the two callers so it's one request).
    useEffect(() => {
        if (isLoading) return undefined;
        let isMounted = true;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let pendingAttempts = 0;

        const requestRankedData = async (): Promise<{ data: RankedSeasonPoint[]; pending: boolean } | null> => {
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    const payload = await fetchSharedJson<RankedSeasonPoint[]>(withRealm(`/api/fetch/ranked_data/${playerId}/`, realm), {
                        label: `Ranked data ${playerId}`,
                        ttlMs: PLAYER_ROUTE_PANEL_FETCH_TTL_MS,
                        signal: requestSignal,
                        cacheKey: `ranked-data:${realm}:${playerId}:${pendingAttempts}:${attempt}`,
                        responseHeaders: ['X-Ranked-Pending'],
                    });
                    return { data: payload.data, pending: payload.headers['X-Ranked-Pending'] === 'true' };
                } catch (err) {
                    if (isAbortError(err)) throw err;
                    if (attempt === 0) {
                        await delay(RANKED_FETCH_RETRY_DELAY_MS);
                        continue;
                    }
                }
            }
            return null;
        };

        const fetchData = async () => {
            timeoutId = null;
            try {
                const result = await requestRankedData();
                if (!isMounted) return;
                if (result === null) {
                    setSeasons([]);
                    setPending(false);
                    return;
                }
                setSeasons(result.data);
                if (result.pending && pendingAttempts < RANKED_PENDING_RETRY_LIMIT) {
                    setPending(true);
                    pendingAttempts += 1;
                    timeoutId = setTimeout(() => { void fetchData(); }, RANKED_PENDING_RETRY_DELAY_MS * degradationMonitor.getPollIntervalMultiplier());
                } else {
                    setPending(false);
                }
            } catch (err) {
                if (isAbortError(err) || !isMounted) return;
                setSeasons([]);
                setPending(false);
            }
        };

        void fetchData();
        return () => {
            isMounted = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [playerId, realm, isLoading, requestSignal]);

    // Draw on data/theme/size change, and redraw on resize so the axis keeps
    // filling the container (staying aligned with the heatmap above).
    useEffect(() => {
        if (!containerRef.current) return undefined;
        const resolveWidth = () => resolveContainerChartWidth(containerRef.current?.clientWidth, svgWidth);

        const redraw = () => {
            if (!containerRef.current) return;
            if (seasons === null || (seasons.length === 0 && pending)) {
                drawChart(containerRef.current, [], resolveWidth(), svgHeight, theme, 'Loading ranked seasons…');
                return;
            }
            drawChart(containerRef.current, seasons, resolveWidth(), svgHeight, theme, 'No ranked seasons to plot yet.');
        };
        redraw();

        // Follow the season lattice's hover: pulse the matching point while the
        // pointer sits on that season's box. Subscribing replays the current
        // value, so a resize redraw mid-hover re-attaches to the fresh circle
        // instead of leaving the animation on a discarded one.
        let stopPulse: (() => void) | null = null;
        const colors = chartColors[theme];
        const followHighlight = (seasonId: number | null) => {
            stopPulse?.();
            stopPulse = null;
            if (seasonId == null || !containerRef.current) return;
            stopPulse = startSeasonPulse(containerRef.current, seasonId, colors.barBg, colors.labelText);
        };
        let unsubscribe = subscribeHighlightedSeason(followHighlight);

        let resizeFrame: number | null = null;
        const onResize = () => {
            if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
                redraw();
                // The redraw replaced every circle; re-point the pulse at the
                // new one by resubscribing (which replays the live highlight).
                unsubscribe();
                stopPulse = null;
                unsubscribe = subscribeHighlightedSeason(followHighlight);
            });
        };
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            unsubscribe();
            stopPulse?.();
            if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
        };
    }, [seasons, pending, theme, svgHeight, svgWidth]);

    return (
        <div
            ref={containerRef}
            className="w-full overflow-hidden rounded-md bg-[var(--bg-surface)]"
            role="img"
            aria-label="Ranked win rate versus battles played, one point per season"
        />
    );
};

export default RankedSeasonScatterSVG;
