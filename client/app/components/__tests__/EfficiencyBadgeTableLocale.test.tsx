import React from 'react';
import { render, screen, within } from '@testing-library/react';
import EfficiencyBadgeTable, { type EfficiencyBadgeDot } from '../EfficiencyBadgeTable';
import { LocaleProvider } from '../../context/LocaleContext';

// Filter-bar locale wiring (client-locale-toggle-spec.md follow-on #2,
// 2026-08-04). The Tier/Type/Nation/Award labels and the four "All" dropdown
// options used to be hardcoded English literals — an English-only assertion
// can't tell a working `t()` call from a hardcoded string, since both render
// the same text in the default locale. These tests render under real ko/ja
// dictionaries (no translate() mock) so breaking the wiring turns them red.
//
// `common.award` ships as a generic-chrome admission (등급/等級, "grade") with
// no corpus attestation of its own — the weakest link in this change, flagged
// NEEDS-NATIVE-CHECK in ko.ts/ja.ts. It is still asserted here like every
// other wired key: the native check is about whether the WORD is right, not
// about whether the wiring works.
//
// Fix round 1 (F1) regression net: the same four words (Tier/Type/Nation/
// Award) also render as this table's own column headers AND as
// EfficiencyMiniTreemaps' mini-treemap titles, one row above the filter bar.
// The first wiring pass translated only the filter labels, so ko/ja
// screenshots showed a translated filter row sitting directly above English
// column headers and treemap titles — exactly the alternating-language
// defect this follow-on exists to close. Asserting the column-header text
// AND counting total occurrences of each translated word (filter label +
// column header + treemap title = 3) catches a regression on either site.

jest.mock('../../context/RealmContext', () => ({ useRealm: () => ({ realm: 'na' }) }));
jest.mock('../../lib/umami', () => ({ trackEvent: jest.fn() }));

const sampleDots: EfficiencyBadgeDot[] = [
    { shipId: 1, shipName: 'Bismarck', shipType: 'BB', shipTier: 8, nation: 'germany', badgeClass: 2, badgeLabel: 'I', battles: 300, winRatio: 0.52 },
    { shipId: 2, shipName: 'Des Moines', shipType: 'CA', shipTier: 10, nation: 'usa', badgeClass: 1, badgeLabel: 'Expert', battles: 1200, winRatio: 0.58 },
];

const renderWithLocale = () => render(
    <LocaleProvider>
        <EfficiencyBadgeTable dots={sampleDots} theme="light" />
    </LocaleProvider>,
);

// Each filter's <label> wraps its own text span + <select>, so the label
// text IS the select's accessible name — the same structural assertion
// PlayerEfficiencyBadges.test.tsx already relies on with getByLabelText.
const optionTexts = (labelText: string): string[] => {
    const select = screen.getByLabelText(labelText);
    return within(select).getAllByRole('option').map((option) => option.textContent);
};

describe('EfficiencyBadgeTable filter bar — locale coverage', () => {
    beforeEach(() => localStorage.clear());

    it('renders the Korean filter labels and "All" options', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderWithLocale();
        expect(screen.getByLabelText('티어')).toBeInTheDocument();
        expect(screen.getByLabelText('함종')).toBeInTheDocument();
        expect(screen.getByLabelText('국가')).toBeInTheDocument();
        expect(screen.getByLabelText('등급')).toBeInTheDocument();
        expect(screen.queryByLabelText('Tier')).toBeNull();
        expect(screen.queryByLabelText('Type')).toBeNull();
        expect(screen.queryByLabelText('Nation')).toBeNull();
        expect(screen.queryByLabelText('Award')).toBeNull();
        expect(optionTexts('티어')).toContain('전체');
        expect(optionTexts('함종')).toContain('전체');
        expect(optionTexts('국가')).toContain('전체');
        expect(optionTexts('등급')).toContain('전체');
    });

    it('renders the Japanese filter labels and "All" options', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderWithLocale();
        // common.tier is Latin "Tier" by design in ja (corpus-attested), so
        // it can't distinguish wired from hardcoded on its own — the other
        // three labels carry that signal here.
        expect(screen.getByLabelText('Tier')).toBeInTheDocument();
        expect(screen.getByLabelText('艦種')).toBeInTheDocument();
        expect(screen.getByLabelText('国家')).toBeInTheDocument();
        expect(screen.getByLabelText('等級')).toBeInTheDocument();
        expect(screen.queryByLabelText('Nation')).toBeNull();
        expect(screen.queryByLabelText('Award')).toBeNull();
        expect(optionTexts('艦種')).toContain('すべて');
        expect(optionTexts('国家')).toContain('すべて');
        expect(optionTexts('等級')).toContain('すべて');
    });

    it('F1: Korean column headers AND mini-treemap titles match the filter labels (no mixed-language row)', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderWithLocale();
        const table = screen.getByRole('table');
        expect(within(table).getByRole('columnheader', { name: '티어' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: '함종' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: '국가' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: '등급' })).toBeInTheDocument();
        expect(within(table).queryByRole('columnheader', { name: 'Tier' })).toBeNull();
        expect(within(table).queryByRole('columnheader', { name: 'Type' })).toBeNull();
        expect(within(table).queryByRole('columnheader', { name: 'Nation' })).toBeNull();
        expect(within(table).queryByRole('columnheader', { name: 'Award' })).toBeNull();
        // Filter label + column header + mini-treemap title = 3 occurrences of
        // each translated word once F1 is fixed; before the fix each word
        // appeared exactly once (the filter label only).
        expect(screen.getAllByText('티어').length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByText('함종').length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByText('국가').length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByText('등급').length).toBeGreaterThanOrEqual(3);
    });

    it('F1: Japanese column headers AND mini-treemap titles match the filter labels', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderWithLocale();
        const table = screen.getByRole('table');
        expect(within(table).getByRole('columnheader', { name: '艦種' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: '国家' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: '等級' })).toBeInTheDocument();
        expect(within(table).queryByRole('columnheader', { name: 'Type' })).toBeNull();
        expect(within(table).queryByRole('columnheader', { name: 'Nation' })).toBeNull();
        expect(within(table).queryByRole('columnheader', { name: 'Award' })).toBeNull();
        expect(screen.getAllByText('艦種').length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByText('国家').length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByText('等級').length).toBeGreaterThanOrEqual(3);
    });

    it('F3: the Clear button renders through common.clear in ko/ja', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderWithLocale();
        expect(screen.getByRole('button', { name: '초기화' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    });

    it('F3: the Clear button renders through common.clear in ja', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderWithLocale();
        expect(screen.getByRole('button', { name: 'クリア' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    });
});
