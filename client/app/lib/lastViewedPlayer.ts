// Remembers the last player profile this browser actually opened, so the landing
// page can offer a one-click way back.
//
// Why: 44.5% of visits are a single pageview with zero interaction in under ten
// seconds, concentrated on `/`, and a cold landing arrival has to type a name
// before the site shows it anything. Meanwhile 43 returning visitors produce 41%
// of all pageviews — they are the population this serves. First-time visitors see
// nothing extra.
//
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

const STORAGE_KEY = 'bs-last-player';

const VALID_REALMS = ['na', 'eu', 'asia'] as const;

export type LastViewedRealm = (typeof VALID_REALMS)[number];

export interface LastViewedPlayer {
    name: string;
    realm: LastViewedRealm;
}

const isValidRealm = (value: unknown): value is LastViewedRealm =>
    typeof value === 'string' && (VALID_REALMS as readonly string[]).includes(value);

export const rememberLastViewedPlayer = (name: string, realm: string): void => {
    if (typeof window === 'undefined') {
        return;
    }

    const trimmed = (name || '').trim();
    if (!trimmed || !isValidRealm(realm)) {
        return;
    }

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: trimmed, realm }));
    } catch {
        // Storage unavailable: the affordance simply never appears.
    }
};

export const readLastViewedPlayer = (): LastViewedPlayer | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const { name, realm } = parsed as { name?: unknown; realm?: unknown };
        if (typeof name !== 'string' || !name.trim() || !isValidRealm(realm)) {
            return null;
        }

        return { name: name.trim(), realm };
    } catch {
        // Corrupt or unreadable value: treat as absent rather than throwing on a
        // cold landing render.
        return null;
    }
};

export const forgetLastViewedPlayer = (): void => {
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
