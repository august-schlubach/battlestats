import React from 'react';
import { render, screen, act } from '@testing-library/react';

// Wraps the real `translate` in a jest.fn so call arguments (which locale it
// was resolved against) are inspectable, while every other test in this file
// still gets the real, correct translation — it calls straight through.
// The hydration-safety test below is about the STAGED RESOLUTION mechanism
// (English on the first render, the real locale after mount) rather than any
// particular key's translation state, so it inspects what locale useT()
// actually asked translate() to resolve instead of relying on rendered TEXT —
// that stays true regardless of whether ko.ts/ja.ts translate the Probe's
// probed key (insights.tabs.activity, which they now do).
jest.mock('../../i18n', () => {
    const actual = jest.requireActual('../../i18n');
    return { ...actual, translate: jest.fn(actual.translate) };
});

import { translate } from '../../i18n';
import { en } from '../../i18n/en';
import { ko } from '../../i18n/ko';
import type { StringKey } from '../../i18n/keys';
import { LocaleProvider, useLocale, useDisplayLocale, useT } from '../LocaleContext';

const translateMock = translate as jest.Mock;

const Probe: React.FC = () => {
    const { locale, setLocale } = useLocale();
    const t = useT();
    return (
        <div>
            <span data-testid="locale">{locale}</span>
            <span data-testid="tab">{t('insights.tabs.activity')}</span>
            <button onClick={() => setLocale('ko')}>ko</button>
        </div>
    );
};

const renderProbe = () => render(<LocaleProvider><Probe /></LocaleProvider>);

describe('LocaleContext', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-lang');
        window.history.replaceState({}, '', '/');
        translateMock.mockClear();
    });

    it('defaults to en', () => {
        renderProbe();
        expect(screen.getByTestId('locale')).toHaveTextContent('en');
    });

    it('restores a stored locale', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderProbe();
        expect(screen.getByTestId('locale')).toHaveTextContent('ja');
    });

    it('lets ?lang= win over storage', () => {
        localStorage.setItem('bs-locale', 'ja');
        window.history.replaceState({}, '', '/?lang=ko');
        renderProbe();
        expect(screen.getByTestId('locale')).toHaveTextContent('ko');
    });

    it('ignores an unknown value', () => {
        localStorage.setItem('bs-locale', 'klingon');
        renderProbe();
        expect(screen.getByTestId('locale')).toHaveTextContent('en');
    });

    it('persists a switch', () => {
        renderProbe();
        act(() => { screen.getByText('ko').click(); });
        expect(localStorage.getItem('bs-locale')).toBe('ko');
    });

    it('stamps lang and data-lang on the initial resolve', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderProbe();
        expect(document.documentElement.dataset.lang).toBe('ja');
        expect(document.documentElement.lang).toBe('ja');
    });

    it('re-stamps data-lang after a switch, without a reload', () => {
        renderProbe();
        act(() => { screen.getByText('ko').click(); });
        expect(document.documentElement.dataset.lang).toBe('ko');
        expect(document.documentElement.lang).toBe('ko');
    });

    it('stamps on a ?lang= cold load with empty storage', () => {
        window.history.replaceState({}, '', '/?lang=ko');
        renderProbe();
        // The head script reads only localStorage, so the provider is the ONLY
        // thing that can stamp here. This is the prod preview path.
        expect(document.documentElement.dataset.lang).toBe('ko');
    });

    // Key-agnostic by design, same reasoning as dictionaries.test.ts: ko.ts is
    // an actively-populated Partial now, so pinning one specific StringKey as
    // "the untranslated one" would make this test brittle against the next
    // translation round. Find whichever key ko currently lacks and probe that
    // one directly (not the shared Probe component above, which is fixed on
    // insights.tabs.activity — translated in ko today, so it can't stand in
    // for "untranslated" here).
    it('t() returns English for an untranslated key', () => {
        localStorage.setItem('bs-locale', 'ko');
        const enKeys = Object.keys(en) as StringKey[];
        const missingKey = enKeys.find((k) => !(k in ko)) as StringKey | undefined;
        expect(missingKey).toBeDefined();
        const UntranslatedProbe: React.FC = () => {
            const t = useT();
            return <span data-testid="untranslated">{t(missingKey as StringKey)}</span>;
        };
        render(<LocaleProvider><UntranslatedProbe /></LocaleProvider>);
        expect(screen.getByTestId('untranslated')).toHaveTextContent(en[missingKey as StringKey]);
    });

    // The server always prerenders 'en' (no window at that point). If useT()
    // rendered off the live, synchronously-resolved locale, a visitor with
    // bs-locale=ko would get Korean on the very first client render against
    // English server HTML — a real hydration mismatch. useT() must gate on
    // the same mounted flag useDisplayLocale() exposes, so the first render
    // still resolves 'en' and only the post-mount render resolves the real
    // locale. This is asserted on what locale useT() asked translate() to
    // resolve, across the two render passes, rather than on rendered TEXT —
    // that holds regardless of whether the Probe's probed key happens to be
    // translated in ko (see the mock-rationale comment at the top of this
    // file).
    it('useT resolves English on the first render even when a non-English locale is stored, then the real locale after mount', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderProbe();
        expect(translateMock.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(translateMock.mock.calls[0][0]).toBe('en');
        expect(translateMock.mock.calls[translateMock.mock.calls.length - 1][0]).toBe('ko');
    });

    it('useDisplayLocale returns en before mount and the stored locale after', () => {
        localStorage.setItem('bs-locale', 'ja');
        // Captures the value seen on the FIRST render into an outer variable —
        // a rendered/settled assertion alone can't distinguish "always was ja"
        // from "started en, corrected to ja", since RTL's render() flushes
        // effects (and the resulting re-render) before returning.
        let firstRender: string | undefined;
        const DisplayProbe: React.FC = () => {
            const displayLocale = useDisplayLocale();
            if (firstRender === undefined) {
                // NOT dead: `react-hooks/globals` (eslint-plugin-react-hooks
                // 7.0.1) is a real, active rule here — it flags reassigning
                // this outer-scope variable during render as an impure side
                // effect. Verified empirically (2026-08-04 fix round):
                // removing this line produces a genuine lint error, so the
                // suppression is load-bearing, not inert.
                // eslint-disable-next-line react-hooks/globals
                firstRender = displayLocale;
            }
            return <div data-testid="display">{displayLocale}</div>;
        };
        render(<LocaleProvider><DisplayProbe /></LocaleProvider>);
        expect(firstRender).toBe('en');
        expect(screen.getByTestId('display')).toHaveTextContent('ja');
    });
});
