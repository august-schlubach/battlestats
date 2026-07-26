import { fireEvent, render, screen, within } from '@testing-library/react';
import PlayerEfficiencyBadges from '../PlayerEfficiencyBadges';
import { trackEvent } from '../../lib/umami';

jest.mock('../../lib/umami', () => ({ trackEvent: jest.fn() }));
const mockTrackEvent = trackEvent as jest.Mock;

beforeEach(() => mockTrackEvent.mockClear());

const sampleRows = [
    { ship_id: 1, top_grade_class: 2, ship_name: 'Bismarck', ship_type: 'battleship', ship_tier: 8, nation: 'germany', pvp_battles: 300, win_ratio: 0.52 },
    { ship_id: 2, top_grade_class: 1, ship_name: 'Des Moines', ship_type: 'cruiser', ship_tier: 10, nation: 'usa', pvp_battles: 1200, win_ratio: 0.58 },
    { ship_id: 3, top_grade_class: 3, ship_name: 'Shimakaze', ship_type: 'destroyer', ship_tier: 10, nation: 'japan', pvp_battles: 800, win_ratio: 0.49 },
    { ship_id: 4, top_grade_class: 4, ship_name: 'Gato', ship_type: 'submarine', ship_tier: 10, nation: 'usa', pvp_battles: 150, win_ratio: 0.61 },
];

// The data-row ship names, top to bottom, so a test can assert sort order.
const rowNames = (): string[] => {
    const table = screen.getByRole('table');
    return within(table)
        .getAllByRole('row')
        // row[0] is the header row; its cells are <th> so it has no first <td>.
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0].textContent);
};

