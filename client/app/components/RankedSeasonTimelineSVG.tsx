import React, { useEffect, useRef, useState } from 'react';
import { resolveContainerChartWidth, type ChartTheme } from '../lib/chartTheme';
import { drawSeasonLattice, type LatticeSlot } from '../lib/seasonLattice';
import { setHighlightedSeason } from '../lib/rankedSeasonHighlight';
import { leagueOrderFrom } from '../lib/rankedLeagueGlyph';
import { PLAYER_ROUTE_PANEL_FETCH_TTL_MS } from '../lib/playerRouteFetch';
import { fetchSharedJson, isAbortError } from '../lib/sharedJsonFetch';
import { degradationMonitor } from '../lib/degradationMonitor';
import { usePlayerRequestSignal } from '../context/PlayerRequestScopeContext';
import { useRealm } from '../context/RealmContext';
import { withRealm } from '../lib/realmParams';

interface RankedSeasonRow {
    season_id: number;
    season_label: string;
    total_battles: number;
    win_rate: number; // 0..1 fraction
    start_date?: string | null;
    highest_league?: number;
    highest_league_name?: string;
}

// /api/ranked_seasons/ — every ranked season WG has run, oldest first,
// player-independent. This is the lattice the player's record is drawn onto.
interface RankedSeasonCatalogRow {
    season_id: number;
    season_label: string;
    season_name: string;
    start_date: string | null;
    end_date: string | null;
}

interface RankedSeasonTimelineSVGProps {
    playerId: number;
    isLoading?: boolean;
    svgWidth?: number;
    svgHeight?: number;
    theme?: ChartTheme;
}

// The catalog only moves when WG starts a season; an hour of client-side reuse
// costs nothing and keeps tab switches free.
const RANKED_CATALOG_TTL_MS = 60 * 60 * 1000;
const RANKED_FETCH_RETRY_DELAY_MS = 350;
const RANKED_PENDING_RETRY_DELAY_MS = 1500;
const RANKED_PENDING_RETRY_LIMIT = 12;

const delay = (timeoutMs: number): Promise<void> => new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
});

const seasonYear = (startDate?: string | null): number | null => {
    const match = /(\d{4})/.exec(startDate ?? '');
    return match ? Number(match[1]) : null;
};

// Catalog × player record → one slot per season that exists. A season the
// player logged battles in is lit on the WR scale (ranked win_rate is a 0..1
// fraction, so scale to percent); every other season stays an empty box.
//
// The catalog is authoritative for which slots exist and their order. A played
// season missing from the catalog would be invisible, so those are appended in
// season-id order — the catalog lags only for a season WG has not published.
const toSlots = (
    catalog: RankedSeasonCatalogRow[],
    played: RankedSeasonRow[],
): LatticeSlot[] => {
    const playedById = new Map<number, RankedSeasonRow>();
    played.forEach((season) => {
        if ((season.total_battles || 0) > 0) playedById.set(season.season_id, season);
    });

    // A catalog row's missing end_date means "still running"; an orphan's means
    // "we have no catalog row at all", which is NOT the same claim. Deciding
    // in-progress here — rather than from `end_date` downstream — keeps a failed
    // catalog request (every season becomes an orphan) from labelling the whole
    // record in progress.
    interface SeasonSlotSource {
        season_id: number;
        season_label: string;
        start_date: string | null;
        inProgress: boolean;
    }

    const catalogIds = new Set(catalog.map((season) => season.season_id));
    const sources: SeasonSlotSource[] = [
        ...catalog.map((season) => ({
            season_id: season.season_id,
            season_label: season.season_label,
            start_date: season.start_date,
            inProgress: season.end_date == null,
        })),
        ...played
            .filter((season) => playedById.has(season.season_id) && !catalogIds.has(season.season_id))
            .map((season) => ({
                season_id: season.season_id,
                season_label: season.season_label,
                start_date: season.start_date ?? null,
                inProgress: false,
            })),
    ];

    return sources
        .sort((left, right) => left.season_id - right.season_id)
        .map((season): LatticeSlot => {
            const record = playedById.get(season.season_id);
            return {
                seasonId: season.season_id,
                label: season.season_label || `S${season.season_id - 1000}`,
                year: seasonYear(season.start_date),
                played: record != null,
                battles: record?.total_battles ?? 0,
                winRate: (record?.win_rate ?? 0) * 100,
                leagueOrder: record ? leagueOrderFrom(record.highest_league_name, record.highest_league) : 0,
                inProgress: season.inProgress,
            };
        });
};

