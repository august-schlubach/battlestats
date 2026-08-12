import React, { useEffect, useState } from 'react';
import { fetchSharedJson } from '../lib/sharedJsonFetch';
import { PLAYER_ROUTE_PANEL_FETCH_TTL_MS } from '../lib/playerRouteFetch';
import { withRealm } from '../lib/realmParams';
import { trackEvent } from '../lib/umami';

// ShipStats — the per-ship combat panel opened in a modal overlay when a row in
// the Battle History table (or a treemap tile) is clicked. The host
// (BattleHistoryCard) owns the overlay chrome — backdrop, Escape, scroll clamp;
// this component is the panel itself, so its root carries no outer margin.
// It operationalizes the previously-unsurfaced ships_stats_json
// combat fields (gunnery / torpedo / secondary accuracy, spotting, objective
// play, survival) documented in
// runbook-battle-history-data-operationalization-2026-06-16.md.
//
// Each metric charts the player's CAREER per-ship rate against the ship's
// 30-day POPULATION average. Role-irrelevant metrics (e.g. secondaries on a DD,
// torpedoes on most battleships) are omitted server-side, so this component
// renders only the clusters that matter for the selected ship.

// "Good" / "bad" delta colors mirror BattleHistoryCard's WrCell so the whole
// Activity tab reads consistently across light/dark.
const TONE_GOOD = '#74c476';
const TONE_BAD = '#a50f15';
const TONE_NEUTRAL = 'var(--text-muted)';

// Comparison column accents: the profile owner ("Player") toward blue, the
// population average toward orange (palette --accent-mid + chartTheme's
// wrAverage orange). Used to tint the table's Average/Player headers. "Player"
// never means "you" — this is the viewed account, not necessarily the viewer.
const COLOR_PLAYER = 'var(--accent-mid)';
const COLOR_AVERAGE = '#fd8d3c';

// Skill brackets, by overall account random win rate (see backend). The user
// can compare against all players, the top 50%, or the top 25%.
type SkillBracket = 'all' | 'top50' | 'top25';
const BRACKET_OPTIONS: { id: SkillBracket; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'top50', label: 'Top 50%' },
    { id: 'top25', label: 'Top 25%' },
];

interface ShipStatMetric {
    key: string;
    label: string;
    unit: string;
    better: 'high' | 'low';
    user: number | null;
    averages: Record<SkillBracket, number | null>;
}

interface ShipStatCluster {
    name: string;
    metrics: ShipStatMetric[];
}

interface BracketMeta {
    players: number;
    battles: number;
}

interface ShipCombatPayload {
    ship_id: number;
    ship_name: string;
    ship_tier: number | null;
    ship_type: string | null;
    window_days: number;
    min_account_battles: number;
    brackets: Record<SkillBracket, BracketMeta>;
    user_battles: number;
    has_user_data: boolean;
    clusters: ShipStatCluster[];
    // First-ever view of this ship on this realm: the population aggregation is
    // warming in the background (too heavy for the request thread — see
    // data._ship_population_brackets_30d). `clusters` is EMPTY on a pending
    // payload, so this must be checked BEFORE clusters.length or the panel
    // reports "not enough data" for a ship that simply has not warmed yet.
    // Absent on ready payloads.
    pending?: boolean;
}

interface ShipStatsProps {
    playerName: string;
    realm: string;
    shipId: number;
    // Ship name from the clicked table row — render the header instantly before
    // the fetch resolves; the payload refines it.
    shipName?: string;
    onClose: () => void;
}

const formatMetricValue = (value: number | null, unit: string): string => {
    if (value == null) {
        return '—';
    }
    if (unit === '%') {
        return `${value.toFixed(1)}%`;
    }
    // Per-battle counters: large numbers (damage / xp) read better rounded with
    // separators; small rates (frags, caps) keep up to one decimal.
    const formatted = Math.abs(value) >= 1000
        ? Math.round(value).toLocaleString()
        : (Math.round(value * 10) / 10).toLocaleString();
    return unit ? `${formatted}${unit}` : formatted;
};

// Player-vs-average delta as a signed percent, toned good/bad by whether the
// direction is favorable for the metric (a lower torpedo-miss rate is "better").
const computeDelta = (user: number | null, average: number | null, better: 'high' | 'low') => {
    if (user == null || average == null || average === 0) {
        return { text: '', tone: TONE_NEUTRAL };
    }
    const deltaPct = ((user - average) / average) * 100;
    const magnitude = Math.abs(deltaPct);
    if (magnitude < 0.5) {
        return { text: '≈ avg', tone: TONE_NEUTRAL };
    }
    const isBetter = better === 'high' ? deltaPct > 0 : deltaPct < 0;
    return {
        text: `${deltaPct > 0 ? '+' : '−'}${magnitude.toFixed(0)}%`,
        tone: isBetter ? TONE_GOOD : TONE_BAD,
    };
};

