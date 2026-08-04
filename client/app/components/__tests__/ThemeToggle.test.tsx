import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ThemeToggle from '../ThemeToggle';
import { ThemeProvider } from '../../context/ThemeContext';

const trackEventMock = jest.fn();
jest.mock('../../lib/umami', () => ({
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

describe('ThemeToggle', () => {
    beforeEach(() => {
        trackEventMock.mockReset();
        window.localStorage.clear();
    });

    it('gives the open listbox the translated static "Select theme" accessible name', () => {
        render(
            <ThemeProvider>
                <ThemeToggle />
            </ThemeProvider>
        );

        fireEvent.click(screen.getByRole('button', { name: /theme:/i }));

        // Exact match through a real render — the listbox's static aria-label is
        // migrated through t() in Task 6b (nav.selectTheme). A substring match
        // would pass even if the wiring rendered a literal `{key}` placeholder.
        expect(screen.getByRole('listbox', { name: 'Select theme' })).toBeInTheDocument();
    });

    it('leaves the composed "Theme: <label>" button aria-label untouched', () => {
        render(
            <ThemeProvider>
                <ThemeToggle />
            </ThemeProvider>
        );

        // The composed label is explicitly out of scope for this task — only the
        // static listbox label was migrated.
        expect(screen.getByRole('button', { name: 'Theme: Dark' })).toBeInTheDocument();
    });
});
