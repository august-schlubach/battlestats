import React, { useEffect, useMemo, useState } from 'react';
import { badgeClassColor, chartColors, shipTypeShortColor, type ChartTheme } from '../lib/chartTheme';
import wrColor from '../lib/wrColor';
import { trackEvent } from '../lib/umami';
import { useRealm } from '../context/RealmContext';
import { useT } from '../context/LocaleContext';
import { nationLabel } from '../lib/shipIdentity';
import EfficiencyMiniTreemaps from './EfficiencyMiniTreemaps';
import NationFlag from './NationFlag';

// One badged ship, normalized from an efficiency row (see normalizeBadgeDots in
// PlayerEfficiencyBadges). shipType is the short class label (BB/CA/DD/CV/Sub);
// badgeClass is the quality grade 1..4 (1 = Expert, best).
export interface EfficiencyBadgeDot {
    shipId: number;
    shipName: string;
    shipType: string;
    shipTier: number;
    // WG lowercase nation code (usa, pan_asia, …); null when the catalog row
    // carries no nation. Renders as a flag, sorts by its readable label.
    nation: string | null;
    badgeClass: number;
    badgeLabel: string;
    // Career random battles + win ratio (0..1) the player logged in this ship,
    // joined server-side from battles_json; null when the ship is absent there.
    battles: number | null;
    winRatio: number | null;
}

interface EfficiencyBadgeTableProps {
    dots: EfficiencyBadgeDot[];
    theme: ChartTheme;
    // Scroll cap (px) for the table body — the shared insights-panel height so
    // a badge-heavy player's table never runs longer than the other tabs.
    maxTableHeightPx?: number;
}

type SortKey = 'name' | 'tier' | 'nation' | 'type' | 'award' | 'battles' | 'wr';
type SortDir = 'asc' | 'desc';

// The filterable facets, in filter-bar order.
const FILTER_CONTROLS = ['tier', 'type', 'nation', 'award'] as const;
type FilterControl = (typeof FILTER_CONTROLS)[number];

// Which control the visitor actually touched. The same filter change can come
// from the bar or from a mini-treemap tile, and the two are indistinguishable
// without this — so it can't be measured whether the charts earn their space.
// 'button' is the Clear button (which also carries control:'clear').
type FilterSource = 'dropdown' | 'treemap' | 'button';

// Award grades, best → worst, for the summary line above the table.
const GRADES: Array<{ badgeClass: number; label: string }> = [
    { badgeClass: 1, label: 'Expert' },
    { badgeClass: 2, label: 'I' },
    { badgeClass: 3, label: 'II' },
    { badgeClass: 4, label: 'III' },
];

// Canonical class order so the Type filter lists BB→CA→DD→CV→Sub; unknown
// types sort after, alphabetically.
const SHIP_TYPE_ORDER = ['BB', 'CA', 'DD', 'CV', 'Sub'];
const typeRank = (type: string): number => {
    const index = SHIP_TYPE_ORDER.indexOf(type);
    return index === -1 ? SHIP_TYPE_ORDER.length : index;
};

const COLUMNS: Array<{ key: SortKey; label: string; align: 'left' | 'center' }> = [
    { key: 'name', label: 'Name', align: 'left' },
    { key: 'tier', label: 'Tier', align: 'center' },
    { key: 'nation', label: 'Nation', align: 'center' },
    { key: 'type', label: 'Type', align: 'center' },
    { key: 'award', label: 'Award', align: 'center' },
    { key: 'battles', label: 'Battles', align: 'center' },
    { key: 'wr', label: 'WR%', align: 'center' },
];

// Each column's natural first direction: names/types read best A→Z, tier/award
// best-first (highest tier, Expert grade), battles/WR biggest-first.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
    name: 'asc',
    tier: 'desc',
    nation: 'asc',
    award: 'asc',
    type: 'asc',
    battles: 'desc',
    wr: 'desc',
};

// Missing values — battles/WR (ship absent from battles_json) or an unknown
// nation — always sort to the bottom regardless of direction, so a dash never
// outranks a real value. Returns null when both sides are present, meaning
// "no verdict; compare them normally".
const nullsLast = <T,>(av: T | null, bv: T | null): number | null => {
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return null;
};

