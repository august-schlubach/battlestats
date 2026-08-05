import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Footer from '../Footer';

const trackEventMock = jest.fn();
jest.mock('../../lib/umami', () => ({
    trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

jest.mock('next/navigation', () => ({
    usePathname: () => '/',
}));

describe('Footer creator-link tracking', () => {
    beforeEach(() => {
        trackEventMock.mockReset();
    });

    it('fires a footer-lil-boots umami event when the creator link is clicked', () => {
        render(<Footer />);

        const creatorLink = screen.getByRole('link', { name: 'lil_boots' });
        expect(creatorLink).toHaveAttribute('href', '/player/lil_boots?realm=na');

        fireEvent.click(creatorLink);
        expect(trackEventMock).toHaveBeenCalledWith('footer-lil-boots', { realm: 'na' });
    });

    it('fires outbound-link events with a stable target for each external link', () => {
        render(<Footer />);

        fireEvent.click(screen.getByRole('link', { name: 'Official World of Warships website' }));
        expect(trackEventMock).toHaveBeenCalledWith('outbound-link', { target: 'wows' });
    });

    it('removed the GitHub repo link entirely — no longer served, not moved', () => {
        render(<Footer />);

        expect(screen.queryByRole('link', { name: /GitHub/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Fork me on GitHub')).not.toBeInTheDocument();
    });

    it('hides the "Add a streamer!" affordance behind its kill switch (2 submissions/4mo)', () => {
        render(<Footer />);

        expect(screen.queryByRole('button', { name: 'Add a streamer!' })).not.toBeInTheDocument();
    });

    it('renders "Leave feedback" in the freed slot and fires feedback-open on click', () => {
        render(<Footer />);

        const feedbackButton = screen.getByRole('button', { name: 'Leave feedback' });
        fireEvent.click(feedbackButton);
        expect(trackEventMock).toHaveBeenCalledWith('feedback-open');

        // Opens the FeedbackModal (its dialog title matches the same translated
        // string) — confirms the button is wired, not just present.
        expect(screen.getByRole('dialog', { name: 'Leave feedback' })).toBeInTheDocument();
    });
});
