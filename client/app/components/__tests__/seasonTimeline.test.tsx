import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fractionalYear } from '../../lib/seasonTimeline';
import ClanBattleSeasonTimelineSVG from '../ClanBattleSeasonTimelineSVG';
import RankedSeasonTimelineSVG from '../RankedSeasonTimelineSVG';
import { fetchSharedJson } from '../../lib/sharedJsonFetch';
import { getHighlightedSeason, setHighlightedSeason } from '../../lib/rankedSeasonHighlight';

jest.mock('../../lib/sharedJsonFetch', () => ({
    fetchSharedJson: jest.fn(),
    isAbortError: () => false,
}));
const mockFetch = fetchSharedJson as jest.Mock;
const resolved = (data: unknown) => Promise.resolve({ data, headers: {} });

describe('fractionalYear', () => {
    it('parses YYYY-MM-DD to a within-year fraction', () => {
        expect(fractionalYear('2020-01-01')).toBeCloseTo(2020, 5);
        // ~mid-year
        expect(fractionalYear('2020-07-01')).toBeGreaterThan(2020.45);
        expect(fractionalYear('2020-07-01')).toBeLessThan(2020.55);
    });

    it('parses a bare year and rejects junk', () => {
        expect(fractionalYear('2019')).toBe(2019);
        expect(fractionalYear(null)).toBeNull();
        expect(fractionalYear('n/a')).toBeNull();
    });
});

