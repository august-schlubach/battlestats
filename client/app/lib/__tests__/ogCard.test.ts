import {
    buildClanCardProps,
    buildDefaultCardProps,
    buildPlayerCardProps,
    buildShipBoardCardProps,
    buildShipListCardProps,
    fetchShipBoardOgCard,
    fetchShipListOgCard,
    fetchClanOgCard,
    fetchPlayerOgCard,
    formatOgCount,
    formatOgRecency,
    formatOgWinRate,
    resolveOgRealm,
} from '../ogCard';

const mockFetch = (impl: jest.Mock) => {
    (global as unknown as { fetch: jest.Mock }).fetch = impl;
};

const jsonResponse = (payload: unknown, resolvedRealm: string | null = null) => ({
    ok: true,
    headers: { get: (name: string) => (name === 'X-Resolved-Realm' ? resolvedRealm : null) },
    json: async () => payload,
});

describe('resolveOgRealm', () => {
    it.each([
        ['eu', 'eu'],
        ['asia', 'asia'],
        ['na', 'na'],
    ])('passes through the supported realm %s', (input, expected) => {
        expect(resolveOgRealm(input)).toBe(expected);
    });

    it('defaults anything unrecognised to na', () => {
        expect(resolveOgRealm(null)).toBe('na');
        expect(resolveOgRealm(undefined)).toBe('na');
        expect(resolveOgRealm('ru')).toBe('na');
        expect(resolveOgRealm(['asia', 'eu'])).toBe('asia');
    });
});

describe('og formatters', () => {
    it('formats win rate to one decimal', () => {
        expect(formatOgWinRate(52.3456)).toBe('52.3%');
    });

    it('groups battle counts', () => {
        expect(formatOgCount(12481)).toBe('12,481');
    });

    it.each([
        [0, 'played today'],
        [1, 'played yesterday'],
        [12, 'played 12d ago'],
        [90, 'played 3mo ago'],
        [900, 'inactive 1y+'],
    ])('describes recency for %s days as %s', (days, expected) => {
        expect(formatOgRecency(days as number)).toBe(expected);
    });
});

describe('fetchPlayerOgCard', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        (global as unknown as { fetch: typeof originalFetch }).fetch = originalFetch;
    });

    it('extracts the numbers the card shows', async () => {
        mockFetch(jest.fn().mockResolvedValue(jsonResponse({
            pvp_ratio: 63.4,
            pvp_battles: 8421,
            days_since_last_battle: 0,
            clan_tag: 'AKZK',
            is_hidden: false,
        })));

        await expect(fetchPlayerOgCard('Nagashino_SB_Nori', 'asia')).resolves.toEqual({
            winRate: 63.4,
            battles: 8421,
            daysSinceLastBattle: 0,
            clanTag: 'AKZK',
            isHidden: false,
            resolvedRealm: null,
        });
    });

    it('requests the realm it was given', async () => {
        const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ is_hidden: false }));
        mockFetch(fetchMock);

        await fetchPlayerOgCard('HMS083s', 'asia');

        expect(fetchMock.mock.calls[0][0]).toContain('/api/player/HMS083s/?realm=asia');
    });

    it('never publishes numbers for a hidden account', async () => {
        mockFetch(jest.fn().mockResolvedValue(jsonResponse({
            pvp_ratio: 71.2,
            pvp_battles: 500,
            days_since_last_battle: 3,
            clan_tag: 'SEK',
            is_hidden: true,
        })));

        const card = await fetchPlayerOgCard('SomeHiddenPlayer', 'eu');

        expect(card).toEqual({
            winRate: null,
            battles: null,
            daysSinceLastBattle: null,
            clanTag: 'SEK',
            isHidden: true,
            resolvedRealm: null,
        });
    });

    it('returns null on a non-ok response so the card degrades to name-only', async () => {
        mockFetch(jest.fn().mockResolvedValue({ ok: false, headers: { get: () => null }, json: async () => ({}) }));

        await expect(fetchPlayerOgCard('Nobody', 'na')).resolves.toBeNull();
    });

    it('returns null when the fetch rejects (timeout, upstream down)', async () => {
        mockFetch(jest.fn().mockRejectedValue(new Error('TimeoutError')));

        await expect(fetchPlayerOgCard('Nobody', 'na')).resolves.toBeNull();
    });
});

