// Thin, SSR-safe wrapper around Umami's custom-event API.
//
// Umami is injected only in layout.tsx behind an env flag, so `window.umami`
// may be absent (SSR, flag off, blocked). This wrapper no-ops in those cases so
// callers never have to guard, and it swallows any tracker error — analytics
// must never throw into the UI.
//
// Conventions: kebab-case event names; keep the property set small and
// low-cardinality (Umami event-data drives dashboard breakdowns, not
// high-cardinality lookups). Surface these in the Umami "Events" report.

type UmamiEventData = Record<string, string | number | boolean>;

declare global {
    interface Window {
        umami?: {
            track: (event: string, data?: UmamiEventData) => void;
            // Optional because the tracker only exposes it from Umami 2.x with
            // the distinct_id migration applied; treat absence as "no identity".
            identify?: (visitorId: string, data?: UmamiEventData) => void;
        };
    }
}

export const trackEvent = (event: string, data?: UmamiEventData): void => {
    if (typeof window === 'undefined') return;
    try {
        window.umami?.track(event, data);
    } catch {
        // Never let analytics break the page.
    }
};

// Same event, but tolerant of the tracker not having loaded yet.
//
// trackEvent silently drops the call when window.umami is absent, which is the
// right contract for a click handler (the visitor is here; the tracker either
// arrived or it did not) and the wrong one for anything firing on mount: the
// tracker tag is `<script defer>`, so a mount-time call routinely lands before
// it exists and the event is lost. Polls on a fixed interval with a hard
// attempt ceiling — never an open-ended retry loop — and returns a canceller
// for the caller's effect cleanup.
//
// VisitorIdentity keeps its own copy of this loop deliberately: it probes for
// `identify`, a capability that can be absent from a tracker whose `track`
// works fine, and it guards a live KPI (session.distinct_id).
const TRACKER_POLL_INTERVAL_MS = 200;
const TRACKER_MAX_ATTEMPTS = 25; // ~5s ceiling, then give up silently.

export const trackWhenReady = (event: string, data?: UmamiEventData): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;

    if (typeof window.umami?.track === 'function') {
        trackEvent(event, data);
        return () => undefined;
    }

    let attempts = 0;
    const timerId = window.setInterval(() => {
        attempts += 1;

        if (typeof window.umami?.track === 'function') {
            trackEvent(event, data);
            window.clearInterval(timerId);
            return;
        }

        if (attempts >= TRACKER_MAX_ATTEMPTS) {
            window.clearInterval(timerId);
        }
    }, TRACKER_POLL_INTERVAL_MS);

    return () => window.clearInterval(timerId);
};

// Attaches a durable visitor id to this Umami session, which is what turns
// "returning visitor" into a measurable quantity (session_id is an IP+UA hash
// and rotates on its own). The deployed tracker's identify(id) assigns a
// module-scoped id that rides along on every later payload and POSTs one
// `identify` request, which is what persists session.distinct_id.
export const identifyVisitor = (visitorId: string): void => {
    if (typeof window === 'undefined') return;
    try {
        window.umami?.identify?.(visitorId);
    } catch {
        // Same contract as trackEvent: analytics never throws into the UI.
    }
};
