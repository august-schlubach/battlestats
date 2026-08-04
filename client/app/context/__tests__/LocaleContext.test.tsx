import React from 'react';
import { render, screen, act } from '@testing-library/react';

// Wraps the real `translate` in a jest.fn so call arguments (which locale it
// was resolved against) are inspectable, while every other test in this file
// still gets the real, correct translation — it calls straight through.
// Needed because ko.ts/ja.ts are still empty partials: real output is
// identical for 'en' and 'ko' today, so the hydration-safety tests below
// can't tell the two apart by RENDERED TEXT alone and must inspect what
// locale useT() actually asked translate() to resolve.
jest.mock('../../i18n', () => {
    const actual = jest.requireActual('../../i18n');
    return { ...actual, translate: jest.fn(actual.translate) };
});

import { translate } from '../../i18n';
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

    it('t() returns English for an untranslated key', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderProbe();
        expect(screen.getByTestId('tab')).toHaveTextContent('Activity');
    });

    // The server always prerenders 'en' (no window at that point). If useT()
    // rendered off the live, synchronously-resolved locale, a visitor with
    // bs-locale=ko would get Korean on the very first client render against
    // English server HTML — a real hydration mismatch. useT() must gate on
    // the same mounted flag useDisplayLocale() exposes, so the first render
    // still resolves 'en' and only the post-mount render resolves the real
    // locale. ko.ts is still an empty partial, so this can't be observed via
    // rendered TEXT (translate() falls back to English regardless of which
    // locale it's given) — it has to be asserted on what locale useT() asked
    // translate() to resolve, across the two render passes.
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
