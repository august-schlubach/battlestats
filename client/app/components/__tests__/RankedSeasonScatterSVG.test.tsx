import { act, render, screen, waitFor } from '@testing-library/react';
import RankedSeasonScatterSVG from '../RankedSeasonScatterSVG';
import { fetchSharedJson } from '../../lib/sharedJsonFetch';
import { rankedSeasonHighlight } from '../../lib/seasonHoverLink';

jest.mock('../../lib/sharedJsonFetch', () => ({
    fetchSharedJson: jest.fn(),
    isAbortError: () => false,
}));
const mockFetch = fetchSharedJson as jest.Mock;

const resolved = (data: unknown) => Promise.resolve({ data, headers: {} });

// jsdom has no layout, but resolveContainerChartWidth falls back to the 600px
// default (clientWidth 0), so drawChart actually runs — which lets these assert
// the degenerate-domain guards don't throw. Dots themselves aren't asserted
// (real verification is visual, per the chart's SVG nature).
describe('RankedSeasonScatterSVG', () => {
    beforeEach(() => mockFetch.mockReset());

    it('renders the labelled chart region and one WR-colored circle per season', async () => {
        mockFetch.mockReturnValue(resolved([
            { season_id: 3, season_label: 'S3', total_battles: 400, win_rate: 0.55, highest_league_name: 'Gold' },
            { season_id: 2, season_label: 'S2', total_battles: 120, win_rate: 0.49, highest_league_name: 'Silver' },
            { season_id: 1, season_label: 'S1', total_battles: 900, win_rate: 0.58, highest_league_name: 'Bronze' },
            { season_id: 0, season_label: 'S0', total_battles: 50, win_rate: 0.5 },
        ]));

        render(<RankedSeasonScatterSVG playerId={1} theme="light" />);

        const region = screen.getByRole('img', { name: /win rate versus battles/i });
        // One circle per season (4) — wait for the data draw (the initial draw is
        // a "loading" message while the fetch resolves).
        await waitFor(() => expect(region.querySelectorAll('circle')).toHaveLength(4));
        // A medal icon only for the Silver and Gold seasons (2).
        expect(region.querySelectorAll('.medal-icon')).toHaveLength(2);
    });

    it('pulses the point whose season the lattice below is hovering, and only that one', async () => {
        mockFetch.mockReturnValue(resolved([
            { season_id: 1013, season_label: 'S13', total_battles: 400, win_rate: 0.55 },
            { season_id: 1014, season_label: 'S14', total_battles: 120, win_rate: 0.49 },
        ]));

        render(<RankedSeasonScatterSVG playerId={11} theme="light" />);
        const region = screen.getByRole('img', { name: /win rate versus battles/i });
        await waitFor(() => expect(region.querySelectorAll('circle')).toHaveLength(2));

        const pointFor = (seasonId: number) => region.querySelector(`circle[data-season-id="${seasonId}"]`);
        // Every point is joinable by season id — that attribute IS the contract
        // between the two charts.
        expect(pointFor(1013)).toBeTruthy();
        expect(pointFor(1014)).toBeTruthy();
        expect(pointFor(1013)?.getAttribute('stroke-width')).toBe('1.5');

        // Hovering S13's box down in the lattice highlights S13's point here.
        act(() => rankedSeasonHighlight.set(1013));
        expect(pointFor(1013)?.getAttribute('stroke-width')).toBe('2');
        expect(pointFor(1014)?.getAttribute('stroke-width')).toBe('1.5');

        // Leaving the box restores the resting point.
        act(() => rankedSeasonHighlight.set(null));
        expect(pointFor(1013)?.getAttribute('stroke-width')).toBe('1.5');
        expect(Number(pointFor(1013)?.getAttribute('r'))).toBe(5);
    });

    it('ignores a highlight for a season it does not plot', async () => {
        mockFetch.mockReturnValue(resolved([
            { season_id: 1013, season_label: 'S13', total_battles: 400, win_rate: 0.55 },
        ]));

        render(<RankedSeasonScatterSVG playerId={12} theme="light" />);
        const region = screen.getByRole('img', { name: /win rate versus battles/i });
        await waitFor(() => expect(region.querySelectorAll('circle')).toHaveLength(1));

        // An unplayed season has a lattice box but no point; highlighting it
        // must be a no-op rather than throwing on an empty selection.
        expect(() => act(() => rankedSeasonHighlight.set(1099))).not.toThrow();
        expect(region.querySelector('circle[data-season-id="1013"]')?.getAttribute('stroke-width')).toBe('1.5');
        act(() => rankedSeasonHighlight.set(null));
    });

    it('survives a single season (collapsed domains) without throwing', async () => {
        mockFetch.mockReturnValue(resolved([
            { season_id: 1, season_label: 'S1', total_battles: 200, win_rate: 0.53 },
        ]));

        render(<RankedSeasonScatterSVG playerId={2} theme="dark" />);
        const region = screen.getByRole('img', { name: /win rate versus battles/i });
        await waitFor(() => expect(region.querySelector('svg')).toBeTruthy());
    });

    it('renders a placeholder when no season has battles', async () => {
        mockFetch.mockReturnValue(resolved([
            { season_id: 1, season_label: 'S1', total_battles: 0, win_rate: 0 },
        ]));

        render(<RankedSeasonScatterSVG playerId={3} theme="light" />);
        const region = screen.getByRole('img', { name: /win rate versus battles/i });
        await waitFor(() => expect(region.querySelector('svg')).toBeTruthy());
    });
});
