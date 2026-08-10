import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LocaleBeacon from '../LocaleBeacon';
import { LocaleProvider, useLocale } from '../../context/LocaleContext';

const renderBeacon = (children?: React.ReactNode) =>
    render(
        <LocaleProvider>
            <LocaleBeacon />
            {children}
        </LocaleProvider>,
    );

describe('LocaleBeacon', () => {
    const originalUmami = window.umami;

    beforeEach(() => {
        jest.useFakeTimers();
        window.localStorage.clear();
        window.history.replaceState({}, '', '/');
    });

    afterEach(() => {
        jest.useRealTimers();
        window.umami = originalUmami;
    });

    it('reports the stored non-English locale once the tracker is loaded', () => {
        window.localStorage.setItem('bs-locale', 'ko');
        const track = jest.fn();
        window.umami = { track };

        renderBeacon();

        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith('locale-active', { locale: 'ko' });
    });

    // English is the denominator: without it the series counts ko/ja visits
    // against nothing, and no share can be computed from the readout alone.
    it('reports English too, so the series carries its own denominator', () => {
        const track = jest.fn();
        window.umami = { track };

        renderBeacon();

        expect(track).toHaveBeenCalledWith('locale-active', { locale: 'en' });
    });

    it('reports a ?lang= override, which never reaches localStorage', () => {
        window.history.replaceState({}, '', '/?lang=ja');
        const track = jest.fn();
        window.umami = { track };

        renderBeacon();

        expect(track).toHaveBeenCalledWith('locale-active', { locale: 'ja' });
    });

    it('waits for the deferred tracker script, then reports once', () => {
        window.umami = undefined;

        renderBeacon();
        jest.advanceTimersByTime(600);

        const track = jest.fn();
        window.umami = { track };
        jest.advanceTimersByTime(200);

        expect(track).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(5000);
        expect(track).toHaveBeenCalledTimes(1);
    });

    it('gives up after a bounded number of attempts when the tracker never arrives', () => {
        window.umami = undefined;

        renderBeacon();
        jest.advanceTimersByTime(200 * 25);

        const track = jest.fn();
        window.umami = { track };
        jest.advanceTimersByTime(5000);

        expect(track).not.toHaveBeenCalled();
    });

    // A mid-visit switch is already counted by locale-switch. Re-firing here
    // would double-count that visit under both locales.
    it('does not re-fire when the visitor switches locale mid-visit', () => {
        const track = jest.fn();
        window.umami = { track };

        const Switcher: React.FC = () => {
            const { setLocale } = useLocale();
            return <button onClick={() => setLocale('ja')}>switch</button>;
        };

        renderBeacon(<Switcher />);
        fireEvent.click(screen.getByRole('button', { name: 'switch' }));

        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith('locale-active', { locale: 'en' });
    });

    it('renders nothing', () => {
        window.umami = { track: jest.fn() };
        const { container } = renderBeacon();
        expect(container).toBeEmptyDOMElement();
    });
});
