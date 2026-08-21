// Client-side row sorting, shared by the ship-leaderboard tables and the Open
// Graph card renderer.
//
// Extracted from ShipLeaderboard.tsx when the share buttons shipped: the OG card
// must rank the top 3 exactly the way the table the user shared ranked them, and
// two copies of this comparator would eventually disagree — silently, and only
// in a Discord preview nobody re-checks.
//
// Runbook: agents/runbooks/runbook-shareable-ship-leaderboard-2026-08-20.md

export type SortDir = 'asc' | 'desc';

/**
 * Stable-enough column sort over already-fetched rows. Strings compare by
 * locale; everything else is coerced to Number. Returns a new array — callers
 * memoize on (rows, sort), so mutating the input would defeat that.
 */
export function sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
    const factor = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (typeof av === 'string' && typeof bv === 'string') {
            return av.localeCompare(bv) * factor;
        }
        return (Number(av) - Number(bv)) * factor;
    });
}

/**
 * Apply a possibly-absent sort. `null` preserves the server's natural order
 * (win rate for the ship list, rank for the player board), which is the state
 * every table starts in before a header is clicked — so the OG route must honour
 * it rather than inventing a default ordering of its own.
 */
export function applySort<T>(rows: T[], sort: { key: keyof T; dir: SortDir } | null): T[] {
    return sort ? sortRows(rows, sort.key, sort.dir) : rows;
}

/**
 * Resolve a sort from untrusted URL params against the columns a given table
 * actually has. An unknown key or direction yields `null` (natural order) rather
 * than throwing or guessing, because the caller is a shared link that may have
 * been hand-edited or built by an older client.
 *
 * `dir` defaults per column type when omitted, matching the table's own
 * open-direction rule: text ascending (A→Z), numeric descending (best first).
 */
export function parseSort<T>(
    key: string | null | undefined,
    dir: string | null | undefined,
    sortableKeys: ReadonlyArray<keyof T>,
    textKeys: ReadonlyArray<keyof T>,
): { key: keyof T; dir: SortDir } | null {
    if (!key) return null;
    const match = sortableKeys.find((k) => k === key);
    if (match === undefined) return null;
    if (dir === 'asc' || dir === 'desc') {
        return { key: match, dir };
    }
    return { key: match, dir: textKeys.includes(match) ? 'asc' : 'desc' };
}