describe('fetchClanOgCard', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        (global as unknown as { fetch: typeof originalFetch }).fetch = originalFetch;
    });

    it('reads tag, name, members and the cached clan win rate', async () => {
        mockFetch(jest.fn().mockResolvedValue(jsonResponse({
            name: 'Gluck,gluck weg waren sie',
            tag: 'GGWW5',
            members_count: 47,
            cached_clan_wr: 54.9,
        })));

        await expect(fetchClanOgCard(2000010922, 'eu')).resolves.toEqual({
            name: 'Gluck,gluck weg waren sie',
            tag: 'GGWW5',
            membersCount: 47,
            winRate: 54.9,
        });
    });

    it('tolerates a payload with no win rate', async () => {
        mockFetch(jest.fn().mockResolvedValue(jsonResponse({ name: 'X', tag: 'X', members_count: 3 })));

        await expect(fetchClanOgCard(1, 'na')).resolves.toEqual({
            name: 'X',
            tag: 'X',
            membersCount: 3,
            winRate: null,
        });
    });
});

describe('card composition', () => {
    it('shows win rate, battles and recency for a visible player', () => {
        const props = buildPlayerCardProps(
            'lasna',
            { winRate: 58.2, battles: 3140, daysSinceLastBattle: 2, clanTag: 'FX', isHidden: false, resolvedRealm: null },
            'eu',
        );

        expect(props.kicker).toBe('Player · EU');
        expect(props.title).toBe('lasna');
        expect(props.subtitle).toBe('[FX]');
        expect(props.stats?.map((s) => s.label)).toEqual(['Win rate', 'Random battles', 'Recency']);
        // Only the win-rate stat is colour-coded on the shared WR scale.
        expect(props.stats?.[0].winRate).toBe(58.2);
        expect(props.stats?.[1].winRate).toBeUndefined();
    });

    it('labels the resolved realm when it differs from the requested one', () => {
        const props = buildPlayerCardProps(
            'OnlyOnAsia',
            { winRate: 55, battles: 10, daysSinceLastBattle: 1, clanTag: null, isHidden: false, resolvedRealm: 'asia' },
            'na',
        );

        expect(props.kicker).toBe('Player · ASIA');
    });

    it('drops stats a payload does not carry rather than printing blanks', () => {
        const props = buildPlayerCardProps(
            'partial',
            { winRate: null, battles: 12, daysSinceLastBattle: null, clanTag: null, isHidden: false, resolvedRealm: null },
            'na',
        );

        expect(props.stats?.map((s) => s.label)).toEqual(['Random battles']);
        expect(props.subtitle).toBeNull();
    });

    it('renders a hidden player as name plus an explanation, never numbers', () => {
        const props = buildPlayerCardProps(
            'hidden_one',
            { winRate: null, battles: null, daysSinceLastBattle: null, clanTag: null, isHidden: true, resolvedRealm: null },
            'na',
        );

        expect(props.stats).toEqual([]);
        expect(props.fallbackNote).toBe('Profile hidden by the player');
    });

    it('falls back to a name-only card when the fetch missed', () => {
        const props = buildPlayerCardProps('unknown', null, 'na');

        expect(props.title).toBe('unknown');
        expect(props.stats).toEqual([]);
        expect(props.fallbackNote).toContain('Win rate, battles');
    });

    it('prefers the payload tag and name for a clan title, else the slug label', () => {
        expect(buildClanCardProps('pride', { name: 'Pride', tag: 'PRD', membersCount: 30, winRate: 51 }, 'na').title)
            .toBe('[PRD] Pride');
        expect(buildClanCardProps('pride', null, 'na').title).toBe('pride');
    });

    it('collapses a clan whose name is just its tag, so no card reads "[PRIDE] PRIDE"', () => {
        expect(buildClanCardProps('pride', { name: 'PRIDE', tag: 'PRIDE', membersCount: 28, winRate: 56.6 }, 'asia').title)
            .toBe('[PRIDE]');
    });

    it('falls back to a data-free ship card when the board fetch misses', () => {
        const props = buildShipBoardCardProps('Moskva', null, 'asia', null);

        expect(props.kicker).toBe('Ship · ASIA');
        expect(props.title).toBe('Moskva');
        expect(props.subtitle).toBe('Top players by win rate');
        expect(props.stats).toEqual([]);
    });

    it('has a branded default for an unrecognised request', () => {
        expect(buildDefaultCardProps().title).toBe('World of Warships stats');
    });
});


