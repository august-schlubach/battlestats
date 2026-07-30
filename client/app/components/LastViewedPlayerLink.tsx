'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildPlayerPath } from '../lib/entityRoutes';
import { trackEvent } from '../lib/umami';
import { readLastViewedPlayer, type LastViewedPlayer } from '../lib/lastViewedPlayer';

// A one-click way back to the profile this browser last opened.
//
// Renders nothing for a first-time visitor and nothing during SSR: the value is
// read after mount so the server and client markup agree (a localStorage read in
// render would be a hydration mismatch), and the empty state occupies no space,
// so the landing page does not shift for anyone who has no history.
//
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

const LastViewedPlayerLink: React.FC = () => {
    const [lastViewed, setLastViewed] = useState<LastViewedPlayer | null>(null);

    useEffect(() => {
        setLastViewed(readLastViewedPlayer());
    }, []);

    if (!lastViewed) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span>Last viewed</span>
            <Link
                href={buildPlayerPath(lastViewed.name, lastViewed.realm)}
                onClick={() => trackEvent('landing-last-player', { realm: lastViewed.realm })}
                className="font-medium text-[var(--accent-mid)] underline-offset-2 hover:underline"
                data-testid="last-viewed-player-link"
            >
                {lastViewed.name}
            </Link>
            <span className="uppercase tracking-wide text-xs text-[var(--text-secondary)]">
                {lastViewed.realm}
            </span>
        </div>
    );
};

export default LastViewedPlayerLink;
