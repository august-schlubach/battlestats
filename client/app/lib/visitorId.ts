// Durable, opaque per-browser visitor id for first-party analytics.
//
// Umami's `session_id` is a salted hash of IP + user agent, so it rotates
// whenever the visitor's address does — and mobile carriers rotate constantly.
// That makes "returning visitor" unmeasurable over weeks, which is exactly the
// horizon the core-audience KPI runs on (≥4 active days in a rolling 28d
// window). A random UUID in localStorage is stable across that horizon instead.
//
// The value is opaque and random: no account linkage, no fingerprinting, no
// cross-site meaning. Clearing site data resets it. When storage is unavailable
// (Safari private mode, storage disabled) this returns null and the visit simply
// goes unidentified — a fresh id per page load would be worse than none, since
// it would inflate the very count the KPI reads.
//
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

const STORAGE_KEY = 'bs-vid';

let cached: string | null = null;

const randomUuid = (): string => {
    const cryptoRef = typeof crypto !== 'undefined' ? crypto : undefined;

    if (typeof cryptoRef?.randomUUID === 'function') {
        return cryptoRef.randomUUID();
    }

    // ios Safari below 15.4 ships getRandomValues but not randomUUID, and ios is
    // a meaningful slice of the audience — hand-assemble a v4 instead.
    if (typeof cryptoRef?.getRandomValues === 'function') {
        const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    // Last resort for browsers without any crypto: still id-shaped, still opaque.
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
};

/**
 * The stable visitor id for this browser, minting and persisting one on first
 * call. Returns null during SSR and whenever the id cannot be persisted.
 */
export const getVisitorId = (): string | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    if (cached) {
        return cached;
    }

    try {
        const existing = window.localStorage.getItem(STORAGE_KEY);
        if (existing) {
            cached = existing;
            return cached;
        }

        const minted = randomUuid();
        window.localStorage.setItem(STORAGE_KEY, minted);
        // Only adopt the id once the write succeeded, so an unpersistable id
        // never becomes a per-load pseudo-visitor.
        cached = minted;
        return cached;
    } catch {
        return null;
    }
};

/** Test seam: drops the in-memory memo so a fresh storage state is observed. */
export const resetVisitorIdCache = (): void => {
    cached = null;
};

export const VISITOR_ID_STORAGE_KEY = STORAGE_KEY;
