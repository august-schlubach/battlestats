// Remembers the player profiles this browser actually opened, most recent first,
// so the landing page can offer a one-click way back to any of them.
//
// Why: 44.5% of visits are a single pageview with zero interaction in under ten
// seconds, concentrated on `/`, and a cold landing arrival has to type a name
// before the site shows it anything. Meanwhile 43 returning visitors produce 41%
// of all pageviews — they are the population this serves. First-time visitors see
// nothing extra.
//
// Widened from a single entry to three (2026-07-30): a visitor who follows their
// own account, a clanmate and a rival got one click back to exactly one of them.
// Spec: agents/work-items/landing-recent-players-spec.md
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

const STORAGE_KEY = 'bs-last-player';

const VALID_REALMS = ['na', 'eu', 'asia'] as const;

export const MAX_LAST_VIEWED_PLAYERS = 3;

export type LastViewedRealm = (typeof VALID_REALMS)[number];

export interface LastViewedPlayer {
    name: string;
    realm: LastViewedRealm;
}

const isValidRealm = (value: unknown): value is LastViewedRealm =>
    typeof value === 'string' && (VALID_REALMS as readonly string[]).includes(value);

// A player is the same player across visits regardless of how the name was cased
// in the URL: the write falls back to the segment the visitor typed when the
// payload carries no canonical name.
const identityOf = (entry: LastViewedPlayer): string =>
    `${entry.realm}:${entry.name.toLowerCase()}`;

const parseEntry = (value: unknown): LastViewedPlayer | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const { name, realm } = value as { name?: unknown; realm?: unknown };
    if (typeof name !== 'string' || !name.trim() || !isValidRealm(realm)) {
        return null;
    }

    return { name: name.trim(), realm };
};

export const readLastViewedPlayers = (): LastViewedPlayer[] => {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }

        const parsed: unknown = JSON.parse(raw);

        // Array.isArray separates the current shape from the single-object value
        // this key held before the list landed. Reading the legacy shape rather
        // than rejecting it means returning visitors — the population the whole
        // affordance exists for — keep their remembered player across the deploy.
        const entries = Array.isArray(parsed) ? parsed : [parsed];

        // Validate per entry: one corrupt element drops itself, not the history.
        return entries
            .map(parseEntry)
            .filter((entry): entry is LastViewedPlayer => entry !== null)
            .slice(0, MAX_LAST_VIEWED_PLAYERS);
    } catch {
        // Corrupt or unreadable value: treat as absent rather than throwing on a
        // cold landing render.
        return [];
    }
};

export const rememberLastViewedPlayer = (name: string, realm: string): void => {
    if (typeof window === 'undefined') {
        return;
    }

    const trimmed = (name || '').trim();
    if (!trimmed || !isValidRealm(realm)) {
        return;
    }

    const entry: LastViewedPlayer = { name: trimmed, realm };

    try {
        // Move-to-front rather than append: without it, three visits to one player
        // fill every slot with the same person, which is worse than one slot was.
        // The freshly stored spelling wins so the row reflects the latest visit.
        const next = [
            entry,
            ...readLastViewedPlayers().filter(
                (stored) => identityOf(stored) !== identityOf(entry),
            ),
        ].slice(0, MAX_LAST_VIEWED_PLAYERS);

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Storage unavailable: the affordance simply never appears.
    }
};

export const forgetLastViewedPlayers = (): void => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to do.
    }
};

export const LAST_VIEWED_PLAYER_STORAGE_KEY = STORAGE_KEY;
