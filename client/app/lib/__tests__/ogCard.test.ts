import {
    buildClanCardProps,
    buildDefaultCardProps,
    buildPlayerCardProps,
    buildShipCardProps,
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

    it('builds a fetch-free ship card', () => {
        const props = buildShipCardProps('Moskva', 'asia');

        expect(props.kicker).toBe('Ship · ASIA');
        expect(props.title).toBe('Moskva');
        expect(props.subtitle).toBe('Top players by win rate, rolling 30-day window');
        expect(props.stats).toEqual([]);
        // The subtitle is the explanation; a second note would duplicate it.
        expect(props.fallbackNote).toBeNull();
    });

    it('has a branded default for an unrecognised request', () => {
        expect(buildDefaultCardProps().title).toBe('World of Warships stats');
    });
});
