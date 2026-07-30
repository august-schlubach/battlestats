// Covers the card route's own dispatch logic, which the pure composition tests in
// lib/__tests__/ogCard.test.ts do not reach: kind routing, the clan-slug guard,
// label truncation, and above all the never-fail contract. The consumer is a
// crawler that renders whatever comes back, so a throw or a 500 would be a broken
// preview on every share of that link.
//
// Satori is stubbed: this asserts what the card was asked to draw, not the pixels
// (those were verified by rendering against the live API — see the runbook).

const imageResponseMock = jest.fn();
jest.mock('next/og', () => ({
    ImageResponse: function ImageResponse(...args: unknown[]) {
        imageResponseMock(...args);
        return { status: 200 };
    },
}));

const ogCardLayoutMock = jest.fn();
jest.mock('../../lib/ogCardLayout', () => ({
    __esModule: true,
    default: (props: unknown) => {
        ogCardLayoutMock(props);
        return { type: 'div' };
    },
}));

import { GET } from '../route';

// jsdom has no global Request, and the handler's only contract with it is `.url`.
const request = (query: string) =>
    ({ url: `https://battlestats.online/og${query}` }) as unknown as Request;

const drawnCard = () => ogCardLayoutMock.mock.calls.at(-1)?.[0];

describe('GET /og', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        imageResponseMock.mockClear();
        ogCardLayoutMock.mockClear();
        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => null },
            json: async () => ({ pvp_ratio: 55.5, pvp_battles: 22641, days_since_last_battle: 0, is_hidden: false }),
        });
    });

    afterEach(() => {
        (global as unknown as { fetch: typeof originalFetch }).fetch = originalFetch;
    });

    it('draws a player card for kind=player', async () => {
        await GET(request('?kind=player&name=Nagashino_SB_Nori&realm=asia'));

        expect(drawnCard()).toMatchObject({ kicker: 'Player · ASIA', title: 'Nagashino_SB_Nori' });
        expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/player/Nagashino_SB_Nori/?realm=asia');
    });

    it('labels the realm the backend resolved, not the one the link guessed', async () => {
        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
            ok: true,
            headers: { get: (name: string) => (name === 'X-Resolved-Realm' ? 'asia' : null) },
            json: async () => ({ pvp_ratio: 55.5, pvp_battles: 10, days_since_last_battle: 1, is_hidden: false }),
        });

        // A bare /player/Name link carries no realm, so metadata sends na.
        await GET(request('?kind=player&name=OnlyOnAsia&realm=na'));

        expect(drawnCard()).toMatchObject({ kicker: 'Player · ASIA' });
    });

    it('draws a clan card only for a parseable clan slug', async () => {
        await GET(request('?kind=clan&slug=2000010922-pride&label=pride&realm=asia'));
        expect(drawnCard()).toMatchObject({ kicker: 'Clan · ASIA' });
    });

    it('falls back to the branded default when the clan slug has no id', async () => {
        await GET(request('?kind=clan&slug=not-a-clan&label=whatever'));

        expect(drawnCard()).toMatchObject({ title: 'World of Warships stats' });
        // No id means no upstream call at all.
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('draws a ship card without any upstream call', async () => {
        await GET(request('?kind=ship&label=Moskva&realm=asia'));

        expect(drawnCard()).toMatchObject({ kicker: 'Ship · ASIA', title: 'Moskva' });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it.each([
        ['no parameters at all', ''],
        ['an unknown kind', '?kind=galaxy&name=x'],
        ['kind=player with no name', '?kind=player&realm=eu'],
        ['kind=ship with no label', '?kind=ship&realm=eu'],
    ])('still renders a card for %s', async (_case, query) => {
        const response = await GET(request(query));

        expect(drawnCard()).toMatchObject({ title: 'World of Warships stats' });
        expect(response).toBeTruthy();
    });

    it('truncates an over-long label instead of drawing unbounded text', async () => {
        await GET(request(`?kind=ship&label=${'A'.repeat(500)}`));

        expect(drawnCard().title).toHaveLength(80);
    });

    it('defaults an unrecognised realm to na', async () => {
        await GET(request('?kind=ship&label=Moskva&realm=ru'));

        expect(drawnCard()).toMatchObject({ kicker: 'Ship · NA' });
    });

    it('renders a card even when the upstream fetch fails', async () => {
        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockRejectedValue(new Error('upstream down'));

        await expect(GET(request('?kind=player&name=Nobody&realm=na'))).resolves.toBeTruthy();
        // Name-only, with the explanatory note rather than invented numbers.
        expect(drawnCard()).toMatchObject({ title: 'Nobody', stats: [] });
    });

    it('asks for the standard card size and a cacheable response', async () => {
        await GET(request('?kind=ship&label=Moskva'));

        expect(imageResponseMock.mock.calls[0][1]).toMatchObject({
            width: 1200,
            height: 630,
            headers: { 'Cache-Control': expect.stringContaining('max-age=3600') },
        });
    });
});
