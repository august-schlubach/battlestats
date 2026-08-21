'use client';

import React from 'react';
import ShipLeaderboard, { type ShipLeaderboardInitialView } from '../../components/ShipLeaderboard';
import { shipBucketLabel } from '../../lib/entityRoutes';

// Client half of the shareable ship-standings route. The page component owns the
// metadata (and therefore the Open Graph card); this owns the interactive board.
//
// It renders the SAME ShipLeaderboard the landing page does, seeded from the
// URL, rather than a parallel implementation — a second copy of this table would
// be the thing that eventually disagrees with the card it links to.
//
// Runbook: agents/runbooks/runbook-shareable-ship-leaderboard-2026-08-20.md

const ShipBucketRouteView: React.FC<{ initial: ShipLeaderboardInitialView }> = ({ initial }) => (
    <div className="w-full bg-[var(--bg-page)]">
        <div className="w-full text-[var(--text-primary)]">
            {/* Indexability was half the reason this route exists, and the board
                below only carries an h2 section heading. The h1 states the page
                subject once, matching the /ship page's masthead treatment.
                It does NOT track the pills: this is the bucket the URL named,
                and the canonical points at that bucket. */}
            <h1 className="mt-[25px] mb-3 text-3xl font-semibold tracking-tight text-[var(--accent-dark)]">
                Best {shipBucketLabel(initial.tier, initial.type)}
            </h1>
            <ShipLeaderboard initial={initial} syncUrl />
        </div>
    </div>
);

export default ShipBucketRouteView;
