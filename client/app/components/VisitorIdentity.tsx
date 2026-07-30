'use client';

import { useEffect } from 'react';
import { identifyVisitor } from '../lib/umami';
import { getVisitorId } from '../lib/visitorId';

// Renders nothing; its only job is to hand the durable visitor id to the Umami
// tracker once per page load.
//
// The tracker tag is `<script defer>` in <head> (layout.tsx), so window.umami is
// routinely absent at mount. Hence a bounded poll: a fixed interval with a hard
// attempt ceiling, never an open-ended retry loop.
//
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

const POLL_INTERVAL_MS = 200;
const MAX_ATTEMPTS = 25; // ~5s ceiling, then give up silently.

const VisitorIdentity: React.FC = () => {
    useEffect(() => {
        const visitorId = getVisitorId();
        if (!visitorId) {
            // Storage unavailable: leave the session unidentified rather than
            // minting a throwaway id that would inflate the visitor count.
            return;
        }

        if (typeof window.umami?.identify === 'function') {
            identifyVisitor(visitorId);
            return;
        }

        let attempts = 0;
        const timerId = window.setInterval(() => {
            attempts += 1;

            if (typeof window.umami?.identify === 'function') {
                identifyVisitor(visitorId);
                window.clearInterval(timerId);
                return;
            }

            if (attempts >= MAX_ATTEMPTS) {
                window.clearInterval(timerId);
            }
        }, POLL_INTERVAL_MS);

        return () => window.clearInterval(timerId);
    }, []);

    return null;
};

export default VisitorIdentity;
