import React from 'react';
import { act, render, screen } from '@testing-library/react';

import { RealmProvider, useRealm, useDisplayRealm } from '../RealmContext';

// Mutable pathname so we can simulate client-side navigation (Link clicks).
let mockPathname = '/';
jest.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
}));

const RealmProbe: React.FC = () => {
    const { realm } = useRealm();
    return <div data-testid="realm">{realm}</div>;
};

const RealmSetterProbe: React.FC = () => {
    const { realm, setRealm } = useRealm();
    return (
        <button data-testid="realm" type="button" onClick={() => setRealm('eu')}>
            {realm}
        </button>
    );
};

describe('RealmProvider URL realm sync', () => {
    beforeEach(() => {
        window.localStorage.clear();
        mockPathname = '/';
    });

    it('adopts an explicit ?realm= on client-side navigation, not just on full load', () => {
        // Start on an ASIA page (as if the user selected ASIA / loaded an asia URL).
        window.history.replaceState({}, '', 'http://localhost/?realm=asia');
        const { rerender } = render(
            <RealmProvider>
                <RealmProbe />
            </RealmProvider>,
        );
        expect(screen.getByTestId('realm').textContent).toBe('asia');

        // Simulate clicking the footer's na-only link: URL + pathname change, no reload.
        act(() => {
            window.history.replaceState({}, '', 'http://localhost/player/lil_boots?realm=na');
            mockPathname = '/player/lil_boots';
        });
        rerender(
            <RealmProvider>
                <RealmProbe />
            </RealmProvider>,
        );

        // The bug: this stayed 'asia' (404) until a refresh. Now it follows the URL.
        expect(screen.getByTestId('realm').textContent).toBe('na');
    });

    it('keeps the stored realm when navigating to a URL without ?realm=', () => {
        window.localStorage.setItem('bs-realm', 'eu');
        window.history.replaceState({}, '', 'http://localhost/');
        const { rerender } = render(
            <RealmProvider>
                <RealmProbe />
            </RealmProvider>,
        );
        expect(screen.getByTestId('realm').textContent).toBe('eu');

        act(() => {
            window.history.replaceState({}, '', 'http://localhost/player/SomeEuPlayer');
            mockPathname = '/player/SomeEuPlayer';
        });
        rerender(
            <RealmProvider>
                <RealmProbe />
            </RealmProvider>,
        );

        expect(screen.getByTestId('realm').textContent).toBe('eu');
    });

    it('persists the realm to localStorage when the user selects one', () => {
        // The selection itself must become the stored browser preference, so a
        // later visit (no ?realm=) restores it. This locks the write half of
        // "the realm selection stays in the browser".
        window.history.replaceState({}, '', 'http://localhost/');
        render(
            <RealmProvider>
                <RealmSetterProbe />
            </RealmProvider>,
        );
        expect(window.localStorage.getItem('bs-realm')).not.toBe('eu');

        act(() => {
            screen.getByTestId('realm').click();
        });

        expect(screen.getByTestId('realm').textContent).toBe('eu');
        expect(window.localStorage.getItem('bs-realm')).toBe('eu');
    });

    it('resolves the stored realm synchronously so fetches use it on first render', () => {
        // The fetch-facing realm (useRealm) must be the stored value from the
        // very first render — not 'na' corrected later — so a bare ?realm=-less
        // entity link fetches the right realm on its first request.
        window.localStorage.setItem('bs-realm', 'asia');
        window.history.replaceState({}, '', 'http://localhost/player/SomeAsiaPlayer');
        mockPathname = '/player/SomeAsiaPlayer';

        // This test deliberately records the *first-render* realm to prove it
        // resolves synchronously (a renderHook-style probe would only see the
        // settled value and miss a "rendered 'na', corrected later" regression).
        // Capturing render output into an outer variable is exactly what the
        // react-hooks render-purity rules forbid for production components, so
        // scope-disable them for this test-only render spy.
        let firstRealm: string | undefined;
        const CaptureFirstRender: React.FC = () => {
            const { realm } = useRealm();
            if (firstRealm === undefined) {
                // eslint-disable-next-line react-hooks/globals
                firstRealm = realm;
            }
            return <div>{realm}</div>;
        };
        render(
            <RealmProvider>
                <CaptureFirstRender />
            </RealmProvider>,
        );
        expect(firstRealm).toBe('asia');
    });

    describe('timezone autodetect (NEXT_PUBLIC_REALM_AUTODETECT)', () => {
        const originalFlag = process.env.NEXT_PUBLIC_REALM_AUTODETECT;
        const setTimeZone = (timeZone: string) => {
            const resolvedOptions = () => ({ timeZone } as Intl.ResolvedDateTimeFormatOptions);
            jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
                () => ({ resolvedOptions } as unknown as Intl.DateTimeFormat),
            );
        };
        afterEach(() => {
            jest.restoreAllMocks();
            if (originalFlag === undefined) {
                delete process.env.NEXT_PUBLIC_REALM_AUTODETECT;
            } else {
                process.env.NEXT_PUBLIC_REALM_AUTODETECT = originalFlag;
            }
        });

        it('stays na with the flag off, whatever the timezone', () => {
            delete process.env.NEXT_PUBLIC_REALM_AUTODETECT;
            setTimeZone('Asia/Seoul');
            window.history.replaceState({}, '', 'http://localhost/');
            render(
                <RealmProvider>
                    <RealmProbe />
                </RealmProvider>,
            );
            expect(screen.getByTestId('realm').textContent).toBe('na');
        });

        it.each([
            ['Asia/Seoul', 'asia'],
            ['Europe/Berlin', 'eu'],
            ['America/New_York', 'na'],
        ])('defaults a first-time %s visitor to %s on the FIRST render', (tz, realm) => {
            // First-render, not settled: the landing treemap and the first
            // fetch must already be on the detected realm (see the synchronous
            // resolve test above for why that distinction matters).
            process.env.NEXT_PUBLIC_REALM_AUTODETECT = '1';
            setTimeZone(tz);
            window.history.replaceState({}, '', 'http://localhost/');
            let firstRealm: string | undefined;
            const CaptureFirstRender: React.FC = () => {
                const { realm: r } = useRealm();
                if (firstRealm === undefined) {
                    // eslint-disable-next-line react-hooks/globals
                    firstRealm = r;
                }
                return <div data-testid="realm">{r}</div>;
            };
            render(
                <RealmProvider>
                    <CaptureFirstRender />
                </RealmProvider>,
            );
            expect(firstRealm).toBe(realm);
            expect(screen.getByTestId('realm').textContent).toBe(realm);
        });

        it('never persists the detected realm, so one manual switch overrides it for good', () => {
            process.env.NEXT_PUBLIC_REALM_AUTODETECT = '1';
            setTimeZone('Asia/Seoul');
            window.history.replaceState({}, '', 'http://localhost/');
            render(
                <RealmProvider>
                    <RealmProbe />
                </RealmProvider>,
            );
            expect(screen.getByTestId('realm').textContent).toBe('asia');
            expect(window.localStorage.getItem('bs-realm')).toBeNull();
        });

        it('lets ?realm= and a stored realm both outrank detection', () => {
            process.env.NEXT_PUBLIC_REALM_AUTODETECT = '1';
            setTimeZone('Asia/Seoul');
            window.localStorage.setItem('bs-realm', 'eu');
            window.history.replaceState({}, '', 'http://localhost/');
            const { unmount } = render(
                <RealmProvider>
                    <RealmProbe />
                </RealmProvider>,
            );
            expect(screen.getByTestId('realm').textContent).toBe('eu');
            unmount();

            window.history.replaceState({}, '', 'http://localhost/?realm=na');
            render(
                <RealmProvider>
                    <RealmProbe />
                </RealmProvider>,
            );
            expect(screen.getByTestId('realm').textContent).toBe('na');
        });

        it('keeps the detected realm across client-side navigation to a bare URL', () => {
            // The pathname effect re-resolves on every navigation; with nothing
            // stored and no ?realm= it must not snap back to na.
            process.env.NEXT_PUBLIC_REALM_AUTODETECT = '1';
            setTimeZone('Asia/Tokyo');
            window.history.replaceState({}, '', 'http://localhost/');
            const { rerender } = render(
                <RealmProvider>
                    <RealmProbe />
                </RealmProvider>,
            );
            expect(screen.getByTestId('realm').textContent).toBe('asia');
            act(() => {
                window.history.replaceState({}, '', 'http://localhost/ships/t10-battleships');
                mockPathname = '/ships/t10-battleships';
            });
            rerender(
                <RealmProvider>
                    <RealmProbe />
                </RealmProvider>,
            );
            expect(screen.getByTestId('realm').textContent).toBe('asia');
        });
    });

    it('useDisplayRealm settles on the resolved realm after mount', () => {
        window.localStorage.setItem('bs-realm', 'eu');
        window.history.replaceState({}, '', 'http://localhost/');
        const DisplayProbe: React.FC = () => (
            <div data-testid="display">{useDisplayRealm()}</div>
        );
        render(
            <RealmProvider>
                <DisplayProbe />
            </RealmProvider>,
        );
        // After mount (effects flushed by render), the display realm matches.
        expect(screen.getByTestId('display').textContent).toBe('eu');
    });
});
