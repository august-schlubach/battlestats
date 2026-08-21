// Server-side data + text helpers for the dynamic Open Graph cards.
//
// Why this exists: before 2026-07-29 every shared link rendered as a bare text
// stub (`twitter: { card: 'summary' }`, no image, data-free description). The one
// measurably converting social channel for this site is X via t.co, where the
// preview card *is* the pitch, so a card that carries the actual numbers is the
// highest-leverage word-of-mouth work available.
//
// Constraints this module exists to enforce:
//   - Cards read the same cache-first Django endpoints the pages use. They never
//     reach Wargaming, and they never block a scrape on a cold warm-up: a short
//     abort timeout degrades to a name-only card, which still looks deliberate.
//   - Failure is always a card, never an error. A broken card is a broken link
//     preview; an exception would be a 500 in a crawler's face.
//
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

import type { OgCardLayoutProps, OgStat } from './ogCardLayout';
import { applySort, type SortDir } from './tableSort';
import { shipBucketLabel, type ShipType, type Tier, type WrPct } from './entityRoutes';

const API_ORIGIN = process.env.BATTLESTATS_API_ORIGIN ?? 'http://localhost:8888';

/** Upstream is cache-first, so this only ever trims a pathological stall. */
const FETCH_TIMEOUT_MS = 2000;

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

/** Route-level ISR: one generated card serves every scrape for an hour. */
export const OG_REVALIDATE_SECONDS = 3600;

export type OgRealm = 'na' | 'eu' | 'asia';

export const resolveOgRealm = (value?: string | string[] | null): OgRealm => {
    const candidate = Array.isArray(value) ? value[0] : value;
    return candidate === 'eu' || candidate === 'asia' ? candidate : 'na';
};

/** Same header the player page reads: which realm the backend actually resolved. */
const RESOLVED_REALM_HEADER = 'X-Resolved-Realm';

interface EntityFetchResult {
    payload: Record<string, unknown>;
    resolvedRealm: OgRealm | null;
}

const fetchEntityJson = async (path: string): Promise<EntityFetchResult | null> => {
    try {
        const response = await fetch(`${API_ORIGIN}${path}`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            return null;
        }

        const payload = await response.json();
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        const headerRealm = (response.headers?.get?.(RESOLVED_REALM_HEADER) ?? '').toLowerCase();
        const resolvedRealm = headerRealm === 'na' || headerRealm === 'eu' || headerRealm === 'asia'
            ? headerRealm
            : null;

        return { payload: payload as Record<string, unknown>, resolvedRealm };
    } catch {
        // Timeout, upstream down, malformed body: the caller renders name-only.
        return null;
    }
};

const finiteNumber = (value: unknown): number | null => {
    const numeric = typeof value === 'string' ? Number(value) : value;
    return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null;
};

export interface PlayerOgCard {
    winRate: number | null;
    battles: number | null;
    daysSinceLastBattle: number | null;
    clanTag: string | null;
    isHidden: boolean;
    /**
     * The realm the backend actually resolved, which can differ from the one asked
     * for: a bare `/player/Name` link carries no `?realm=`, so metadata defaults to
     * na and the backend's cross-realm fallback finds the account elsewhere. Using
     * this for the card's kicker keeps the label honest.
     */
    resolvedRealm: OgRealm | null;
}

export const fetchPlayerOgCard = async (
    playerName: string,
    realm: OgRealm,
): Promise<PlayerOgCard | null> => {
    const result = await fetchEntityJson(
        `/api/player/${encodeURIComponent(playerName)}/?realm=${realm}`,
    );

    if (!result) {
        return null;
    }

    const { payload, resolvedRealm } = result;

    // A hidden account renders a "stats hidden" placeholder on the page itself,
    // so the card must not imply numbers exist.
    const isHidden = payload.is_hidden === true;
    const clanTag = typeof payload.clan_tag === 'string' && payload.clan_tag ? payload.clan_tag : null;

    return {
        winRate: isHidden ? null : finiteNumber(payload.pvp_ratio),
        battles: isHidden ? null : finiteNumber(payload.pvp_battles),
        daysSinceLastBattle: isHidden ? null : finiteNumber(payload.days_since_last_battle),
        clanTag,
        isHidden,
        resolvedRealm,
    };
};

export interface ClanOgCard {
    name: string | null;
    tag: string | null;
    membersCount: number | null;
    winRate: number | null;
}

