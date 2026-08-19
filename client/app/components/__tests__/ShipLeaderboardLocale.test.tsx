import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ShipLeaderboard from '../ShipLeaderboard';
import { fetchSharedJson } from '../../lib/sharedJsonFetch';
import { LocaleProvider } from '../../context/LocaleContext';

// Composed-template blocker regression net (follow-on #1 of the locale-toggle
// spec), the ShipLeaderboard half. Before this fix, the "· last N days
// rolling" clause was an English literal built in this component and handed
// to `landing.shipLeaderboard.heading` as an opaque {suffix} string — no
// dictionary could ever untranslate it, so a Korean/Japanese visitor would
// have seen "함선 리더보드 · last 60 days rolling" the moment that key shipped
// translated. These tests render under real ko/ja dictionaries (no
// translate() mock — see ShipLeaderboardHeadingKey.test.tsx for the marker
// technique that isolates the wiring itself) and assert the WHOLE heading is
// in the target language, both with and without a known standings window.

jest.mock('../../lib/sharedJsonFetch', () => ({ fetchSharedJson: jest.fn() }));
jest.mock('../../context/RealmContext', () => ({ useRealm: () => ({ realm: 'na' }) }));
jest.mock('../../lib/umami', () => ({ trackEvent: jest.fn() }));
jest.mock('../SubmarineEasterEgg', () => ({ __esModule: true, default: () => null }));
jest.mock('../CarrierEasterEgg', () => ({ __esModule: true, default: () => null }));

const mockFetch = fetchSharedJson as jest.MockedFunction<typeof fetchSharedJson>;

// Visible text alone (the section header <h2>), stripped of the info-hint
// tooltip's own text — same helper as ShipLeaderboardHeadingKey.test.tsx.
const visibleHeadingText = (heading: HTMLElement): string => {
    const tooltip = heading.querySelector('[role="tooltip"]');
    return heading.textContent!.replace(tooltip?.textContent ?? '', '');
};

const renderWithLocale = () => render(
    <LocaleProvider>
        <ShipLeaderboard />
    </LocaleProvider>,
);

const RAW_TOKEN_LEAK = /\{[a-zA-Z]+\}/;
const ENGLISH_CLAUSE_LEAK = /ship leaderboard|last \d|days rolling/i;

describe('ShipLeaderboard heading — locale coverage (composed-template blocker)', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        localStorage.clear();
        Element.prototype.scrollIntoView = jest.fn();
    });

    it('renders a fully-Korean heading with the window-suffix clause when the standings window is known', async () => {
        localStorage.setItem('bs-locale', 'ko');
        mockFetch.mockImplementation(() => Promise.resolve({
            data: {
                realm: 'na', tier: 10, ship_type: 'Battleship', ships: [],
                window_start: '2026-06-05', window_end: '2026-08-04',
            },
        } as never));
        renderWithLocale();
        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
        const heading = await screen.findByRole('heading', { name: /함선 리더보드/ });
        const ariaLabel = heading.getAttribute('aria-label');
        const visible = visibleHeadingText(heading);
        expect(ariaLabel).toBe('함선 리더보드 · 최근 60일');
        expect(visible).toBe(ariaLabel);
        expect(ariaLabel).not.toMatch(RAW_TOKEN_LEAK);
        expect(ariaLabel).not.toMatch(ENGLISH_CLAUSE_LEAK);
    });

    it('renders the plain Korean heading (no suffix) before a standings window resolves', () => {
        localStorage.setItem('bs-locale', 'ko');
        mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
        renderWithLocale();
        const heading = screen.getByRole('heading', { name: '함선 리더보드' });
        expect(visibleHeadingText(heading)).toBe('함선 리더보드');
    });

    it('renders a fully-Japanese heading with the window-suffix clause when the standings window is known', async () => {
        localStorage.setItem('bs-locale', 'ja');
        mockFetch.mockImplementation(() => Promise.resolve({
            data: {
                realm: 'na', tier: 10, ship_type: 'Battleship', ships: [],
                window_start: '2026-06-05', window_end: '2026-08-04',
            },
        } as never));
        renderWithLocale();
        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
        const heading = await screen.findByRole('heading', { name: /艦艇リーダーボード/ });
        const ariaLabel = heading.getAttribute('aria-label');
        const visible = visibleHeadingText(heading);
        expect(ariaLabel).toBe('艦艇リーダーボード · 直近60日間');
        expect(visible).toBe(ariaLabel);
        expect(ariaLabel).not.toMatch(RAW_TOKEN_LEAK);
        expect(ariaLabel).not.toMatch(ENGLISH_CLAUSE_LEAK);
    });

    it('renders the plain Japanese heading (no suffix) before a standings window resolves', () => {
        localStorage.setItem('bs-locale', 'ja');
        mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
        renderWithLocale();
        const heading = screen.getByRole('heading', { name: '艦艇リーダーボード' });
        expect(visibleHeadingText(heading)).toBe('艦艇リーダーボード');
    });
});