const compareRows = (a: EfficiencyBadgeDot, b: EfficiencyBadgeDot, key: SortKey, dir: SortDir): number => {
    switch (key) {
        case 'tier':
            return a.shipTier - b.shipTier;
        case 'award':
            // badgeClass 1 (Expert) is best, so ascending == best-first.
            return a.badgeClass - b.badgeClass;
        case 'type':
            return a.shipType.localeCompare(b.shipType);
        case 'nation': {
            // Sort on the readable label (what the flag's hover shows), not the
            // raw WG code, so "U.K." and "USA" order as a reader expects.
            const al = nationLabel(a.nation);
            const bl = nationLabel(b.nation);
            const sink = nullsLast(al, bl);
            if (sink !== null) return dir === 'asc' ? sink : -sink;
            return (al as string).localeCompare(bl as string);
        }
        case 'battles': {
            const sink = nullsLast(a.battles, b.battles);
            // Un-negate the sink offset so nulls stay last after the caller flips
            // the sign for a descending sort.
            if (sink !== null) return dir === 'asc' ? sink : -sink;
            return (a.battles as number) - (b.battles as number);
        }
        case 'wr': {
            const sink = nullsLast(a.winRatio, b.winRatio);
            if (sink !== null) return dir === 'asc' ? sink : -sink;
            return (a.winRatio as number) - (b.winRatio as number);
        }
        case 'name':
        default:
            return a.shipName.localeCompare(b.shipName);
    }
};