describe('PlayerEfficiencyBadges', () => {
    it('renders empty-state copy when there are no qualifying rows', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={[]} />);

        expect(screen.getByText('Efficiency Badges')).toBeInTheDocument();
        expect(screen.getByText(/No Efficiency Badge data is stored/i)).toBeInTheDocument();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('renders a sortable table with name/tier/nation/type/award/battles/WR columns', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        const table = screen.getByRole('table');
        ['Name', 'Tier', 'Nation', 'Type', 'Award', 'Battles', 'WR%'].forEach((header) => {
            expect(within(table).getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeInTheDocument();
        });
        // One data row per badged ship.
        expect(rowNames()).toHaveLength(sampleRows.length);
    });

    it('shows an award-count summary above the table', () => {
        render(
            <PlayerEfficiencyBadges
                efficiencyRows={[
                    ...sampleRows,
                    { ship_id: 20, top_grade_class: 1, ship_name: 'Moskva', ship_type: 'cruiser', ship_tier: 10 },
                ]}
            />,
        );

        const summary = screen.getByLabelText('Award totals');
        // Two Expert (Des Moines + Moskva), one each of I/II/III.
        expect(summary).toHaveTextContent('Expert: 2');
        expect(summary).toHaveTextContent('I: 1');
        expect(summary).toHaveTextContent('II: 1');
        expect(summary).toHaveTextContent('III: 1');
    });

    it('lists each ship with its tier, nation, class label, and award grade', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        const table = screen.getByRole('table');
        const desMoinesRow = within(table).getByText('Des Moines').closest('tr')!;
        const cells = within(desMoinesRow).getAllByRole('cell');
        expect(cells[0]).toHaveTextContent('Des Moines');
        expect(cells[1]).toHaveTextContent('10');
        // The nation cell is flag-only; the label rides along for screen readers
        // and as the flag's hover title.
        expect(cells[2]).toHaveTextContent('USA');
        expect(cells[2].querySelector('img')).toHaveAttribute('title', 'USA');
        expect(cells[3]).toHaveTextContent('CA');
        expect(cells[4]).toHaveTextContent('Expert');
        expect(cells[5]).toHaveTextContent('1,200');
        expect(cells[6]).toHaveTextContent('58.0%');
    });

    it('sorts by nation label ascending, then reverses', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        const nationButton = screen.getByRole('button', { name: /Nation/i });
        fireEvent.click(nationButton);
        // Germany → Japan → USA (name-tiebroken within USA).
        expect(rowNames()).toEqual(['Bismarck', 'Shimakaze', 'Des Moines', 'Gato']);

        fireEvent.click(nationButton);
        // Reversed nation order; the ship-name tiebreaker stays ascending, so
        // the USA pair keeps its Des Moines → Gato reading order.
        expect(rowNames()).toEqual(['Des Moines', 'Gato', 'Shimakaze', 'Bismarck']);
    });

    it('renders a dash for a ship with no nation and sorts it last in both directions', () => {
        render(
            <PlayerEfficiencyBadges
                efficiencyRows={[
                    ...sampleRows,
                    { ship_id: 11, top_grade_class: 2, ship_name: 'Nowhere', ship_type: 'cruiser', ship_tier: 10, nation: null },
                ]}
            />,
        );

        const nowhereRow = screen.getByText('Nowhere').closest('tr')!;
        expect(within(nowhereRow).getAllByRole('cell')[2]).toHaveTextContent('—');

        const nationButton = screen.getByRole('button', { name: /Nation/i });
        fireEvent.click(nationButton);
        expect(rowNames()[rowNames().length - 1]).toBe('Nowhere');
        fireEvent.click(nationButton);
        expect(rowNames()[rowNames().length - 1]).toBe('Nowhere');
    });

    it('sorts by battles highest-first, then reverses', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        const battlesButton = screen.getByRole('button', { name: /Battles/i });
        fireEvent.click(battlesButton);
        expect(rowNames()).toEqual(['Des Moines', 'Shimakaze', 'Bismarck', 'Gato']);

        fireEvent.click(battlesButton);
        expect(rowNames()).toEqual(['Gato', 'Bismarck', 'Shimakaze', 'Des Moines']);
    });

    it('sorts by WR highest-first', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        fireEvent.click(screen.getByRole('button', { name: /WR%/i }));
        // 0.61 Gato → 0.58 Des Moines → 0.52 Bismarck → 0.49 Shimakaze.
        expect(rowNames()).toEqual(['Gato', 'Des Moines', 'Bismarck', 'Shimakaze']);
    });

    it('renders a dash for a ship missing battles/WR and sorts it last', () => {
        render(
            <PlayerEfficiencyBadges
                efficiencyRows={[
                    ...sampleRows,
                    { ship_id: 9, top_grade_class: 2, ship_name: 'Yamato', ship_type: 'battleship', ship_tier: 10, pvp_battles: null, win_ratio: null },
                ]}
            />,
        );

        const yamatoRow = screen.getByText('Yamato').closest('tr')!;
        expect(within(yamatoRow).getAllByRole('cell')[5]).toHaveTextContent('—');

        // Highest-first battles: real numbers first, the null (Yamato) last.
        fireEvent.click(screen.getByRole('button', { name: /Battles/i }));
        expect(rowNames()[rowNames().length - 1]).toBe('Yamato');
        // Reversing keeps the null pinned at the bottom.
        fireEvent.click(screen.getByRole('button', { name: /Battles/i }));
        expect(rowNames()[rowNames().length - 1]).toBe('Yamato');
    });

    it('defaults to award order, best grade first', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        // Expert (Des Moines) → I (Bismarck) → II (Shimakaze) → III (Gato).
        expect(rowNames()).toEqual(['Des Moines', 'Bismarck', 'Shimakaze', 'Gato']);
    });

    it('sorts by name ascending, then reverses on a second click', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        const nameHeaderButton = screen.getByRole('button', { name: /Name/i });
        fireEvent.click(nameHeaderButton);
        expect(rowNames()).toEqual(['Bismarck', 'Des Moines', 'Gato', 'Shimakaze']);

        fireEvent.click(nameHeaderButton);
        expect(rowNames()).toEqual(['Shimakaze', 'Gato', 'Des Moines', 'Bismarck']);
    });

    it('sorts by tier highest-first on the first click', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        fireEvent.click(screen.getByRole('button', { name: /Tier/i }));
        // Three T10 ships (name-tiebroken) then the lone T8.
        expect(rowNames()).toEqual(['Des Moines', 'Gato', 'Shimakaze', 'Bismarck']);
    });

    it('filters the table by type', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'CA' } });
        expect(rowNames()).toEqual(['Des Moines']);
    });

    it('reflects the active filter in the summary counts', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        // Unfiltered: one of each grade.
        expect(screen.getByLabelText('Award totals')).toHaveTextContent('Expert: 1');

        // Filtering to BB leaves only Bismarck (grade I), so Expert drops to 0.
        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'BB' } });
        const summary = screen.getByLabelText('Award totals');
        expect(summary).toHaveTextContent('Expert: 0');
        expect(summary).toHaveTextContent('I: 1');
        expect(summary).toHaveTextContent('II: 0');
    });

    it('filters the table by award grade', () => {
        render(
            <PlayerEfficiencyBadges
                efficiencyRows={[
                    ...sampleRows,
                    { ship_id: 20, top_grade_class: 1, ship_name: 'Moskva', ship_type: 'cruiser', ship_tier: 10 },
                ]}
            />,
        );

        fireEvent.change(screen.getByLabelText('Award'), { target: { value: '1' } });
        expect(rowNames()).toEqual(['Des Moines', 'Moskva']);
    });

    it('tracks a umami event on a sort-header click with the resolved direction', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        fireEvent.click(screen.getByRole('button', { name: /Battles/i }));
        expect(mockTrackEvent).toHaveBeenCalledWith(
            'efficiency-sort',
            expect.objectContaining({ column: 'battles', direction: 'desc' }),
        );

        // Second click on the same column reverses and re-tracks.
        fireEvent.click(screen.getByRole('button', { name: /Battles/i }));
        expect(mockTrackEvent).toHaveBeenLastCalledWith(
            'efficiency-sort',
            expect.objectContaining({ column: 'battles', direction: 'asc' }),
        );
    });

    it('tracks a umami event on each filter change', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'CA' } });
        expect(mockTrackEvent).toHaveBeenCalledWith(
            'efficiency-filter',
            expect.objectContaining({ control: 'type', value: 'CA' }),
        );

        fireEvent.change(screen.getByLabelText('Award'), { target: { value: '1' } });
        expect(mockTrackEvent).toHaveBeenLastCalledWith(
            'efficiency-filter',
            expect.objectContaining({ control: 'award', value: '1' }),
        );
    });

    it('tracks a umami event on a Nation column sort, both directions', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        const nationButton = screen.getByRole('button', { name: /Nation/i });
        fireEvent.click(nationButton);
        expect(mockTrackEvent).toHaveBeenLastCalledWith(
            'efficiency-sort',
            expect.objectContaining({ column: 'nation', direction: 'asc' }),
        );

        fireEvent.click(nationButton);
        expect(mockTrackEvent).toHaveBeenLastCalledWith(
            'efficiency-sort',
            expect.objectContaining({ column: 'nation', direction: 'desc' }),
        );
    });

    // `source` is what separates a treemap tile click from the same filter set
    // via the bar — without it neither can be measured against the other.
    it('attributes dropdown and Clear filter changes to their own source', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        fireEvent.change(screen.getByLabelText('Nation'), { target: { value: 'usa' } });
        expect(mockTrackEvent).toHaveBeenLastCalledWith(
            'efficiency-filter',
            expect.objectContaining({ control: 'nation', value: 'usa', source: 'dropdown' }),
        );

        fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
        expect(mockTrackEvent).toHaveBeenLastCalledWith(
            'efficiency-filter',
            expect.objectContaining({ control: 'clear', value: 'all', source: 'button' }),
        );
    });

    it('clears all filters via the Clear button (disabled until a filter is active)', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        const clearButton = screen.getByRole('button', { name: /Clear/i });
        expect(clearButton).toBeDisabled();

        // Activate a filter → table narrows and Clear enables.
        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'CA' } });
        expect(rowNames()).toEqual(['Des Moines']);
        expect(clearButton).toBeEnabled();

        // Clear resets every filter and re-tracks the clear.
        fireEvent.click(clearButton);
        expect(rowNames()).toHaveLength(sampleRows.length);
        expect(clearButton).toBeDisabled();
        expect(mockTrackEvent).toHaveBeenLastCalledWith(
            'efficiency-filter',
            expect.objectContaining({ control: 'clear', value: 'all' }),
        );
    });

    it('renders the tier/type/nation/award small-multiples treemaps', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        expect(screen.getByRole('img', { name: 'Badged ships by tier' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Badged ships by class' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Badged ships by nation' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Badged ships by award grade' })).toBeInTheDocument();
    });

    it('filters the table by nation', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        // The dropdown carries readable labels but filters on the WG code.
        fireEvent.change(screen.getByLabelText('Nation'), { target: { value: 'usa' } });
        expect(rowNames()).toEqual(['Des Moines', 'Gato']);

        expect(mockTrackEvent).toHaveBeenLastCalledWith(
            'efficiency-filter',
            expect.objectContaining({ control: 'nation', value: 'usa' }),
        );
    });

    it('offers only the nations the player actually has, alphabetically', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        const options = within(screen.getByLabelText('Nation')).getAllByRole('option');
        expect(options.map((option) => option.textContent)).toEqual(['All', 'Germany', 'Japan', 'USA']);
    });

    it('combines the nation filter with the other facets', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

        fireEvent.change(screen.getByLabelText('Nation'), { target: { value: 'usa' } });
        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'CA' } });
        // Of the two USA ships only Des Moines is a cruiser.
        expect(rowNames()).toEqual(['Des Moines']);

        // Clear resets the nation filter along with the rest.
        fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
        expect(rowNames()).toHaveLength(sampleRows.length);
    });

    it('caps the table scroll container at the provided height', () => {
        render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} maxTableHeightPx={1057} />);

        const table = screen.getByRole('table');
        expect(table.parentElement).toHaveStyle({ maxHeight: '1057px' });
    });

    // The treemaps size themselves off a ResizeObserver; jest.setup's stub
    // reports no width, so d3 draws no tiles and a tile click can't be
    // exercised. Swap in a width-reporting shim (same pattern as
    // BattleHistoryTreemaps.test) for just these tests, so the other tests keep
    // running against the default stub.
    describe('treemap tile clicks', () => {
        const RealResizeObserver = globalThis.ResizeObserver;

        beforeAll(() => {
            globalThis.ResizeObserver = class {
                private cb: ResizeObserverCallback;
                constructor(cb: ResizeObserverCallback) { this.cb = cb; }
                observe() {
                    this.cb(
                        [{ contentRect: { width: 400 } } as ResizeObserverEntry],
                        this as unknown as ResizeObserver,
                    );
                }
                unobserve() {}
                disconnect() {}
            } as unknown as typeof ResizeObserver;
        });

        afterAll(() => { globalThis.ResizeObserver = RealResizeObserver; });

        // Tiles are laid out biggest-bucket first, so the first rect of the
        // nation map is USA (Des Moines + Gato).
        const firstNationTile = (): Element => {
            const map = screen.getByRole('img', { name: 'Badged ships by nation' });
            const tiles = map.querySelectorAll('rect');
            expect(tiles.length).toBeGreaterThan(0);
            return tiles[0];
        };

        it('filters the table from a nation tile and attributes it to the treemap', () => {
            render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

            fireEvent.click(firstNationTile());

            expect(rowNames()).toEqual(['Des Moines', 'Gato']);
            expect(screen.getByLabelText('Nation')).toHaveValue('usa');
            expect(mockTrackEvent).toHaveBeenLastCalledWith(
                'efficiency-filter',
                expect.objectContaining({ control: 'nation', value: 'usa', source: 'treemap' }),
            );
        });

        it('toggles the filter back off when the selected tile is clicked again', () => {
            render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

            fireEvent.click(firstNationTile());
            expect(rowNames()).toHaveLength(2);

            fireEvent.click(firstNationTile());
            expect(rowNames()).toHaveLength(sampleRows.length);
            expect(mockTrackEvent).toHaveBeenLastCalledWith(
                'efficiency-filter',
                expect.objectContaining({ control: 'nation', value: 'all', source: 'treemap' }),
            );
        });

        it('attributes tier/type/award tile clicks to the treemap too', () => {
            render(<PlayerEfficiencyBadges efficiencyRows={sampleRows} />);

            for (const [label, control] of [
                ['Badged ships by tier', 'tier'],
                ['Badged ships by class', 'type'],
                ['Badged ships by award grade', 'award'],
            ] as const) {
                const tile = screen.getByRole('img', { name: label }).querySelectorAll('rect')[0];
                fireEvent.click(tile);
                expect(mockTrackEvent).toHaveBeenLastCalledWith(
                    'efficiency-filter',
                    expect.objectContaining({ control, source: 'treemap' }),
                );
            }
        });
    });

    it('drops rows without a tier so they never reach the table', () => {
        render(
            <PlayerEfficiencyBadges
                efficiencyRows={[...sampleRows, { ship_id: 5, top_grade_class: 1, ship_name: 'Ghost', ship_type: 'cruiser', ship_tier: null }]}
            />,
        );

        expect(screen.queryByText('Ghost')).toBeNull();
        expect(rowNames()).toHaveLength(sampleRows.length);
    });
});