describe('ship standings cards', () => {
    const SHIPS = [
        { ship_id: 1, ship_name: 'Aki', battles: 1892, win_rate: 63.2, avg_damage: 113740, kills_per_battle: 1.12 },
        { ship_id: 2, ship_name: 'Bungo', battles: 6238, win_rate: 63.1, avg_damage: 128174, kills_per_battle: 1.27 },
        { ship_id: 3, ship_name: 'Slava', battles: 7162, win_rate: 60.0, avg_damage: 132148, kills_per_battle: 1.26 },
        { ship_id: 4, ship_name: 'Thor', battles: 7073, win_rate: 60.0, avg_damage: 102805, kills_per_battle: 1.10 },
    ];
    const listCard = { rows: SHIPS, windowDays: 60, pending: false };

    const PLAYERS = [
        { rank: 1, player_name: 'Flandre_ScarIet', win_rate: 74.45, battles: 137, avg_damage: 149417, kills_per_battle: 1.78 },
        { rank: 2, player_name: 'Kaga_Fan', win_rate: 70.1, battles: 210, avg_damage: 140000, kills_per_battle: 1.60 },
        { rank: 3, player_name: 'A_Very_Long_Captain_Name', win_rate: 68.0, battles: 300, avg_damage: 155000, kills_per_battle: 1.90 },
        { rank: 4, player_name: 'Fourth', win_rate: 66.0, battles: 90, avg_damage: 120000, kills_per_battle: 1.20 },
    ];
    const boardCard = { shipName: 'Bungo', tier: 10, rows: PLAYERS, windowDays: 60 };

    it('shows the top 3 ships by the shared sort, not the payload order', () => {
        const props = buildShipListCardProps(10, 'Battleship', 50, listCard, 'na', {
            key: 'avg_damage',
            dir: 'desc',
        });

        expect(props.kicker).toBe('Ships · NA · Top 50%');
        expect(props.title).toBe('T10 Battleships');
        expect(props.subtitle).toBe('Ranked by average damage · rolling 60 days');
        expect(props.stats?.map((s) => s.label)).toEqual(['Slava', 'Bungo', 'Aki']);
        expect(props.stats?.map((s) => s.value)).toEqual(['132,148', '128,174', '113,740']);
    });

    it('tints only win-rate values on the WR scale', () => {
        const byWr = buildShipListCardProps(10, 'Battleship', null, listCard, 'na', {
            key: 'win_rate',
            dir: 'desc',
        });
        expect(byWr.stats?.[0]).toEqual({ label: 'Aki', value: '63.2%', winRate: 63.2 });

        const byDamage = buildShipListCardProps(10, 'Battleship', null, listCard, 'na', {
            key: 'avg_damage',
            dir: 'desc',
        });
        expect(byDamage.stats?.[0].winRate).toBeNull();
    });

    it('falls back to win rate for the natural order and for a name sort', () => {
        for (const sort of [null, { key: 'ship_name' as const, dir: 'asc' as const }]) {
            const props = buildShipListCardProps(10, 'Battleship', null, listCard, 'na', sort);
            expect(props.subtitle).toBe('Ranked by win rate · rolling 60 days');
            expect(props.stats?.[0].value).toMatch(/%$/);
        }
    });

    it('preserves the payload order when no sort was shared', () => {
        const props = buildShipListCardProps(10, 'Battleship', null, listCard, 'na', null);
        expect(props.stats?.map((s) => s.label)).toEqual(['Aki', 'Bungo', 'Slava']);
    });

    it('drops the percentile from the kicker for the realm-wide aggregate', () => {
        expect(buildShipListCardProps(9, 'Destroyer', null, listCard, 'eu', null).kicker).toBe('Ships · EU');
    });

    it('renders a warming note for a pending bucket rather than an empty card', () => {
        // A cold percentile bucket carries no rows and is otherwise identical to
        // an empty one; branching on row count first would report "no ships".
        const props = buildShipListCardProps(10, 'Submarine', 25, { rows: [], windowDays: 60, pending: true }, 'na', {
            key: 'win_rate',
            dir: 'desc',
        });

        expect(props.stats).toEqual([]);
        expect(props.fallbackNote).toBe('Standings for this bracket are being computed');
    });

    it('degrades to a branded bucket card when the list fetch misses', () => {
        const props = buildShipListCardProps(8, 'Cruiser', null, null, 'asia', null);

        expect(props.title).toBe('T8 Cruisers');
        expect(props.stats).toEqual([]);
        expect(props.fallbackNote).toBe('Win rate, battles, and average damage by ship');
    });

    it('shows the top 3 players by the shared sort', () => {
        const props = buildShipBoardCardProps('Bungo', boardCard, 'na', { key: 'battles', dir: 'desc' });

        expect(props.kicker).toBe('Ship · T10 · NA');
        expect(props.title).toBe('Bungo');
        expect(props.subtitle).toBe('Ranked by battles · rolling 60 days');
        expect(props.stats?.map((s) => s.value)).toEqual(['300', '210', '137']);
    });

    it('describes rank and natural order as standings position', () => {
        expect(buildShipBoardCardProps('Bungo', boardCard, 'na', null).subtitle)
            .toBe('Ranked by standings rank · rolling 60 days');
        expect(buildShipBoardCardProps('Bungo', boardCard, 'na', { key: 'rank', dir: 'asc' }).subtitle)
            .toBe('Ranked by standings rank · rolling 60 days');
    });

    it('truncates a name that would push the three-up row past the card width', () => {
        const props = buildShipBoardCardProps('Bungo', boardCard, 'na', null);
        const long = props.stats?.[2].label ?? '';

        expect(long).toBe('A_Very_Long_Capta…');
        expect(long.length).toBeLessThanOrEqual(18);
    });

    it('prefers the payload ship name over the slug-derived label', () => {
        expect(buildShipBoardCardProps('bungo', boardCard, 'na', null).title).toBe('Bungo');
    });
});


