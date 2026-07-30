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
    });

    it('does not label the realm', () => {
        // Dropped deliberately: the realm rides in the href, and the row reads as a
        // list of names rather than a table of qualified entries.
        rememberLastViewedPlayer('Nagashino_SB_Nori', 'asia');

        render(<LastViewedPlayerLink />);

        expect(screen.queryByText('asia')).not.toBeInTheDocument();
    });

    it('offers every remembered player, most recent first', () => {
        rememberLastViewedPlayer('Oldest', 'na');
        rememberLastViewedPlayer('Middle', 'eu');
        rememberLastViewedPlayer('Newest', 'asia');

        render(<LastViewedPlayerLink />);

        const links = screen.getAllByTestId('last-viewed-player-link');
        expect(links.map((link) => link.textContent)).toEqual(['Newest', 'Middle', 'Oldest']);
        expect(links[0]).toHaveAttribute('href', '/player/Newest?realm=asia');
        expect(links[2]).toHaveAttribute('href', '/player/Oldest?realm=na');
    });

    it('separates the names but never leads or trails with a separator', () => {
        rememberLastViewedPlayer('First', 'na');
        rememberLastViewedPlayer('Second', 'na');
        rememberLastViewedPlayer('Third', 'na');

        render(<LastViewedPlayerLink />);

        // Three names, two separators.
        expect(screen.getAllByTestId('last-viewed-separator')).toHaveLength(2);
    });

    it('url-encodes names that need it', () => {
        rememberLastViewedPlayer('a b', 'na');

        render(<LastViewedPlayerLink />);

        expect(screen.getByTestId('last-viewed-player-link')).toHaveAttribute(
            'href',
            '/player/a%20b?realm=na',
        );
    });

    it('tracks the click with its slot so later slots can be shown to earn their space', () => {
        rememberLastViewedPlayer('lasna', 'eu');
        rememberLastViewedPlayer('second', 'na');

        render(<LastViewedPlayerLink />);
        const links = screen.getAllByTestId('last-viewed-player-link');

        fireEvent.click(links[0]);
        expect(mockTrackEvent).toHaveBeenCalledWith('landing-last-player', {
            realm: 'na',
            position: 1,
        });

        fireEvent.click(links[1]);
        expect(mockTrackEvent).toHaveBeenCalledWith('landing-last-player', {
            realm: 'eu',
            position: 2,
        });
    });
});
