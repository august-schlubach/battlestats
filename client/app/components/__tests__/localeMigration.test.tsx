import React from 'react';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '../../context/LocaleContext';
import { translate } from '../../i18n';
import NotFound from '../../not-found';

describe('migrated call sites', () => {
    beforeEach(() => localStorage.clear());

    it('renders English identically by default', () => {
        render(<LocaleProvider><NotFound /></LocaleProvider>);
        expect(screen.getByText('Page Not Found')).toBeInTheDocument();
        expect(screen.getByText('The requested page could not be found.')).toBeInTheDocument();
    });

    it('falls back to English for an untranslated locale', () => {
        localStorage.setItem('bs-locale', 'ko');
        render(<LocaleProvider><NotFound /></LocaleProvider>);
        // Task 7 may translate these; if so, update this assertion to the
        // Korean string rather than deleting the test.
        expect(screen.getByText(/Page Not Found|페이지/)).toBeInTheDocument();
    });

    // RealmTopShipsTreemapSVG.tsx replaced a direct string concatenation with
    // this template (Task 6). Nothing renders it with every fragment (realm +
    // bucket + wrPct + windowLabel) populated at once, so this locks the
    // composed byte sequence down at the translate() layer instead of relying
    // on the component test's `.toContain` checks.
    it('composes the treemap heading identically to the old concatenation', () => {
        expect(translate('en', 'landing.treemap.heading', {
            realm: 'NA',
            bucket: 'T10 Cruisers',
            suffix: ' · top 50% · last 45 days',
        })).toBe('NA most-played T10 Cruisers · top 50% · last 45 days');

        // bucketLabel absent → the old ' ships' branch, no wrPct/windowLabel.
        expect(translate('en', 'landing.treemap.heading', {
            realm: 'EU',
            bucket: 'ships',
            suffix: '',
        })).toBe('EU most-played ships');
    });
});