const EfficiencyBadgeTable: React.FC<EfficiencyBadgeTableProps> = ({ dots, theme, maxTableHeightPx }) => {
    const colors = chartColors[theme];
    const { realm } = useRealm();
    const t = useT();
    const [sortKey, setSortKey] = useState<SortKey>('award');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    // 'all' = no filter on that facet.
    const [filterTier, setFilterTier] = useState<string>('all');
    const [filterType, setFilterType] = useState<string>('all');
    const [filterNation, setFilterNation] = useState<string>('all');
    const [filterAward, setFilterAward] = useState<string>('all');

    const onSort = (key: SortKey) => {
        const nextDir: SortDir = key === sortKey
            ? (sortDir === 'asc' ? 'desc' : 'asc')
            : DEFAULT_DIR[key];
        setSortKey(key);
        setSortDir(nextDir);
        trackEvent('efficiency-sort', { realm, column: key, direction: nextDir });
    };

    // One table of the facet controls, so adding a facet can't leave the setter,
    // the current value, and the reset out of step with each other.
    const filterState: Record<FilterControl, { value: string; set: (next: string) => void }> = {
        tier: { value: filterTier, set: setFilterTier },
        type: { value: filterType, set: setFilterType },
        nation: { value: filterNation, set: setFilterNation },
        award: { value: filterAward, set: setFilterAward },
    };

    // Single entry point for every filter change (dropdown, treemap click,
    // clear) so the state update + umami event never drift apart. `source` is
    // REQUIRED rather than defaulted: a default would silently label a missed
    // call site as a dropdown, which is the exact reading this field exists to
    // make trustworthy.
    const applyFilter = (control: FilterControl, value: string, source: FilterSource) => {
        filterState[control].set(value);
        trackEvent('efficiency-filter', { realm, control, value, source });
    };

    // A treemap tile click sets that control's filter — or clears it (toggle
    // off) when the already-selected tile is clicked again.
    const onTreemapSelect = (control: FilterControl, value: string) => {
        applyFilter(control, filterState[control].value === value ? 'all' : value, 'treemap');
    };

    const hasActiveFilter = FILTER_CONTROLS.some((control) => filterState[control].value !== 'all');

    const resetFilters = () => {
        setFilterTier('all');
        setFilterType('all');
        setFilterNation('all');
        setFilterAward('all');
    };

    const clearFilters = () => {
        resetFilters();
        trackEvent('efficiency-filter', { realm, control: 'clear', value: 'all', source: 'button' });
    };

    // A new player's badges arrive as a fresh `dots` array; clear any active
    // filter so a prior player's facet choice never hides the new set.
    useEffect(() => {
        resetFilters();
    }, [dots]);

    // The rows surviving the tier/type/award filters. Both the summary counts
    // and the sorted table read from this so the counts track the active filter.
    const filteredRows = useMemo(() => (
        dots.filter((dot) => (
            (filterTier === 'all' || dot.shipTier === Number(filterTier))
            && (filterType === 'all' || dot.shipType === filterType)
            && (filterNation === 'all' || dot.nation === filterNation)
            && (filterAward === 'all' || dot.badgeClass === Number(filterAward))
        ))
    ), [dots, filterTier, filterType, filterNation, filterAward]);

    const gradeCounts = useMemo(() => {
        const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
        for (const dot of filteredRows) {
            counts[dot.badgeClass] = (counts[dot.badgeClass] ?? 0) + 1;
        }
        return counts;
    }, [filteredRows]);

    // Filter dropdowns only offer facet values the player actually has, so a
    // choice can never empty the table by accident.
    const { tierOptions, typeOptions, nationOptions, awardOptions } = useMemo(() => {
        const tiers = new Set<number>();
        const types = new Set<string>();
        const nations = new Set<string>();
        const awards = new Set<number>();
        for (const dot of dots) {
            tiers.add(dot.shipTier);
            types.add(dot.shipType);
            awards.add(dot.badgeClass);
            if (dot.nation) {
                nations.add(dot.nation);
            }
        }
        return {
            tierOptions: Array.from(tiers).sort((a, b) => b - a),
            typeOptions: Array.from(types).sort((a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b)),
            // Alphabetical by the readable label — the order a reader scans for.
            nationOptions: Array.from(nations)
                .map((code) => ({ code, label: nationLabel(code) ?? code }))
                .sort((a, b) => a.label.localeCompare(b.label)),
            awardOptions: Array.from(awards).sort((a, b) => a - b),
        };
    }, [dots]);

    const sortedRows = useMemo(() => {
        const rows = [...filteredRows];
        rows.sort((a, b) => {
            const primary = compareRows(a, b, sortKey, sortDir);
            if (primary !== 0) {
                return sortDir === 'asc' ? primary : -primary;
            }
            // Ship name is the stable tiebreaker (always ascending, so the
            // direction toggle never scrambles equal-key rows) — except when
            // name IS the sort key, where primary already settled it.
            return sortKey === 'name' ? 0 : a.shipName.localeCompare(b.shipName);
        });
        return rows;
    }, [filteredRows, sortKey, sortDir]);

    return (
        <div className="mt-8 overflow-x-auto px-[15px]">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                    {/* whitespace-nowrap: CJK has no spaces, so a short label can
                        break mid-character once the flex row squeezes it below
                        its content width (the ThemeToggle chip hit this first —
                        see its comment). 티어/艦種/... are one- or two-character
                        tokens that should never wrap in any language. */}
                    <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">{t('common.tier')}</span>
                    <select
                        value={filterTier}
                        onChange={(event) => applyFilter('tier', event.target.value, 'dropdown')}
                        className="rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[var(--text-primary)]"
                    >
                        <option value="all">{t('common.all')}</option>
                        {tierOptions.map((tier) => (
                            <option key={tier} value={String(tier)}>T{tier}</option>
                        ))}
                    </select>
                </label>
                <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">{t('common.type')}</span>
                    <select
                        value={filterType}
                        onChange={(event) => applyFilter('type', event.target.value, 'dropdown')}
                        className="rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[var(--text-primary)]"
                    >
                        <option value="all">{t('common.all')}</option>
                        {typeOptions.map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </label>
                <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">{t('common.nation')}</span>
                    <select
                        value={filterNation}
                        onChange={(event) => applyFilter('nation', event.target.value, 'dropdown')}
                        className="rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[var(--text-primary)]"
                    >
                        <option value="all">{t('common.all')}</option>
                        {nationOptions.map((option) => (
                            <option key={option.code} value={option.code}>{option.label}</option>
                        ))}
                    </select>
                </label>
                <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide">{t('common.award')}</span>
                    <select
                        value={filterAward}
                        onChange={(event) => applyFilter('award', event.target.value, 'dropdown')}
                        className="rounded border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[var(--text-primary)]"
                    >
                        <option value="all">{t('common.all')}</option>
                        {awardOptions.map((badgeClass) => (
                            <option key={badgeClass} value={String(badgeClass)}>
                                {GRADES.find((grade) => grade.badgeClass === badgeClass)?.label ?? `Class ${badgeClass}`}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    onClick={clearFilters}
                    disabled={!hasActiveFilter}
                    className="rounded border border-[var(--border)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-40 disabled:hover:text-[var(--text-secondary)]"
                >
                    Clear
                </button>
            </div>
            {/* Small-multiples treemaps of the (filtered) badge set by tier,
                type, nation, and award — a 2x2 composition overview between the
                filters and the award-count summary. */}
            <div className="mb-4">
                <EfficiencyMiniTreemaps
                    rows={filteredRows}
                    theme={theme}
                    selected={{ tier: filterTier, type: filterType, nation: filterNation, award: filterAward }}
                    onSelect={onTreemapSelect}
                />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]" aria-label="Award totals">
                {GRADES.map((grade) => {
                    const count = gradeCounts[grade.badgeClass] ?? 0;
                    return (
                        <span key={grade.badgeClass} className={`inline-flex items-center gap-1.5 ${count === 0 ? 'text-[var(--text-muted)]' : ''}`}>
                            <span
                                aria-hidden="true"
                                className="inline-block h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: badgeClassColor(colors, grade.badgeClass) }}
                            />
                            {grade.label}: <span className="font-semibold tabular-nums text-[var(--text-primary)]">{count}</span>
                        </span>
                    );
                })}
            </div>
            <div className="overflow-auto" style={maxTableHeightPx ? { maxHeight: maxTableHeightPx } : undefined}>
            <table className="w-full border-collapse text-sm text-[var(--text-primary)]" aria-label="Efficiency badges by ship">
                <thead>
                    <tr>
                        {COLUMNS.map((column) => {
                            const active = column.key === sortKey;
                            const alignClass = column.align === 'left' ? 'text-left' : 'text-center';
                            return (
                                <th
                                    key={column.key}
                                    scope="col"
                                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                    className={`sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] ${alignClass}`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => onSort(column.key)}
                                        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-[var(--text-primary)] ${active ? 'text-[var(--text-primary)]' : ''}`}
                                    >
                                        {column.label}
                                        <span aria-hidden="true" className="text-[0.65rem] leading-none">
                                            {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                                        </span>
                                    </button>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {sortedRows.map((row) => (
                        <tr key={row.shipId} className="border-b border-[var(--border)]">
                            <td className="px-3 py-1.5 text-left">{row.shipName}</td>
                            <td className="px-3 py-1.5 text-center tabular-nums">{row.shipTier}</td>
                            {/* Flag only; NationFlag's own `title` is the hover
                                label, and the sr-only span carries it for screen
                                readers (the image itself is decorative). */}
                            <td className="px-3 py-1.5 text-center">
                                {nationLabel(row.nation) == null ? (
                                    <span className="text-[var(--text-muted)]">—</span>
                                ) : (
                                    <span className="inline-flex items-center justify-center align-middle">
                                        <NationFlag nation={row.nation} />
                                        <span className="sr-only">{nationLabel(row.nation)}</span>
                                    </span>
                                )}
                            </td>
                            <td className="px-3 py-1.5 text-center font-semibold" style={{ color: shipTypeShortColor(colors, row.shipType) }}>{row.shipType}</td>
                            <td className="px-3 py-1.5 text-center">{row.badgeLabel}</td>
                            <td className="px-3 py-1.5 text-center tabular-nums">
                                {row.battles == null ? <span className="text-[var(--text-muted)]">—</span> : row.battles.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-center tabular-nums">
                                {row.winRatio == null ? (
                                    <span className="text-[var(--text-muted)]">—</span>
                                ) : (
                                    <span className="font-semibold" style={{ color: wrColor(row.winRatio * 100) }}>
                                        {`${(row.winRatio * 100).toFixed(1)}%`}
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        </div>
    );
};

export default EfficiencyBadgeTable;
