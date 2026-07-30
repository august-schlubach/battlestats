import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CopyLinkButton from '../CopyLinkButton';

const mockTrackEvent = jest.fn();
jest.mock('../../lib/umami', () => ({
    trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

jest.mock('../../context/RealmContext', () => ({
    useRealm: () => ({ realm: 'eu' }),
}));

const setClipboard = (writeText: jest.Mock | undefined) => {
    Object.defineProperty(navigator, 'clipboard', {
        value: writeText ? { writeText } : undefined,
        configurable: true,
    });
};

describe('CopyLinkButton', () => {
    const originalClipboard = navigator.clipboard;

    beforeEach(() => {
        mockTrackEvent.mockClear();
        window.history.replaceState({}, '', '/player/Nagashino_SB_Nori');
    });

    afterEach(() => {
        Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
        jest.useRealTimers();
    });

    it('copies the current URL with the realm appended and reports success', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        setClipboard(writeText);

        render(<CopyLinkButton eventName="player-share" ariaLabel="Copy shareable player URL" />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy shareable player URL' }));

        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText.mock.calls[0][0]).toContain('/player/Nagashino_SB_Nori');
        expect(writeText.mock.calls[0][0]).toContain('realm=eu');
        expect(await screen.findByText('Copied')).toBeInTheDocument();
    });

    it('preserves a realm already present in the URL', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        setClipboard(writeText);
        window.history.replaceState({}, '', '/player/HMS083s?realm=asia');

        render(<CopyLinkButton eventName="player-share" ariaLabel="Copy shareable player URL" />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy shareable player URL' }));

        await waitFor(() => expect(writeText).toHaveBeenCalled());
        expect(writeText.mock.calls[0][0]).toContain('realm=asia');
        expect(writeText.mock.calls[0][0]).not.toContain('realm=eu');
    });

    it('tracks the share event with the active realm', async () => {
        setClipboard(jest.fn().mockResolvedValue(undefined));

        render(<CopyLinkButton eventName="clan-share" ariaLabel="Copy shareable clan URL" />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy shareable clan URL' }));

        expect(mockTrackEvent).toHaveBeenCalledWith('clan-share', { realm: 'eu' });
    });

    it('surfaces a failure when the clipboard is unavailable (insecure origin / in-app browser)', async () => {
        setClipboard(undefined);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });

        render(<CopyLinkButton eventName="player-share" ariaLabel="Copy shareable player URL" />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy shareable player URL' }));

        expect(await screen.findByText('Copy failed')).toBeInTheDocument();
        // The event still fires: intent to share is what we are measuring.
        expect(mockTrackEvent).toHaveBeenCalledWith('player-share', { realm: 'eu' });
        consoleError.mockRestore();
    });

    it('clears the feedback after the transient window', async () => {
        // Fake timers must be installed before the click, or the real
        // setTimeout the component schedules is never under our control.
        jest.useFakeTimers();
        const writeText = jest.fn().mockResolvedValue(undefined);
        setClipboard(writeText);

        render(<CopyLinkButton eventName="player-share" ariaLabel="Copy shareable player URL" />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy shareable player URL' }));

        // Flush the clipboard promise so the copied state commits.
        await act(async () => { });
        expect(screen.getByText('Copied')).toBeInTheDocument();

        act(() => {
            jest.advanceTimersByTime(1800);
        });

        expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    });
});
