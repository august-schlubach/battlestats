import React from 'react';
import { render, screen } from '@testing-library/react';
import ShipLeaderboard from '../ShipLeaderboard';
import { fetchSharedJson } from '../../lib/sharedJsonFetch';
import { LocaleProvider } from '../../context/LocaleContext';

// Filter-bar locale wiring (client-locale-toggle-spec.md follow-on #2,
// 2026-08-04). Tier/Type used to be hardcoded English literals in this
// component's filter row — an English-only assertion can't tell a working
// `t()` call from a hardcoded string, since both render "Tier"/"Type" in the
// default locale. These tests render under real ko/ja dictionaries (no
// translate() mock) so breaking the wiring turns them red.
//
// `WR ≥` is DELIBERATELY untranslated (evidence-backed, not an omission —
// see the research doc): wows-numbers keeps "WR Diff" in Latin in both ko and
// ja tables, so the community reads "WR" as an untranslated abbreviation in
// both languages. Each test's last assertion pins that the label stays
// literal English even under a non-English locale, so a future pass does not
// "fix" it into a guessed translation. Matched with a `/^WR/` regex rather
// than the literal string: the source markup joins the words with `&nbsp;`
// (a real requirement — the label must not break across a line), and pinning
// the exact non-breaking-space byte in a test string is a needless way to
// break this file the next time someone edits it.
//
// F2 (fix round 1): the WR-percentile group's `All` pill was the one
// `common.all` call site the first pass missed — it stayed hardcoded while
// EfficiencyBadgeTable's four "All" options translated in the same release.
// Asserted below by role+name so it can't be satisfied by the 50%/25% pills
// or anything else in the row.

jest.mock('../../lib/sharedJsonFetch', () => ({ fetchSharedJson: jest.fn() }));
jest.mock('../../context/RealmContext', () => ({ useRealm: () => ({ realm: 'na' }) }));
jest.mock('../../lib/umami', () => ({ trackEvent: jest.fn() }));
jest.mock('../SubmarineEasterEgg', () => ({ __esModule: true, default: () => null }));
jest.mock('../CarrierEasterEgg', () => ({ __esModule: true, default: () => null }));

const mockFetch = fetchSharedJson as jest.MockedFunction<typeof fetchSharedJson>;

const renderWithLocale = () => render(
    <LocaleProvider>
        <ShipLeaderboard />
    </LocaleProvider>,
);

describe('ShipLeaderboard filter bar — locale coverage', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves; pills render either way
        localStorage.clear();
        Element.prototype.scrollIntoView = jest.fn();
    });

    it('renders the Korean Tier/Type filter labels, and leaves WR ≥ in English', async () => {
        localStorage.setItem('bs-locale', 'ko');
        renderWithLocale();
        expect(await screen.findByText('티어')).toBeInTheDocument();
        expect(screen.getByText('함종')).toBeInTheDocument();
        expect(screen.queryByText('Tier')).toBeNull();
        expect(screen.queryByText('Type')).toBeNull();
        // WR ≥ stays English in every locale — see the module comment above.
        expect(screen.getByText(/^WR/)).toBeInTheDocument();
        // F2: the WR-percentile group's "All" pill is translated.
        expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    });

    it('renders the Japanese Tier/Type filter labels, and leaves WR ≥ in English', async () => {
        localStorage.setItem('bs-locale', 'ja');
        renderWithLocale();
        expect(await screen.findByText('艦種')).toBeInTheDocument();
        // Japanese `common.tier` is Latin "Tier" by design (corpus-attested —
        // JP players write Tier10/T9), so this alone can't distinguish wired
        // from hardcoded; the Type assertion above carries that signal here.
        expect(screen.getByText('Tier')).toBeInTheDocument();
        expect(screen.getByText(/^WR/)).toBeInTheDocument();
        // F2: the WR-percentile group's "All" pill is translated.
        expect(screen.getByRole('button', { name: 'すべて' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    });
});