describe('season timeline components', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        setHighlightedSeason(null);
    });

    it('draws the clan-battle timeline across the season span (percent WR)', async () => {
        mockFetch.mockReturnValue(resolved([
            { season_label: 'CB1', battles: 40, win_rate: 55, start_date: '2020-06-01' },
            { season_label: 'CB2', battles: 120, win_rate: 48, start_date: '2025-02-01' },
        ]));

        render(<ClanBattleSeasonTimelineSVG playerId={1} theme="light" />);
        const region = screen.getByRole('img', { name: /clan battle season activity timeline/i });
        await waitFor(() => expect(region.querySelector('svg')).toBeTruthy());
    });

    // The ranked timeline is a LATTICE: it joins the player's played seasons
    // onto the full season catalog, so it issues two requests.
    const mockRankedFetches = (catalog: unknown[], played: unknown[]) => {
        mockFetch.mockImplementation((url: string) => (
            url.includes('/api/ranked_seasons') ? resolved(catalog) : resolved(played)
        ));
    };

    const CATALOG = [
        { season_id: 1001, season_label: 'S1', season_name: 'Pilot Season', start_date: '2020-12-21', end_date: '2021-02-02' },
        { season_id: 1002, season_label: 'S2', season_name: 'The Second Season', start_date: '2021-02-17', end_date: '2021-05-14' },
        { season_id: 1003, season_label: 'S3', season_name: 'The Third Season', start_date: '2021-05-19', end_date: '2021-08-05' },
        { season_id: 1004, season_label: 'S4', season_name: 'The Fourth Season', start_date: '2021-08-18', end_date: null },
    ];

    it('draws one box per catalog season, lit only where the player played', async () => {
        mockRankedFetches(CATALOG, [
            { season_id: 1002, season_label: 'S2', total_battles: 120, win_rate: 0.51, start_date: '2021-02-17', highest_league_name: 'Silver' },
            { season_id: 1004, season_label: 'S4', total_battles: 300, win_rate: 0.57, start_date: '2021-08-18', highest_league_name: 'Gold' },
        ]);

        render(<RankedSeasonTimelineSVG playerId={2} theme="dark" />);
        const region = screen.getByRole('img', { name: /ranked season activity timeline/i });
        await waitFor(() => expect(region.querySelectorAll('rect')).toHaveLength(4));

        const boxes = Array.from(region.querySelectorAll('rect'));
        // Unplayed seasons are outline-only; played ones carry a WR fill.
        expect(boxes.map((box) => box.getAttribute('fill') === 'none'))
            .toEqual([true, false, true, false]);
        // Uniform lattice: one size for every slot, square.
        expect(new Set(boxes.map((box) => box.getAttribute('width'))).size).toBe(1);
        expect(boxes[0].getAttribute('width')).toBe(boxes[0].getAttribute('height'));
        // Seasons the player skipped still say so on hover.
        expect(boxes[0].querySelector('title')?.textContent).toMatch(/S1 \(2020\): not played/);
        expect(boxes[1].querySelector('title')?.textContent).toMatch(/S2 \(2021\): Silver · 120 battles, 51.0% WR/);
    });

    it('marks Silver and Gold+ seasons with an award above the box, Bronze with none', async () => {
        mockRankedFetches(CATALOG, [
            { season_id: 1001, season_label: 'S1', total_battles: 30, win_rate: 0.5, start_date: '2020-12-21', highest_league_name: 'Bronze' },
            { season_id: 1002, season_label: 'S2', total_battles: 120, win_rate: 0.51, start_date: '2021-02-17', highest_league_name: 'Silver' },
            { season_id: 1004, season_label: 'S4', total_battles: 300, win_rate: 0.57, start_date: '2021-08-18', highest_league_name: 'Hurricane' },
        ]);

        render(<RankedSeasonTimelineSVG playerId={4} theme="dark" />);
        const region = screen.getByRole('img', { name: /ranked season activity timeline/i });
        await waitFor(() => expect(region.querySelectorAll('rect')).toHaveLength(4));

        // Three played seasons, but Bronze earns no award: one Silver + one Gold+.
        const awards = Array.from(region.querySelectorAll('path'));
        expect(awards).toHaveLength(2);
        // Silver sits above its own box (S2, slot index 1) and Gold+ above S4.
        const centers = awards.map((award) => award.getAttribute('transform'));
        expect(centers[0]).toMatch(/rotate\(45\)$/);   // Silver: square on point
        expect(centers[1]).toMatch(/rotate\(0\)$/);    // Gold+: star
        // Awards are decorative; the box title carries the league.
        expect(awards[0].getAttribute('pointer-events')).not.toBe('auto');
    });

    it('publishes the hovered season so the scatter above can pulse its point', async () => {
        mockRankedFetches(CATALOG, [
            { season_id: 1002, season_label: 'S2', total_battles: 120, win_rate: 0.51, start_date: '2021-02-17' },
        ]);

        const { unmount } = render(<RankedSeasonTimelineSVG playerId={3} theme="dark" />);
        const region = screen.getByRole('img', { name: /ranked season activity timeline/i });
        await waitFor(() => expect(region.querySelectorAll('rect')).toHaveLength(4));
        const boxes = Array.from(region.querySelectorAll('rect'));

        expect(getHighlightedSeason()).toBeNull();

        // A played box publishes its season id...
        fireEvent.mouseOver(boxes[1]);
        expect(getHighlightedSeason()).toBe(1002);
        fireEvent.mouseOut(boxes[1]);
        expect(getHighlightedSeason()).toBeNull();

        // ...an UNPLAYED one publishes nothing: there is no point to pulse.
        fireEvent.mouseOver(boxes[0]);
        expect(getHighlightedSeason()).toBeNull();
        fireEvent.mouseOut(boxes[0]);

        // Unmounting mid-hover must not strand a highlight on the scatter.
        fireEvent.mouseOver(boxes[1]);
        expect(getHighlightedSeason()).toBe(1002);
        unmount();
        expect(getHighlightedSeason()).toBeNull();
    });

    it('keeps a played season that the catalog has not published yet', async () => {
        // WG can lag: the player has battles in a season the catalog is missing.
        // Dropping it would silently hide real play, so it is appended in order.
        mockRankedFetches(CATALOG, [
            { season_id: 1005, season_label: 'S5', total_battles: 44, win_rate: 0.5, start_date: '2021-11-17' },
        ]);

        render(<RankedSeasonTimelineSVG playerId={5} theme="light" />);
        const region = screen.getByRole('img', { name: /ranked season activity timeline/i });
        await waitFor(() => expect(region.querySelectorAll('rect')).toHaveLength(5));

        const boxes = Array.from(region.querySelectorAll('rect'));
        expect(boxes[4].getAttribute('fill')).not.toBe('none');
        // Only the CATALOG can say a season is live. An orphan has no catalog
        // row at all, so it must not inherit "in progress" from its absence.
        expect(boxes[4].querySelector('title')?.textContent)
            .toBe('S5 (2021): 44 battles, 50.0% WR');
    });

    it('falls back to the played seasons when the catalog request fails', async () => {
        mockFetch.mockImplementation((url: string) => (
            url.includes('/api/ranked_seasons')
                ? Promise.reject(new Error('catalog down'))
                : resolved([
                    { season_id: 1002, season_label: 'S2', total_battles: 120, win_rate: 0.51, start_date: '2021-02-17' },
                ])
        ));

        render(<RankedSeasonTimelineSVG playerId={6} theme="light" />);
        const region = screen.getByRole('img', { name: /ranked season activity timeline/i });
        await waitFor(() => expect(region.querySelectorAll('rect')).toHaveLength(1));
        expect(region.querySelector('rect')?.getAttribute('fill')).not.toBe('none');
        // Degraded, not wrong: with no catalog every season is an orphan, and
        // none of them may claim to be in progress. This is the state prod sits
        // in between a frontend deploy and the backend deploy that adds the
        // catalog endpoint.
        expect(region.querySelector('title')?.textContent)
            .toBe('S2 (2021): 120 battles, 51.0% WR');
    });

    it('scales markers by battles relative to the player record (min→1×, max→4×)', async () => {
        mockFetch.mockReturnValue(resolved([
            { season_label: 'CB1', battles: 10, win_rate: 50, start_date: '2020-01-01' },
            { season_label: 'CB2', battles: 100, win_rate: 55, start_date: '2022-01-01' },
        ]));

        render(<ClanBattleSeasonTimelineSVG playerId={9} theme="light" />);
        const region = screen.getByRole('img', { name: /clan battle season activity timeline/i });
        await waitFor(() => expect(region.querySelector('circle')).toBeTruthy());

        const radii = Array.from(region.querySelectorAll('circle')).map((circle) => Number(circle.getAttribute('r')));
        // Base radius 5 → fewest battles r5 (1×), most r20 (4×).
        expect(Math.min(...radii)).toBeCloseTo(5, 1);
        expect(Math.max(...radii)).toBeCloseTo(20, 1);
    });

    it('renders a placeholder when no season is dated/played', async () => {
        mockFetch.mockReturnValue(resolved([
            { season_label: 'CB1', battles: 0, win_rate: 0, start_date: null },
        ]));

        render(<ClanBattleSeasonTimelineSVG playerId={3} theme="light" />);
        const region = screen.getByRole('img', { name: /clan battle season activity timeline/i });
        await waitFor(() => expect(region.querySelector('svg')).toBeTruthy());
    });
});
