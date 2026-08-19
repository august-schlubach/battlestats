import React from 'react';
import { render, screen } from '@testing-library/react';

const stableSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/',
    useSearchParams: () => stableSearchParams,
}));
jest.mock('../lib/umami', () => ({ trackEvent: jest.fn() }));

import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { RealmProvider, useRealm } from '../context/RealmContext';
import { LocaleProvider, useLocale } from '../context/LocaleContext';
import { buildBootScript } from '../lib/bootScript';
import HeaderSearch from '../components/HeaderSearch';

// The four defaults a first-time visitor lands on, pinned in ONE place.
//
// Each of these is individually reachable from its own context, and three of
// them already have incidental coverage elsewhere (bootScript stamps theme and
// realm pre-paint; LocaleContext has its own precedence suite; HeaderSearch has
// a player-mode render test). What did not exist is a single test that states
// the CONTRACT — dark, English, NA, player search — so that a change to any one
// of them trips an assertion that names the agreement rather than only a local
// unit test whose failure reads like an implementation detail.
//
// A first-time visitor means: nothing in localStorage, no ?query overrides.

const ThemeProbe: React.FC = () => {
    const { theme } = useTheme();
    return <span data-testid="theme">{theme}</span>;
};

const RealmProbe: React.FC = () => {
    const { realm } = useRealm();
    return <span data-testid="realm">{realm}</span>;
};

const LocaleProbe: React.FC = () => {
    const { locale } = useLocale();
    return <span data-testid="locale">{locale}</span>;
};

describe('front-page defaults for a first-time visitor', () => {
    const originalAutodetect = process.env.NEXT_PUBLIC_LOCALE_AUTODETECT;

    beforeEach(() => {
        localStorage.clear();
        window.history.replaceState({}, '', '/');
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-realm');
        document.documentElement.removeAttribute('data-lang');
    });

    afterAll(() => {
        if (originalAutodetect === undefined) {
            delete process.env.NEXT_PUBLIC_LOCALE_AUTODETECT;
        } else {
            process.env.NEXT_PUBLIC_LOCALE_AUTODETECT = originalAutodetect;
        }
    });

    it('theme is dark', () => {
        render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
        expect(screen.getByTestId('theme')).toHaveTextContent('dark');
        // And the pre-paint frame agrees, so there is no light flash before
        // React mounts. Both halves must say dark or the first frame lies.
        expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('realm is NA', () => {
        render(<RealmProvider><RealmProbe /></RealmProvider>);
        expect(screen.getByTestId('realm')).toHaveTextContent('na');
    });

    it('language is English for an English browser, autodetect on or off', () => {
        // Autodetect is enabled in production (NEXT_PUBLIC_LOCALE_AUTODETECT=1,
        // pinned in /etc/battlestats-client.env, observed 2026-08-19), so
        // "English by default" has to hold WITH it enabled for an en browser —
        // not merely as the fallback when the feature is off. Both states are
        // asserted here precisely so this test does not depend on that live
        // value: the contract holds either way.
        Object.defineProperty(window.navigator, 'languages', {
            value: ['en-GB', 'en-US'], configurable: true,
        });

        delete process.env.NEXT_PUBLIC_LOCALE_AUTODETECT;
        const off = render(<LocaleProvider><LocaleProbe /></LocaleProvider>);
        expect(screen.getByTestId('locale')).toHaveTextContent('en');
        off.unmount();

        process.env.NEXT_PUBLIC_LOCALE_AUTODETECT = '1';
        render(<LocaleProvider><LocaleProbe /></LocaleProvider>);
        expect(screen.getByTestId('locale')).toHaveTextContent('en');
    });

    it('a non-English browser still resolves English when autodetect is off', () => {
        // The guarantee that survives a rollback of the autodetect flag: with it
        // off, EVERY unchosen visitor lands on English regardless of browser.
        Object.defineProperty(window.navigator, 'languages', {
            value: ['ko-KR'], configurable: true,
        });
        delete process.env.NEXT_PUBLIC_LOCALE_AUTODETECT;
        render(<LocaleProvider><LocaleProbe /></LocaleProvider>);
        expect(screen.getByTestId('locale')).toHaveTextContent('en');
    });

    it('search opens in player mode, not clan', () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({ ok: true, json: async () => [] })) as unknown as typeof fetch;
        render(
            <LocaleProvider>
                <RealmProvider>
                    <HeaderSearch />
                </RealmProvider>
            </LocaleProvider>,
        );
        expect(screen.getByPlaceholderText('Search Players')).toBeTruthy();
        // The toggle is off in player mode; on would mean clan.
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    });

    it('the pre-paint boot script stamps the same theme and realm', () => {
        // The script runs before React and must not disagree with the providers
        // above, or the first frame shows one thing and the second another.
        const script = buildBootScript();
        eval(script);
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.dataset.realm).toBe('na');
    });
});
