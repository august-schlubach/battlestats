'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildPlayerPath } from '../lib/entityRoutes';
import { useT } from '../context/LocaleContext';
import { trackEvent } from '../lib/umami';
import { readLastViewedPlayers, type LastViewedPlayer } from '../lib/lastViewedPlayer';

// A one-click way back to the profiles this browser last opened (up to three,
// most recent first).
//
// Renders nothing for a first-time visitor and nothing during SSR: the value is
// read after mount so the server and client markup agree (a localStorage read in
// render would be a hydration mismatch), and the empty state occupies no space,
// so the landing page does not shift for anyone who has no history.
//
// The realm is not labelled — it rides in the href, and the row reads as a list
// of names. The residual cost is a genuine same-name account on two realms
// rendering twice identically; both links still resolve correctly.
//
// Spec: agents/work-items/landing-recent-players-spec.md
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

// Middle dot (U+00B7), written as an escape rather than the literal glyph so it
// survives any editor or pipeline that is not confidently UTF-8.
const SEPARATOR = '\u00B7';

const LastViewedPlayerLink: React.FC = () => {
    const t = useT();
    const [lastViewed, setLastViewed] = useState<LastViewedPlayer[]>([]);

    useEffect(() => {
        setLastViewed(readLastViewedPlayers());
    }, []);

    if (lastViewed.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span>{t('footer.lastViewed')}</span>
            {lastViewed.map((entry, index) => (
                <React.Fragment key={`${entry.realm}:${entry.name.toLowerCase()}`}>
                    {index > 0 && (
                        // Decorative: the gap already separates the names for a
                        // screen reader, so the glyph is not announced.
                        <span aria-hidden="true" data-testid="last-viewed-separator">
                            {SEPARATOR}
                        </span>
                    )}
                    <Link
                        href={buildPlayerPath(entry.name, entry.realm)}
                        // position rides along so slots 2 and 3 can later be shown
                        // to earn their space; the event name is unchanged so the
                        // existing Umami history stays comparable.
                        onClick={() => trackEvent('landing-last-player', {
                            realm: entry.realm,
                            position: index + 1,
                        })}
                        className="font-medium text-[var(--accent-mid)] underline-offset-2 hover:underline"
                        data-testid="last-viewed-player-link"
                    >
                        {entry.name}
                    </Link>
                </React.Fragment>
            ))}
        </div>
    );
};

export default LastViewedPlayerLink;
