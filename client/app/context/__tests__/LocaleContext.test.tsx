import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LocaleProvider, useLocale, useT } from '../LocaleContext';

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
});
