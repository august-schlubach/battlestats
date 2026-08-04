import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import RealmSelector from '../RealmSelector';
import { RealmProvider, useRealm } from '../../context/RealmContext';
import { LocaleProvider } from '../../context/LocaleContext';

// Tiny harness exposing the context's auto-switch notifier so a test can fire
// it exactly the way cross-realm fallback does.
function AutoSwitchTrigger() {
    const { notifyRealmAutoSwitch } = useRealm();
    return <button onClick={notifyRealmAutoSwitch}>trigger-autoswitch</button>;
}

const replaceMock = jest.fn();
const trackEventMock = jest.fn();

jest.mock('next/navigation', () => ({
    useRouter: () => ({
        replace: replaceMock,
    }),
    usePathname: () => '/player/Someone',
}));

jest.mock('../../lib/umami', () => ({
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

describe('RealmSelector', () => {
    beforeEach(() => {
        replaceMock.mockReset();
        trackEventMock.mockReset();
        window.localStorage.clear();
        window.history.replaceState({}, '', 'http://localhost/player/Someone?realm=na');
    });

    it('returns to landing when switching realms from a nested route', () => {
        render(
            <RealmProvider>
                <RealmSelector />
            </RealmProvider>
        );

        fireEvent.click(screen.getByRole('button', { name: /realm:/i }));
        // The listbox's aria-label is migrated through t() — exact match through a
        // real render (not a translate()-only check), since an aria-label is
        // invisible to sighted visual QA and had no assertion anywhere before.
        expect(screen.getByRole('listbox', { name: 'Select realm' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('option', { name: 'EU' }));

        expect(replaceMock).toHaveBeenCalledWith('/?realm=eu');
    });

    it('tracks a realm-change umami event with the chosen realm', () => {
        render(
            <RealmProvider>
                <RealmSelector />
            </RealmProvider>
        );

        fireEvent.click(screen.getByRole('button', { name: /realm:/i }));
        fireEvent.click(screen.getByRole('option', { name: 'EU' }));

        expect(trackEventMock).toHaveBeenCalledWith('realm-change', { realm: 'eu' });
    });

    it('flashes the chip on an automatic realm switch, not on mount', () => {
        render(
            <RealmProvider>
                <RealmSelector />
                <AutoSwitchTrigger />
            </RealmProvider>
        );

        const chip = screen.getByRole('button', { name: /realm:/i });
        // No flash on a fresh mount.
        expect(chip.className).not.toContain('realm-selector-glow--armed');

        fireEvent.click(screen.getByText('trigger-autoswitch'));

        expect(chip.className).toContain('realm-selector-glow--armed');
    });

    it('does not flash on an ordinary manual realm switch', () => {
        render(
            <RealmProvider>
                <RealmSelector />
            </RealmProvider>
        );

        fireEvent.click(screen.getByRole('button', { name: /realm:/i }));
        fireEvent.click(screen.getByRole('option', { name: 'EU' }));

        const chip = screen.getByRole('button', { name: /realm:/i });
        expect(chip.className).not.toContain('realm-selector-glow--armed');
    });

    it('composes the chip\'s "Realm: <realm>" aria-label byte-identically to the old template in English', () => {
        render(
            <RealmProvider>
                <RealmSelector />
            </RealmProvider>
        );

        // nav.realmCurrent replaced a hardcoded `Realm: ${currentLabel}` template
        // literal — this is the regression net proving the key's English value
        // still composes to exactly what that literal produced.
        expect(screen.getByRole('button', { name: 'Realm: NA' })).toBeInTheDocument();
    });

    it('renders the chip aria-label in Korean and Japanese, not English (nav.realmCurrent)', () => {
        localStorage.setItem('bs-locale', 'ko');
        const { unmount } = render(
            <LocaleProvider>
                <RealmProvider>
                    <RealmSelector />
                </RealmProvider>
            </LocaleProvider>
        );
        expect(screen.getByRole('button', { name: '서버: NA' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Realm:/ })).not.toBeInTheDocument();
        unmount();

        localStorage.setItem('bs-locale', 'ja');
        render(
            <LocaleProvider>
                <RealmProvider>
                    <RealmSelector />
                </RealmProvider>
            </LocaleProvider>
        );
        expect(screen.getByRole('button', { name: 'サーバー: NA' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Realm:/ })).not.toBeInTheDocument();
    });
});