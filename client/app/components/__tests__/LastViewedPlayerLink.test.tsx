import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LastViewedPlayerLink from '../LastViewedPlayerLink';
import { rememberLastViewedPlayer } from '../../lib/lastViewedPlayer';

const mockTrackEvent = jest.fn();
jest.mock('../../lib/umami', () => ({
    trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

describe('LastViewedPlayerLink', () => {
    beforeEach(() => {
        window.localStorage.clear();
        mockTrackEvent.mockClear();
    });

    it('renders nothing for a first-time visitor', () => {
        const { container } = render(<LastViewedPlayerLink />);

        expect(container).toBeEmptyDOMElement();
    });

    it('offers the remembered player with a realm-qualified link', () => {
        rememberLastViewedPlayer('Nagashino_SB_Nori', 'asia');

        render(<LastViewedPlayerLink />);

        const link = screen.getByTestId('last-viewed-player-link');
        expect(link).toHaveTextContent('Nagashino_SB_Nori');
        expect(link).toHaveAttribute('href', '/player/Nagashino_SB_Nori?realm=asia');
        expect(screen.getByText('asia')).toBeInTheDocument();
    });

    it('url-encodes names that need it', () => {
        rememberLastViewedPlayer('a b', 'na');

        render(<LastViewedPlayerLink />);

        expect(screen.getByTestId('last-viewed-player-link')).toHaveAttribute(
            'href',
            '/player/a%20b?realm=na',
        );
    });

    it('tracks the click so the affordance can be measured', () => {
        rememberLastViewedPlayer('lasna', 'eu');

        render(<LastViewedPlayerLink />);
        fireEvent.click(screen.getByTestId('last-viewed-player-link'));

        expect(mockTrackEvent).toHaveBeenCalledWith('landing-last-player', { realm: 'eu' });
    });
});
