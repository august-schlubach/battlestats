'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from '../context/LocaleContext';
import { trackWhenReady } from '../lib/umami';

// Renders nothing; its only job is to report which UI locale a page load
// actually ran in.
//
// `locale-switch` (LocaleSelector) counts the ACT of switching, which cannot
// answer "how many visitors read the site in Korean". bs-locale is sticky, so a
// visitor who switched once emits nothing on any later visit, and Django never
// sees the locale, so there is no server-side trace to reconstruct it from.
// This is the only place sustained non-English usage becomes measurable.
//
// English is reported too: it is the denominator. Without it the ko/ja counts
// have no share to be a share of.
//
// One event per page load, counted by DISTINCT visit_id in the readout rather
// than deduped client-side — a sessionStorage flag is per-tab, so it would
// undercount a same-day return and overcount two tabs, while visit_id is the
// unit the question is actually asked in.
//
// Readout query + measurement caveats:
// agents/runbooks/runbook-locale-adoption-measurement-2026-08-10.md

const LocaleBeacon: React.FC = () => {
    // The LIVE locale, not useDisplayLocale: this is a data decision with no
    // SSR counterpart to mismatch, and it must be right on the first render —
    // useDisplayLocale reports 'en' until mount and would file every ko/ja
    // visit under English.
    const { locale } = useLocale();

    // Mount-only, deliberately: a mid-visit switch is already covered by
    // locale-switch, and re-firing would file one visit under two locales.
    // The ref pins the first resolved value so the empty dep array is honest
    // rather than a lint suppression.
    const reported = useRef(locale);

    useEffect(() => trackWhenReady('locale-active', { locale: reported.current }), []);

    return null;
};

export default LocaleBeacon;