describe('ship standings fetchers', () => {
    it('flags a pending list payload and normalises rows', async () => {
        mockFetch(jest.fn().mockResolvedValue(jsonResponse({ pending: true, window_days: 60, ships: [] })));

        const card = await fetchShipListOgCard('na', 10, 'Battleship', 25);

        expect(card?.pending).toBe(true);
        expect(card?.rows).toEqual([]);
        expect(card?.windowDays).toBe(60);
    });

    it('omits wr_pct entirely for the realm-wide aggregate', async () => {
        const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ships: [] }));
        mockFetch(fetchMock);

        await fetchShipListOgCard('eu', 9, 'AirCarrier', null);

        expect(fetchMock.mock.calls[0][0]).toContain('/api/realm/eu/ships?tier=9&type=AirCarrier');
        expect(fetchMock.mock.calls[0][0]).not.toContain('wr_pct');
    });

    it('reads the ship name off the board payload', async () => {
        mockFetch(jest.fn().mockResolvedValue(jsonResponse({
            window_days: 60,
            ship: { name: 'Bungo', tier: 10 },
            players: [{ rank: 1, player_name: 'Flandre_ScarIet', win_rate: 74.45, battles: 137, avg_damage: 149417, kills_per_battle: 1.78 }],
        })));

        const card = await fetchShipBoardOgCard(4074714832, 'na');

        expect(card?.shipName).toBe('Bungo');
        expect(card?.tier).toBe(10);
        expect(card?.rows).toHaveLength(1);
    });

    it('returns null when the board fetch fails, so the caller renders name-only', async () => {
        mockFetch(jest.fn().mockRejectedValue(new Error('upstream down')));

        expect(await fetchShipBoardOgCard(1, 'na')).toBeNull();
    });
});
