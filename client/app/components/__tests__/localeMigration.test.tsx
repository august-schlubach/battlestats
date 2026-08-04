import React from 'react';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '../../context/LocaleContext';
import NotFound from '../../not-found';

// Note: the former "composes the treemap heading identically" case (a
// translate()-layer assertion against a literal) was removed here — it was a
// dictionary-value assertion, redundant with the mutation-verified
// component-level coverage in RealmTopShipsTreemapSVG.test.tsx (exact
// `.textContent` checks on the rendered heading, not just `.toContain`).

describe('migrated call sites', () => {
    beforeEach(() => localStorage.clear());

    it('renders English identically by default', () => {
        render(<LocaleProvider><NotFound /></LocaleProvider>);
        expect(screen.getByText('Page Not Found')).toBeInTheDocument();
        expect(screen.getByText('The requested page could not be found.')).toBeInTheDocument();
    });

    // notFound.* is translated in both locales now (fix round closing the
    // insight-tab-strip alternating-language defect); a regex disjunction
    // like /Page Not Found|페이지/ can't meaningfully fail (either branch
    // satisfies it), so each locale gets its own exact assertion instead.
    it('renders the Korean copy when ko is selected', () => {
        localStorage.setItem('bs-locale', 'ko');
        render(<LocaleProvider><NotFound /></LocaleProvider>);
        expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument();
        expect(screen.getByText('요청하신 페이지를 찾을 수 없습니다.')).toBeInTheDocument();
    });

    it('renders the Japanese copy when ja is selected', () => {
        localStorage.setItem('bs-locale', 'ja');
        render(<LocaleProvider><NotFound /></LocaleProvider>);
        expect(screen.getByText('ページが見つかりません')).toBeInTheDocument();
        expect(screen.getByText('お探しのページは見つかりませんでした。')).toBeInTheDocument();
    });
});