export const fetchClanOgCard = async (clanId: number, realm: OgRealm): Promise<ClanOgCard | null> => {
    const result = await fetchEntityJson(`/api/clan/${clanId}?realm=${realm}`);

    if (!result) {
        return null;
    }

    const { payload } = result;

    return {
        name: typeof payload.name === 'string' && payload.name ? payload.name : null,
        tag: typeof payload.tag === 'string' && payload.tag ? payload.tag : null,
        membersCount: finiteNumber(payload.members_count),
        winRate: finiteNumber(payload.cached_clan_wr),
    };
};

/** 12,481 → "12,481"; keeps the number legible at card scale without abbreviating. */
export const formatOgCount = (value: number): string => Math.round(value).toLocaleString('en-US');

export const formatOgWinRate = (value: number): string => `${value.toFixed(1)}%`;

export const formatOgRecency = (days: number): string => {
    if (days <= 0) return 'played today';
    if (days === 1) return 'played yesterday';
    if (days < 30) return `played ${Math.round(days)}d ago`;
    if (days < 365) return `played ${Math.round(days / 30)}mo ago`;
    return 'inactive 1y+';
};

// ---------------------------------------------------------------------------
// Card composition. Kept pure and separate from the renderer so the decision
// logic (which stats appear, what a hidden account shows, what happens when the
// fetch misses) is unit-testable without invoking Satori.
// ---------------------------------------------------------------------------

export const buildPlayerCardProps = (
    playerName: string,
    card: PlayerOgCard | null,
    realm: OgRealm,
): OgCardLayoutProps => {
    const stats: OgStat[] = [];

    if (card && !card.isHidden) {
        if (card.winRate !== null) {
            stats.push({ label: 'Win rate', value: formatOgWinRate(card.winRate), winRate: card.winRate });
        }
        if (card.battles !== null) {
            stats.push({ label: 'Random battles', value: formatOgCount(card.battles) });
        }
        if (card.daysSinceLastBattle !== null) {
            stats.push({ label: 'Recency', value: formatOgRecency(card.daysSinceLastBattle) });
        }
    }

    // Label the realm the account actually lives in, not the one the link guessed.
    const labelledRealm = card?.resolvedRealm ?? realm;

    return {
        kicker: `Player · ${labelledRealm.toUpperCase()}`,
        title: playerName,
        subtitle: card?.clanTag ? `[${card.clanTag}]` : null,
        stats,
        fallbackNote: card?.isHidden
            ? 'Profile hidden by the player'
            : 'Win rate, battles, ships, ranked, and clan battles',
    };
};

export const buildClanCardProps = (
    label: string,
    card: ClanOgCard | null,
    realm: OgRealm,
): OgCardLayoutProps => {
    const stats: OgStat[] = [];

    if (card?.winRate != null) {
        stats.push({ label: 'Clan win rate', value: formatOgWinRate(card.winRate), winRate: card.winRate });
    }
    if (card?.membersCount != null) {
        stats.push({ label: 'Members', value: formatOgCount(card.membersCount) });
    }

    // Plenty of clans use the tag as the name ("[PRIDE] PRIDE" reads as a bug).
    const redundantName = card?.tag && card?.name
        && card.tag.trim().toLowerCase() === card.name.trim().toLowerCase();

    return {
        kicker: `Clan · ${realm.toUpperCase()}`,
        title: card?.tag && card?.name
            ? (redundantName ? `[${card.tag}]` : `[${card.tag}] ${card.name}`)
            : label,
        subtitle: null,
        stats,
        fallbackNote: 'Roster activity, clan battles, and member win rates',
    };
};

export const buildDefaultCardProps = (): OgCardLayoutProps => ({
    kicker: 'WoWs Battlestats',
    title: 'World of Warships stats',
    subtitle: null,
    stats: [],
    fallbackNote: 'Player and clan statistics, ship standings, battle history',
});

// ---------------------------------------------------------------------------
// Ship-standings cards (the Share buttons on the ship list and the drill-down
// player board).
//
// These replace the payload-free ship card that shipped 2026-07-29. That card
// was data-free on the stated grounds that "the leaderboard aggregation is far
// too heavy to run per scrape". Measured 2026-08-20 against production, that no
// longer holds: /api/realm/<realm>/ships and /api/realm/<realm>/ship/<id>/
// leaderboard are both cache-first and serve warm in ~150ms -- the same call the
// /ship page already makes on every visit -- and a scrape is further bounded by
// this route's 1h ISR and the 2s abort below. The cost is one cached read per
// URL per hour.
//
// The ordering must match whatever the sharer was looking at, so both builders
// take a resolved sort and rank with the SAME comparator the tables use
// (lib/tableSort). A second comparator here would drift, and the drift would
// only ever be visible in a Discord preview nobody re-checks.
//
// Runbook: agents/runbooks/runbook-shareable-ship-leaderboard-2026-08-20.md
// ---------------------------------------------------------------------------

