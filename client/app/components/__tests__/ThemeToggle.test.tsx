import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ThemeToggle from '../ThemeToggle';
import { ThemeProvider } from '../../context/ThemeContext';
import { LocaleProvider } from '../../context/LocaleContext';

const trackEventMock = jest.fn();
jest.mock('../../lib/umami', () => ({
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

const renderToggle = () => render(
    <LocaleProvider>
        <ThemeProvider>
            <ThemeToggle />
        </ThemeProvider>
    </LocaleProvider>
);

describe('ThemeToggle', () => {
    beforeEach(() => {
        trackEventMock.mockReset();
        window.localStorage.clear();
    });

    it('gives the open listbox the translated static "Select theme" accessible name', () => {
        renderToggle();

        fireEvent.click(screen.getByRole('button', { name: /theme:/i }));

        // Exact match through a real render — the listbox's static aria-label is
        // migrated through t() in Task 6b (nav.selectTheme). A substring match
        // would pass even if the wiring rendered a literal `{key}` placeholder.
        expect(screen.getByRole('listbox', { name: 'Select theme' })).toBeInTheDocument();
    });

    it('composes the "Theme: <label>" button aria-label byte-identically to the old template in English', () => {
        renderToggle();

        // Task 8b keyed the WHOLE composed sentence (nav.themeCurrent) rather
        // than just the theme word, so an English visitor must see exactly what
        // the old `Theme: ${currentLabel}` template produced — this is the
        // regression net for the ~544-test release gate.
        expect(screen.getByRole('button', { name: 'Theme: Dark' })).toBeInTheDocument();
    });

    it('renders the visible chip label and dropdown options in Korean, not English', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderToggle();

        // The default theme is dark (ThemeContext), so the collapsed chip's
        // visible text must read the Korean loanword, not "Dark".
        expect(screen.getByText('다크')).toBeInTheDocument();
        expect(screen.queryByText('Dark')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /테마:/ }));
        expect(screen.getByRole('option', { name: '라이트' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '다크' })).toBeInTheDocument();
    });

    it('composes the Korean "테마: <label>" aria-label with the label substituted in, no literal {label} surviving', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderToggle();

        // Asserts the WHOLE aria-label is keyed (nav.themeCurrent), not just the
        // theme word — a bug that keys only currentLabel would render this as
        // the mixed-language "Theme: 다크" instead of "테마: 다크".
        expect(screen.getByRole('button', { name: '테마: 다크' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /\{label\}/ })).not.toBeInTheDocument();
    });

    it('renders the visible chip label and dropdown options in Japanese, not English', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderToggle();

        expect(screen.getByText('ダーク')).toBeInTheDocument();
        expect(screen.queryByText('Dark')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /テーマ:/ }));
        expect(screen.getByRole('option', { name: 'ライト' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'ダーク' })).toBeInTheDocument();
    });

    it('composes the Japanese "テーマ: <label>" aria-label with the label substituted in, no literal {label} surviving', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderToggle();

        expect(screen.getByRole('button', { name: 'テーマ: ダーク' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /\{label\}/ })).not.toBeInTheDocument();
    });
});
