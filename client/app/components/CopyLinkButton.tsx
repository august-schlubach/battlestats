'use client';

import React, { useEffect, useState } from 'react';
import { useRealm } from '../context/RealmContext';
import { trackEvent } from '../lib/umami';

// The one in-product handle for word of mouth: copies the canonical,
// realm-qualified URL of the page you are on.
//
// Restored 2026-07-29 after commit ff6677e ("drop Share/Back", 2026-06-24)
// removed the player and clan Share buttons. Word of mouth is the site's stated
// growth channel and it had no surface at all in the interim. Measured usage
// before removal was small (player-share: 14 events / 12 visitors; clan-share:
// zero), so this is obstacle removal, not a growth lever — single-digit weekly
// usage is the expected outcome, not a failure.
//
// The two former call sites duplicated this logic verbatim; it lives here once.
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

const FEEDBACK_DURATION_MS = 1800;

type CopyState = 'idle' | 'copied' | 'failed';

interface CopyLinkButtonProps {
    /** Umami event name; the player/clan names are kept identical to the pre-removal ones so the historical series reconnects. */
    eventName: 'player-share' | 'clan-share' | 'ship-list-share' | 'ship-board-share';
    ariaLabel: string;
    label?: string;
    /**
     * Path or absolute URL to copy instead of the current address. The ship
     * boards need this: the leaderboard's view state (bucket, percentile, column
     * sort) lives in component state on the landing page, so the address bar is
     * not the thing worth sharing. A relative path is resolved against the
     * current origin. Omitted, the button copies the page you are on.
     */
    url?: string;
}

const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({ eventName, ariaLabel, label = 'Share', url: target }) => {
    const { realm } = useRealm();
    const [copyState, setCopyState] = useState<CopyState>('idle');

    useEffect(() => {
        if (copyState === 'idle') {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setCopyState('idle');
        }, FEEDBACK_DURATION_MS);

        return () => window.clearTimeout(timeoutId);
    }, [copyState]);

    const handleCopy = async () => {
        trackEvent(eventName, { realm });

        try {
            const url = new URL(target ?? window.location.href, window.location.href);
            if (!url.searchParams.has('realm')) {
                // A shared link must carry the realm, or the recipient may land
                // on a different realm's view of the same name. The ship-board
                // callers build their own realm-qualified `url` and so never
                // reach this branch; it still covers the player/clan pages,
                // which copy whatever address the visitor happens to be on.
                url.searchParams.set('realm', realm);
            }
            // Absent on insecure origins and in some in-app browsers, which is
            // why the failed branch stays.
            await navigator.clipboard.writeText(url.toString());
            setCopyState('copied');
        } catch (error) {
            console.error(`Failed to copy ${eventName} URL:`, error);
            setCopyState('failed');
        }
    };

    return (
        <div className="flex items-center gap-2 self-start">
            <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--accent-mid)] transition-colors hover:bg-[var(--accent-faint)]"
                aria-label={ariaLabel}
            >
                {label}
            </button>
            {copyState === 'copied' ? (
                <span className="text-xs font-medium text-[var(--accent-mid)]" role="status">Copied</span>
            ) : null}
            {copyState === 'failed' ? (
                <span className="text-xs font-medium text-red-600 dark:text-red-400" role="status">Copy failed</span>
            ) : null}
        </div>
    );
};

export default CopyLinkButton;