/** How many entries a card shows. Three fit the 1200px card without wrapping. */
export const OG_TOP_N = 3;

/**
 * Names are rendered uppercase at 24px in a fixed row of three; past this they
 * push the row wider than the card. Capped here rather than in the layout so the
 * decision stays unit-testable.
 */
const MAX_ENTRY_LABEL = 18;

const truncateLabel = (value: string): string =>
    value.length > MAX_ENTRY_LABEL ? `${value.slice(0, MAX_ENTRY_LABEL - 1)}…` : value;

export interface OgShipRow {
    ship_id: number;
    ship_name: string;
    battles: number;
    win_rate: number;
    avg_damage: number;
    kills_per_battle: number;
}

export interface OgPlayerRow {
    rank: number;
    player_name: string;
    win_rate: number;
    battles: number;
    avg_damage: number;
    kills_per_battle: number;
}

export interface ShipListOgCard {
    rows: OgShipRow[];
    windowDays: number | null;
    /**
     * A cold win-rate-percentile bucket is still being aggregated in the
     * background. It carries no rows and otherwise reads exactly like an empty
     * bucket, so every consumer must branch on this BEFORE row count.
     */
    pending: boolean;
}

export interface ShipBoardOgCard {
    shipName: string | null;
    tier: number | null;
    rows: OgPlayerRow[];
    windowDays: number | null;
}

const rowsOf = (payload: Record<string, unknown>, key: string): Record<string, unknown>[] =>
    Array.isArray(payload[key]) ? (payload[key] as Record<string, unknown>[]) : [];

export const fetchShipListOgCard = async (
    realm: OgRealm,
    tier: Tier,
    type: ShipType,
    wrPct: WrPct,
): Promise<ShipListOgCard | null> => {
    const wrParam = wrPct === null ? '' : `&wr_pct=${wrPct}`;
    const result = await fetchEntityJson(
        `/api/realm/${realm}/ships?tier=${tier}&type=${encodeURIComponent(type)}${wrParam}`,
    );
    if (!result) {
        return null;
    }

    const { payload } = result;
    return {
        pending: payload.pending === true,
        windowDays: finiteNumber(payload.window_days),
        rows: rowsOf(payload, 'ships').map((s) => ({
            ship_id: finiteNumber(s.ship_id) ?? 0,
            ship_name: typeof s.ship_name === 'string' ? s.ship_name : '',
            battles: finiteNumber(s.battles) ?? 0,
            win_rate: finiteNumber(s.win_rate) ?? 0,
            avg_damage: finiteNumber(s.avg_damage) ?? 0,
            kills_per_battle: finiteNumber(s.kills_per_battle) ?? 0,
        })),
    };
};

export const fetchShipBoardOgCard = async (
    shipId: number,
    realm: OgRealm,
): Promise<ShipBoardOgCard | null> => {
    const result = await fetchEntityJson(`/api/realm/${realm}/ship/${shipId}/leaderboard`);
    if (!result) {
        return null;
    }

    const { payload } = result;
    const ship = (payload.ship ?? {}) as Record<string, unknown>;
    return {
        shipName: typeof ship.name === 'string' && ship.name ? ship.name : null,
        tier: finiteNumber(ship.tier),
        windowDays: finiteNumber(payload.window_days),
        rows: rowsOf(payload, 'players').map((p) => ({
            rank: finiteNumber(p.rank) ?? 0,
            player_name: typeof p.player_name === 'string' ? p.player_name : '',
            win_rate: finiteNumber(p.win_rate) ?? 0,
            battles: finiteNumber(p.battles) ?? 0,
            avg_damage: finiteNumber(p.avg_damage) ?? 0,
            kills_per_battle: finiteNumber(p.kills_per_battle) ?? 0,
        })),
    };
};

// How each sortable column reads on a card, and whether its value is a win rate
// (the only metric the layout tints on the WR scale -- tinting a damage figure
// green because the win rate is high would be a lie the reader cannot see).
const METRIC_RENDERERS: Record<
    string,
    { noun: string; format: (row: Record<string, number>) => string; isWinRate?: boolean }
