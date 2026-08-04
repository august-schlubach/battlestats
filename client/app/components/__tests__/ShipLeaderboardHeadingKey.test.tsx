import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ShipLeaderboard from '../ShipLeaderboard';
import { fetchSharedJson } from '../../lib/sharedJsonFetch';

// Fix 2 regression net: `landing.shipLeaderboard.heading` used to drive ONLY
// the <h2>'s aria-label while the visible JSX rendered hardcoded English
// literals — latent today only because ko.ts/ja.ts both omit this key (a
// structural blocker, not a vocabulary gap; see the research doc), so a plain
// English-locale test can't tell the two sources apart: the hardcoded text
// and the key's English value are identical strings. This file overrides
// `translate()` for exactly this one key (everything else passes through
// real translation) so the test exercises a NON-English value without
// needing a live ko/ja dictionary entry, a LocaleProvider, or locale-switch
// mount timing — precedent for intercepting the module useT() resolves
// through is LocaleContext.test.tsx's `translateMock`.
const MARKER_TEMPLATE = 'MARKER HEADING{suffix}';
const interpolateMarker = (vars?: Record<string, string | number>): string =>
    MARKER_TEMPLATE.replace(/\{(\w+)\}/g, (match, name: string) =>
        (vars && name in vars) ? String(vars[name]) : match);

jest.mock('../../i18n', () => {
    const actual = jest.requireActual('../../i18n');
    return {
        ...actual,
        translate: (locale: string, key: string, vars?: Record<string, string | number>) =>
            key === 'landing.shipLeaderboard.heading'
                ? interpolateMarker(vars)
                : actual.translate(locale, key, vars),
    };
});

jest.mock('../../lib/sharedJsonFetch', () => ({ fetchSharedJson: jest.fn() }));
jest.mock('../../context/RealmContext', () => ({ useRealm: () => ({ realm: 'na' }) }));
jest.mock('../../lib/umami', () => ({ trackEvent: jest.fn() }));
jest.mock('../SubmarineEasterEgg', () => ({ __esModule: true, default: () => null }));
jest.mock('../CarrierEasterEgg', () => ({ __esModule: true, default: () => null }));

const mockFetch = fetchSharedJson as jest.MockedFunction<typeof fetchSharedJson>;

const visibleHeadingText = (heading: HTMLElement): string => {
    const tooltip = heading.querySelector('[role="tooltip"]');
    return heading.textContent!.replace(tooltip?.textContent ?? '', '');
};

describe('ShipLeaderboard heading — single-source regression net', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        localStorage.clear();
        Element.prototype.scrollIntoView = jest.fn();
    });

    it('the VISIBLE text tracks a non-English translate() value, matching the aria-label exactly', async () => {
        mockFetch.mockImplementation(() => Promise.resolve({
            data: {
                realm: 'na', tier: 10, ship_type: 'Battleship', ships: [],
                window_start: '2026-06-20', window_end: '2026-08-04',
            },
        } as never));
        render(<ShipLeaderboard />);
        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
        const heading = await screen.findByRole('heading', { name: /MARKER HEADING/ });
        const ariaLabel = heading.getAttribute('aria-label');
        const visible = visibleHeadingText(heading);
        expect(ariaLabel).toBe('MARKER HEADING · last 45 days rolling');
        // The invariant Fix 2 establishes: whatever translate() returns for
        // this key becomes BOTH the accessible name and the visible copy.
        // Before the fix, `visible` would have stayed the hardcoded English
        // "Ship leaderboard · last 45 days rolling" here instead.
        expect(visible).toBe(ariaLabel);
        expect(visible).toBe('MARKER HEADING · last 45 days rolling');
    });
});
