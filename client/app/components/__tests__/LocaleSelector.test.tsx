import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LocaleProvider } from '../../context/LocaleContext';
import LocaleSelector from '../LocaleSelector';

const trackEvent = jest.fn();
jest.mock('../../lib/umami', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }));

const renderSelector = () => render(<LocaleProvider><LocaleSelector /></LocaleProvider>);

describe('LocaleSelector', () => {
    beforeEach(() => {
        localStorage.clear();
        trackEvent.mockClear();
        process.env.NEXT_PUBLIC_LOCALE_SELECTOR = '1';
    });

    it('renders nothing when the flag is off', () => {
        process.env.NEXT_PUBLIC_LOCALE_SELECTOR = '0';
        const { container } = renderSelector();
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the current locale flag on the collapsed chip', () => {
        const { container } = renderSelector();
        expect(container.querySelector('img')).toHaveAttribute('src', '/flags/uk.svg');
    });

    it('opens to three options with native names', () => {
        renderSelector();
        act(() => { screen.getByRole('button').click(); });
        expect(screen.getByRole('option', { name: /English/ })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /한국어/ })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /日本語/ })).toBeInTheDocument();
    });

    it('switches, persists, and tracks by locale id', () => {
        renderSelector();
        act(() => { screen.getByRole('button').click(); });
        act(() => { screen.getByRole('option', { name: /한국어/ }).click(); });
        expect(localStorage.getItem('bs-locale')).toBe('ko');
        expect(trackEvent).toHaveBeenCalledWith('locale-switch', { locale: 'ko' });
    });

    it('closes on Escape', () => {
        renderSelector();
        act(() => { screen.getByRole('button').click(); });
        expect(screen.queryByRole('listbox')).toBeInTheDocument();
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
});