> = {
    win_rate: { noun: 'win rate', format: (r) => formatOgWinRate(r.win_rate), isWinRate: true },
    battles: { noun: 'battles', format: (r) => formatOgCount(r.battles) },
    avg_damage: { noun: 'average damage', format: (r) => formatOgCount(r.avg_damage) },
    kills_per_battle: { noun: 'kills per battle', format: (r) => r.kills_per_battle.toFixed(2) },
};

/**
 * Resolve the metric a card should display. Name columns and the natural server
 * order (`sort === null`) have no meaningful number of their own, so both fall
 * back to win rate -- a card headlined by alphabetical position would be absurd.
 * `naturalNoun` describes that fallback ordering in the subtitle.
 */
const resolveMetric = (sortKey: string | null | undefined) =>
    (sortKey && METRIC_RENDERERS[sortKey]) || METRIC_RENDERERS.win_rate;

const entryStats = (
    rows: Record<string, number>[],
    labels: string[],
    sortKey: string | null | undefined,
): OgStat[] => {
    const metric = resolveMetric(sortKey);
    return rows.slice(0, OG_TOP_N).map((row, i) => ({
        label: truncateLabel(labels[i]),
        value: metric.format(row),
        winRate: metric.isWinRate ? row.win_rate : null,
    }));
};

const windowNote = (windowDays: number | null): string =>
    windowDays ? `rolling ${windowDays} days` : 'current rolling window';

/** "Ranked by win rate · rolling 60 days", or the natural-order phrasing. */
const rankedSubtitle = (
    sortKey: string | null | undefined,
    naturalNoun: string,
    windowDays: number | null,
): string => {
    const noun = sortKey && METRIC_RENDERERS[sortKey] ? METRIC_RENDERERS[sortKey].noun : naturalNoun;
    return `Ranked by ${noun} · ${windowNote(windowDays)}`;
};

export const buildShipListCardProps = (
    tier: Tier,
    type: ShipType,
    wrPct: WrPct,
    card: ShipListOgCard | null,
    realm: OgRealm,
    sort: { key: string; dir: SortDir } | null,
): OgCardLayoutProps => {
    const bucket = shipBucketLabel(tier, type);
    const kicker = wrPct === null
        ? `Ships · ${realm.toUpperCase()}`
        : `Ships · ${realm.toUpperCase()} · Top ${wrPct}%`;

    // `pending` BEFORE row count: a cold percentile bucket returns no rows and is
    // indistinguishable from an empty one, and this route's contract is that it
    // always renders a card.
    if (card?.pending) {
        return {
            kicker,
            title: bucket,
            subtitle: null,
            stats: [],
            fallbackNote: 'Standings for this bracket are being computed',
        };
    }

    const rows = applySort(card?.rows ?? [], sort as { key: keyof OgShipRow; dir: SortDir } | null);
    const stats = entryStats(
        rows as unknown as Record<string, number>[],
        rows.map((r) => r.ship_name),
        sort?.key,
    );

    return {
        kicker,
        title: bucket,
        subtitle: stats.length ? rankedSubtitle(sort?.key, 'win rate', card?.windowDays ?? null) : null,
        stats,
        fallbackNote: stats.length ? null : 'Win rate, battles, and average damage by ship',
    };
};

export const buildShipBoardCardProps = (
    label: string,
    card: ShipBoardOgCard | null,
    realm: OgRealm,
    sort: { key: string; dir: SortDir } | null,
): OgCardLayoutProps => {
    const title = card?.shipName ?? label;
    const kicker = card?.tier ? `Ship · T${card.tier} · ${realm.toUpperCase()}` : `Ship · ${realm.toUpperCase()}`;

    const rows = applySort(card?.rows ?? [], sort as { key: keyof OgPlayerRow; dir: SortDir } | null);
    const stats = entryStats(
        rows as unknown as Record<string, number>[],
        rows.map((r) => r.player_name),
        sort?.key,
    );

    return {
        kicker,
        title,
        // "rank" is the board's natural order, so a rank sort and no sort at all
        // describe the same thing: standings position.
        subtitle: stats.length
            ? rankedSubtitle(sort?.key, 'standings rank', card?.windowDays ?? null)
            : 'Top players by win rate',
        stats,
        fallbackNote: null,
    };
};
