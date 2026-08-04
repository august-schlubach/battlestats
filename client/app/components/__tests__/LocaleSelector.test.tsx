import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LocaleProvider } from '../../context/LocaleContext';
import LocaleSelector from '../LocaleSelector';

const trackEvent = jest.fn();
jest.mock('../../lib/umami', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }));

const renderSelector = () => render(<LocaleProvider><LocaleSelector /></LocaleProvider>);

describe('LocaleSelector', () => {
    // process.env is shared across every test file in a Jest worker, so a
    // mutation here without an undo leaks into whichever suite runs next in
    // this worker. Save the incoming value and restore it after each test
    // rather than only ever forcing '1'/'0'.
    let originalFlag: string | undefined;

    beforeEach(() => {
        localStorage.clear();
        trackEvent.mockClear();
        originalFlag = process.env.NEXT_PUBLIC_LOCALE_SELECTOR;
        process.env.NEXT_PUBLIC_LOCALE_SELECTOR = '1';
    });

    afterEach(() => {
        if (originalFlag === undefined) {
            delete process.env.NEXT_PUBLIC_LOCALE_SELECTOR;
        } else {
            process.env.NEXT_PUBLIC_LOCALE_SELECTOR = originalFlag;
        }
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

    it('closes on a mousedown outside the selector', () => {
        renderSelector();
        act(() => { screen.getByRole('button').click(); });
        expect(screen.queryByRole('listbox')).toBeInTheDocument();

        const outside = document.createElement('div');
        document.body.appendChild(outside);
        act(() => {
            outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        document.body.removeChild(outside);
    });

    it('stays open on a mousedown inside the selector', () => {
        renderSelector();
        act(() => { screen.getByRole('button').click(); });
        expect(screen.queryByRole('listbox')).toBeInTheDocument();

        act(() => {
            screen.getByRole('listbox').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        expect(screen.queryByRole('listbox')).toBeInTheDocument();
    });
});