const RankedSeasonTimelineSVG: React.FC<RankedSeasonTimelineSVGProps> = ({
    playerId,
    isLoading = false,
    svgWidth = 600,
    svgHeight = 128,
    theme = 'light',
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { realm } = useRealm();
    const requestSignal = usePlayerRequestSignal();
    const [seasons, setSeasons] = useState<RankedSeasonRow[] | null>(null);
    const [catalog, setCatalog] = useState<RankedSeasonCatalogRow[] | null>(null);
    // True while the endpoint is still serving []+pending (cold cache).
    const [pending, setPending] = useState(true);

    // The season catalog is player- and realm-independent and changes only when
    // WG starts a season, so it is fetched once per mount under a shared cache
    // key — every player page reuses the same copy.
    useEffect(() => {
        if (isLoading) return undefined;
        let isMounted = true;

        (async () => {
            try {
                const payload = await fetchSharedJson<RankedSeasonCatalogRow[]>('/api/ranked_seasons/', {
                    label: 'Ranked season catalog',
                    ttlMs: RANKED_CATALOG_TTL_MS,
                    signal: requestSignal,
                    cacheKey: 'ranked-season-catalog',
                });
                if (isMounted) setCatalog(payload.data);
            } catch (err) {
                if (isAbortError(err) || !isMounted) return;
                // No catalog → fall back to the player's own played seasons as
                // the lattice, rather than drawing nothing.
                setCatalog([]);
            }
        })();

        return () => { isMounted = false; };
    }, [isLoading, requestSignal]);

    useEffect(() => {
        if (isLoading) return undefined;
        let isMounted = true;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let pendingAttempts = 0;

        const requestRankedData = async (): Promise<{ data: RankedSeasonRow[]; pending: boolean } | null> => {
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    const payload = await fetchSharedJson<RankedSeasonRow[]>(withRealm(`/api/fetch/ranked_data/${playerId}/`, realm), {
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

    useEffect(() => {
        if (!containerRef.current) return undefined;
        const resolveWidth = () => resolveContainerChartWidth(containerRef.current?.clientWidth, svgWidth);
        const redraw = () => {
            if (!containerRef.current) return;
            // Hold the placeholder until BOTH the lattice and the record are in
            // — drawing the catalog first would flash a fully unplayed board.
            if (seasons === null || catalog === null || (seasons.length === 0 && pending)) {
                drawSeasonLattice(containerRef.current, [], resolveWidth(), svgHeight, theme, 'Loading ranked seasons…');
                return;
            }
            drawSeasonLattice(containerRef.current, toSlots(catalog, seasons), resolveWidth(), svgHeight, theme, 'No ranked seasons to plot yet.');
        };
        redraw();

        let resizeFrame: number | null = null;
        const onResize = () => {
            if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(redraw);
        };
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            // Unmounting mid-hover (tab switch, nav) must not leave the scatter
            // pulsing a season nothing is pointing at any more.
            setHighlightedSeason(null);
            if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
        };
    }, [seasons, catalog, pending, theme, svgHeight, svgWidth]);

    return (
        <div
            ref={containerRef}
            className="w-full overflow-hidden rounded-md bg-[var(--bg-surface)]"
            role="img"
            aria-label="Ranked season activity timeline by year"
        />
    );
};

export default RankedSeasonTimelineSVG;
