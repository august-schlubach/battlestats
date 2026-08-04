import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';

const pushMock = jest.fn();
let mockRealm = 'na';

const stableSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock }),
    usePathname: () => '/',
    useSearchParams: () => stableSearchParams,
}));

jest.mock('../../context/RealmContext', () => ({
    useRealm: () => ({ realm: mockRealm }),
}));

jest.mock('../../lib/realmParams', () => ({
    withRealm: (url: string, realm: string) => `${url}${url.includes('?') ? '&' : '?'}realm=${realm}`,
}));

const trackEventMock = jest.fn();
jest.mock('../../lib/umami', () => ({
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import HeaderSearch from '../HeaderSearch';
import { LocaleProvider } from '../../context/LocaleContext';

const buildOkResponse = (payload: unknown) => ({
    ok: true,
    json: async () => payload,
});

let fetchMock: jest.Mock;

beforeEach(() => {
    pushMock.mockReset();
    trackEventMock.mockReset();
    mockRealm = 'na';
    fetchMock = jest.fn(() => Promise.resolve(buildOkResponse([])));
    global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Helper: type into the search input and wait for the debounce + fetch to complete */
async function typeAndWaitForFetch(input: HTMLElement, value: string) {
    await act(async () => {
        fireEvent.change(input, { target: { value } });
    });
    // Wait for the 180ms debounce timer to fire and the fetch promise to resolve
    await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
    });
}

describe('HeaderSearch toggle', () => {
    it('renders with player mode by default', () => {
        render(<HeaderSearch />);
        const input = screen.getByPlaceholderText('Search Players');
        expect(input).toBeTruthy();
        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(toggle).toHaveAttribute('title', 'Search Players');
    });

    it('switches placeholder text when toggled to clan mode', () => {
        render(<HeaderSearch />);
        const toggle = screen.getByRole('switch');
        fireEvent.click(toggle);
        expect(screen.getByPlaceholderText('Search Clans')).toBeTruthy();
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        expect(toggle).toHaveAttribute('title', 'Search Clans');
    });

    it('tracks a search-mode-toggle umami event with the next mode', () => {
        render(<HeaderSearch />);
        fireEvent.click(screen.getByRole('switch'));
        expect(trackEventMock).toHaveBeenCalledWith('search-mode-toggle', { mode: 'clan' });
    });

    it('tracks a search umami event (with realm) when navigating to a suggestion', async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(buildOkResponse([
                { clan_id: 42, tag: 'ABC', name: 'Alpha Bravo', members_count: 30 },
            ]))
        );

        render(<HeaderSearch />);
        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });
        const input = screen.getByPlaceholderText('Search Clans');
        await typeAndWaitForFetch(input, 'alpha');

        trackEventMock.mockReset();  // ignore the toggle event from above
        fireEvent.mouseDown(screen.getByText('Alpha Bravo'));

        expect(trackEventMock).toHaveBeenCalledWith('search', {
            mode: 'clan', realm: 'na', via: 'suggestion',
        });
    });

    it('fetches from clan-suggestions endpoint in clan mode', async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(buildOkResponse([
                { clan_id: 100, tag: 'TST', name: 'Test Clan', members_count: 20 },
            ]))
        );

        render(<HeaderSearch />);

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });

        const input = screen.getByPlaceholderText('Search Clans');
        await typeAndWaitForFetch(input, 'test');

        const clanCall = fetchMock.mock.calls.find(
            (c: [string, ...unknown[]]) => c[0]?.includes('clan-suggestions')
        );
        expect(clanCall).toBeTruthy();
    });

    it('navigates to clan page when selecting a clan suggestion', async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(buildOkResponse([
                { clan_id: 42, tag: 'ABC', name: 'Alpha Bravo', members_count: 30 },
            ]))
        );

        render(<HeaderSearch />);

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });

        const input = screen.getByPlaceholderText('Search Clans');
        await typeAndWaitForFetch(input, 'alpha');

        // Open suggestion list (typing sets isSuggestionListOpen via onChange)
        expect(screen.getByText('[ABC]')).toBeTruthy();

        fireEvent.mouseDown(screen.getByText('Alpha Bravo'));

        expect(pushMock).toHaveBeenCalledWith(
            expect.stringContaining('/clan/42-alpha-bravo')
        );
    });

    it('clears suggestions when mode switches', async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(buildOkResponse([
                { name: 'Player1', pvp_ratio: 55, is_hidden: false },
            ]))
        );

        render(<HeaderSearch />);
        const input = screen.getByPlaceholderText('Search Players');
        await typeAndWaitForFetch(input, 'player');

        // Suggestions should be visible (the onChange sets isSuggestionListOpen)
        expect(screen.queryByRole('listbox')).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });
        expect(screen.queryByRole('listbox')).toBeNull();
    });
});

describe('HeaderSearch submit button (nav.searchSubmit)', () => {
    beforeEach(() => {
        localStorage.clear();
        fetchMock = jest.fn(() => Promise.resolve(buildOkResponse([])));
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    // Regression net: en.ts must render byte-identically to the literal `Go`
    // the button used to hardcode. A real render, not a dictionary assertion —
    // this fails if the wiring ever falls back to a raw key or a placeholder.
    it('renders the literal "Go" in English by default', () => {
        render(<HeaderSearch />);
        expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
        expect(screen.queryByText('검색')).not.toBeInTheDocument();
        expect(screen.queryByText('検索')).not.toBeInTheDocument();
    });

    it('renders the corpus-attested Korean search verb, not "Go"', () => {
        localStorage.setItem('bs-locale', 'ko');
        render(<LocaleProvider><HeaderSearch /></LocaleProvider>);
        expect(screen.getByRole('button', { name: '검색' })).toBeInTheDocument();
        expect(screen.queryByText('Go')).not.toBeInTheDocument();
    });

    it('renders the corpus-attested Japanese search verb, not "Go"', () => {
        localStorage.setItem('bs-locale', 'ja');
        render(<LocaleProvider><HeaderSearch /></LocaleProvider>);
        expect(screen.getByRole('button', { name: '検索' })).toBeInTheDocument();
        expect(screen.queryByText('Go')).not.toBeInTheDocument();
    });
});
