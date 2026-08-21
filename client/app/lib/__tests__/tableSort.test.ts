import { sortRows, applySort, parseSort } from '../tableSort';

interface Row {
    ship_name: string;
    win_rate: number;
    battles: number;
}

const ROWS: Row[] = [
    { ship_name: 'Bungo', win_rate: 63.1, battles: 6238 },
    { ship_name: 'Aki', win_rate: 63.2, battles: 1892 },
    { ship_name: 'Slava', win_rate: 60.0, battles: 7162 },
];

const SORTABLE = ['ship_name', 'win_rate', 'battles'] as const;
const TEXT = ['ship_name'] as const;

describe('sortRows', () => {
    it('orders numeric columns descending best-first', () => {
        expect(sortRows(ROWS, 'win_rate', 'desc').map((r) => r.ship_name)).toEqual([
            'Aki',
            'Bungo',
            'Slava',
        ]);
    });

    it('orders numeric columns ascending', () => {
        expect(sortRows(ROWS, 'battles', 'asc').map((r) => r.ship_name)).toEqual([
            'Aki',
            'Bungo',
            'Slava',
        ]);
    });

    it('compares string columns by locale', () => {
        expect(sortRows(ROWS, 'ship_name', 'asc').map((r) => r.ship_name)).toEqual([
            'Aki',
            'Bungo',
            'Slava',
        ]);
    });

    it('does not mutate the input array', () => {
        const before = ROWS.map((r) => r.ship_name);
        sortRows(ROWS, 'win_rate', 'asc');
        expect(ROWS.map((r) => r.ship_name)).toEqual(before);
    });
});

describe('applySort', () => {
    it('preserves the server natural order when sort is null', () => {
        expect(applySort(ROWS, null)).toBe(ROWS);
    });

    it('applies the sort when present', () => {
        expect(applySort(ROWS, { key: 'win_rate', dir: 'desc' })[0].ship_name).toBe('Aki');
    });
});

describe('parseSort', () => {
    it('returns null for a missing key so natural order survives a bare link', () => {
        expect(parseSort<Row>(null, null, SORTABLE, TEXT)).toBeNull();
    });

    it('rejects an unknown key rather than guessing', () => {
        expect(parseSort<Row>('dropped_column', 'desc', SORTABLE, TEXT)).toBeNull();
    });

    it('honours an explicit direction', () => {
        expect(parseSort<Row>('win_rate', 'asc', SORTABLE, TEXT)).toEqual({
            key: 'win_rate',
            dir: 'asc',
        });
    });

    it('defaults numeric columns to descending', () => {
        expect(parseSort<Row>('win_rate', null, SORTABLE, TEXT)).toEqual({
            key: 'win_rate',
            dir: 'desc',
        });
    });

    it('defaults text columns to ascending', () => {
        expect(parseSort<Row>('ship_name', undefined, SORTABLE, TEXT)).toEqual({
            key: 'ship_name',
            dir: 'asc',
        });
    });

    it('falls back to the column default for a malformed direction', () => {
        expect(parseSort<Row>('battles', 'sideways', SORTABLE, TEXT)).toEqual({
            key: 'battles',
            dir: 'desc',
        });
    });
});
