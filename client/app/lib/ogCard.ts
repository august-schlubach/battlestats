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

// Ship cards are payload-free by design: the slug already carries the name, and
// the leaderboard aggregation is far too heavy to run per scrape for a surface
// drawing ~50 pageviews a fortnight.
export const buildShipCardProps = (label: string, realm: OgRealm): OgCardLayoutProps => ({
    kicker: `Ship · ${realm.toUpperCase()}`,
    title: label,
    subtitle: 'Top players by win rate, rolling 30-day window',
    // The subtitle already carries the explanation, so no second note.
    stats: [],
    fallbackNote: null,
});

export const buildDefaultCardProps = (): OgCardLayoutProps => ({
    kicker: 'WoWs Battlestats',
    title: 'World of Warships stats',
    subtitle: null,
    stats: [],
    fallbackNote: 'Player and clan statistics, ship standings, battle history',
});