const ShipStats: React.FC<ShipStatsProps> = ({
    playerName, realm, shipId, shipName, onClose,
}) => {
    const [payload, setPayload] = useState<ShipCombatPayload | null>(null);
    const [state, setState] = useState<
        'loading' | 'warming' | 'warming_timeout' | 'ready' | 'empty' | 'error'
    >('loading');
    const [bracket, setBracket] = useState<SkillBracket>('all');

    useEffect(() => {
        let cancelled = false;
        setPayload(null);
        setState('loading');

        const url = withRealm(
            `/api/player/${encodeURIComponent(playerName)}/ship/${shipId}/combat-stats`,
            realm,
        );
        // Poll cadence for a warming population: ~3s × 20 ≈ 60s, comfortably over
        // the ~36s worst observed cold compute plus warm-queue latency. Only the
        // very first view of a ship on a realm warms; every later one is served
        // from the durable `:published` copy, so the opening fetch keeps the
        // normal panel TTL. Every POLL must bypass the settled cache (ttlMs:0) —
        // with a TTL the poll would keep re-reading the cached pending stub and
        // never observe the warm landing. The server cache + in-flight dedup keep
        // the re-fetches cheap.
        const POLL_MS = 3000;
        const MAX_POLLS = 20;
        let polls = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const run = () => {
            fetchSharedJson<ShipCombatPayload>(url, {
                label: 'Ship combat stats',
                ttlMs: polls === 0 ? PLAYER_ROUTE_PANEL_FETCH_TTL_MS : 0,
            })
                .then(({ data }) => {
                    if (cancelled) return;
                    // Check `pending` BEFORE clusters.length — a pending payload
                    // carries no clusters, so on ANY path where it reaches the
                    // branch below it would render "not enough data" for a ship
                    // that has simply not warmed. That includes exhausting the
                    // poll budget: the warm runs on the `background` queue, which
                    // can be minutes deep behind enrichment batches, and on the
                    // first day after deploy no ship has a published copy yet —
                    // so timing out is expected, not exceptional. It gets its own
                    // terminal state and never falls through.
                    if (data.pending) {
                        setPayload(data);
                        if (polls < MAX_POLLS) {
                            polls += 1;
                            setState('warming');
                            timer = setTimeout(run, POLL_MS);
                        } else {
                            setState('warming_timeout');
                        }
                        return;
                    }
                    setPayload(data);
                    setState(data.clusters.length > 0 ? 'ready' : 'empty');
                })
                .catch(() => {
                    if (cancelled) return;
                    setState('error');
                });
        };
        run();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [playerName, realm, shipId]);

    const headerName = payload?.ship_name || shipName || `Ship ${shipId}`;

    return (
        <div
            className="relative rounded-md border border-[var(--accent-faint)] bg-[var(--bg-surface)] p-4"
            data-testid="ship-stats"
            aria-label={`Combat profile for ${headerName}`}
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="Hide ship combat profile"
                className="absolute right-3 top-3 rounded px-2 py-0.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-faint)] hover:text-[var(--text-strong)]"
            >
                ✕
            </button>

            {/* One centered, shrink-to-fit column so the title, subtitle, filters,
                and table all share the table's left edge while the block stays
                centered in the panel. max-w-full + overflow keeps the fixed-width
                metric columns from pushing page-level horizontal scroll on phones. */}
            <div className="mx-auto w-fit max-w-full overflow-x-auto">
            <div>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-xl font-bold text-[var(--text-strong)]">{headerName}</h3>
                </div>
                {state === 'ready' && payload ? (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {payload.window_days}d performance in Random battles
                        {payload.brackets[bracket].players > 0
                            ? ` (${payload.brackets[bracket].players.toLocaleString()} captains, ${payload.brackets[bracket].battles.toLocaleString()} battles)`
                            : ''}
                    </p>
                ) : null}
            </div>

            {state === 'loading' ? (
                <p className="mt-3 animate-pulse text-sm text-[var(--accent-light)]">Loading ship combat profile…</p>
            ) : null}

            {state === 'warming' ? (
                <p className="mt-3 animate-pulse text-sm text-[var(--accent-light)]">
                    Building this ship&apos;s population comparison for the first time…
                </p>
            ) : null}

            {state === 'warming_timeout' ? (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Still building this ship&apos;s comparison — check back in a minute.
                </p>
            ) : null}

            {state === 'error' ? (
                <p className="mt-3 text-sm text-[var(--text-muted)]">Unable to load this ship&apos;s combat profile right now.</p>
            ) : null}

            {state === 'empty' ? (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Not enough recent server data for this ship yet to build a comparison.
                </p>
            ) : null}

            {state === 'ready' && payload ? (
                <>
                    {/* Compare against all players, or only the higher-skill
                        brackets (by overall account win rate). */}
                    <div className="mt-3 flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Compare vs</span>
                        <div className="inline-flex overflow-hidden rounded-md border border-[var(--accent-faint)] text-xs" role="group" aria-label="Skill bracket">
                            {BRACKET_OPTIONS.map((opt) => {
                                const isActive = bracket === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                            if (bracket !== opt.id) {
                                                setBracket(opt.id);
                                                trackEvent('ship-stats-bracket', { bracket: opt.id, ship_id: shipId, realm });
                                            }
                                        }}
                                        aria-pressed={isActive}
                                        className={`px-2.5 py-1 transition-colors ${
                                            isActive
                                                ? 'bg-[var(--accent-mid)] font-semibold text-[var(--bg-card)]'
                                                : 'text-[var(--accent-mid)] hover:bg-[var(--accent-faint)]'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Content-width table; the wrapping column is centered, so the
                        table sets the shared left edge. Metrics grouped by cluster rows. */}
                    <table className="mt-4 text-sm">
                        <thead>
                            <tr className="border-b border-[var(--accent-faint)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                                <th className="py-1.5 pr-8 text-left font-medium" />
                                <th className="px-4 py-1.5 text-right font-semibold min-w-[6rem] sm:min-w-[10rem]" style={{ color: COLOR_AVERAGE }}>Average</th>
                                <th className="px-4 py-1.5 text-right font-semibold min-w-[6rem] sm:min-w-[10rem]" style={{ color: COLOR_PLAYER }}>Player</th>
                                <th className="py-1.5 pl-4 text-right font-medium min-w-[4.75rem]">Delta</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payload.clusters.map((cluster) => (
                                <React.Fragment key={cluster.name}>
                                    {cluster.name !== 'Outcomes' ? (
                                        <tr>
                                            <td colSpan={4} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-mid)]">
                                                {cluster.name}
                                                {/* Accuracy hit-rates read the player's CAREER totals (30-day
                                                    gunnery is too sparse) while the rest are 30-day — flag it. */}
                                                {cluster.name === 'Accuracy' ? (
                                                    <span className="font-normal text-[var(--text-muted)]"> · career</span>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ) : null}
                                    {cluster.metrics.map((metric) => {
                                        const average = metric.averages[bracket];
                                        const delta = computeDelta(metric.user, average, metric.better);
                                        // Emphasis (white/semibold) follows the better reading per row,
                                        // not the column; the weaker one is muted. With one side missing,
                                        // the present value is emphasized.
                                        const playerBetter = (metric.user != null && average != null)
                                            ? (metric.better === 'high' ? metric.user >= average : metric.user <= average)
                                            : metric.user != null;
                                        const strong = 'font-semibold text-[var(--text-strong)]';
                                        const muted = 'text-[var(--text-muted)]';
                                        // A "per X" unit (e.g. /battle) reads better appended to the
                                        // metric name, leaving the value cells as bare numbers; "%" stays
                                        // inline with the value.
                                        const unitInLabel = metric.unit.startsWith('/');
                                        const labelText = unitInLabel ? `${metric.label}${metric.unit}` : metric.label;
                                        const valueUnit = unitInLabel ? '' : metric.unit;
                                        return (
                                            <tr key={metric.key} className="border-t border-[var(--accent-faint)]">
                                                <td className="py-1.5 pr-8 text-left text-[var(--text-strong)]">{labelText}</td>
                                                <td className={`px-4 py-1.5 text-right tabular-nums min-w-[10rem] ${playerBetter ? muted : strong}`}>{formatMetricValue(average, valueUnit)}</td>
                                                <td className={`px-4 py-1.5 text-right tabular-nums min-w-[10rem] ${playerBetter ? strong : muted}`}>{formatMetricValue(metric.user, valueUnit)}</td>
                                                <td className="py-1.5 pl-4 text-right font-semibold tabular-nums min-w-[4.75rem]" style={{ color: delta.tone }}>{delta.text}</td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </>
            ) : null}

            {state === 'ready' && payload && !payload.has_user_data ? (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                    No battles in the last 30 days on this ship for this player — showing the server average only.
                </p>
            ) : null}
            </div>
        </div>
    );
};

export default ShipStats;
