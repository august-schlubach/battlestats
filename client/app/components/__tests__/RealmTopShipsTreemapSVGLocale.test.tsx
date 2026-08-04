import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RealmTopShipsTreemapSVG from '../RealmTopShipsTreemapSVG';
import { LocaleProvider } from '../../context/LocaleContext';
import type { ListShip } from '../ShipLeaderboard';

// Composed-template blocker regression net (follow-on #1 of the locale-toggle
// spec). Before this fix, `landing.treemap.heading`/`landing.treemap.ariaLabel`
// composed a translated OUTER template around clauses ({bucket}, {suffix},
// {windowPhrase}, {view}) that were built as English literals in this
// component — translating the key alone would have shipped a mixed-language
// string like "NA 서버에서 가장 많이 플레이한 T10 순양함 · top 50% · 1–30 Jun".
// These tests render under ko/ja and assert the WHOLE heading/aria-label is in
// the target language, with no surviving English clause word and no literal
// `{token}` — an English-only assertion can't distinguish a working key from a
// hardcoded literal, because both produce the same English string (see
// ShipLeaderboardHeadingKey.test.tsx for the same technique applied there).

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/umami', () => ({ trackEvent: jest.fn() }));

class WidthReportingResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe() {
        this.cb(
            [{ contentRect: { width: 800 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
        );
    }
    unobserve() {}
    disconnect() {}
}

const ship = (over: Partial<ListShip>): ListShip => ({
    ship_id: 1,
    ship_name: 'Moskva',
    ship_type: 'Cruiser',
    tier: 10,
    nation: 'ussr',
    is_premium: false,
    battles: 1000,
    win_rate: 55,
    avg_damage: 90000,
    kills_per_battle: 1.1,
    ...over,
});

const renderTreemap = (props: Partial<React.ComponentProps<typeof RealmTopShipsTreemapSVG>>) => render(
    <LocaleProvider>
        <RealmTopShipsTreemapSVG
            ships={[ship({})]}
            tier={null}
            type={null}
            wrPct={null}
            {...props}
        />
    </LocaleProvider>,
);

// English clause words that must NOT survive once a locale is populated —
// these are exactly the literals the composed-template blocker used to leak
// (bucket fallback, "most-played", the WR-percentile clause, the window
// phrase, and the map/plot view names).
const ENGLISH_CLAUSE_LEAK = /most-played|top \d|rolling|ship-standings window|treemap|scatterplot|\bships\b/i;
const RAW_TOKEN_LEAK = /\{[a-zA-Z]+\}/;

describe('RealmTopShipsTreemapSVG — locale coverage (composed-template blocker)', () => {
    const realRO = globalThis.ResizeObserver;
    beforeAll(() => { globalThis.ResizeObserver = WidthReportingResizeObserver as unknown as typeof ResizeObserver; });
    afterAll(() => { globalThis.ResizeObserver = realRO; });
    beforeEach(() => { window.localStorage.clear(); });

    describe('Korean (bs-locale=ko)', () => {
        beforeEach(() => { localStorage.setItem('bs-locale', 'ko'); });

        it('renders a fully-Korean heading with bucket, WR-percentile and window clauses', () => {
            renderTreemap({
                tier: 10, type: 'Cruiser', wrPct: 50,
                windowStart: '2026-06-01', windowEnd: '2026-07-01',
            });
            const heading = screen.getByRole('heading');
            expect(heading.textContent).toBe('NA 서버에서 가장 많이 플레이한 T10 순양함 · 상위 50% · 1–30 Jun');
            expect(heading.textContent).not.toMatch(RAW_TOKEN_LEAK);
            expect(heading.textContent).not.toMatch(ENGLISH_CLAUSE_LEAK);
        });

        it('renders the Korean bucket-absent fallback ("함선") when no tier/type filter is active', () => {
            renderTreemap({});
            const heading = screen.getByRole('heading');
            expect(heading.textContent).toBe('NA 서버에서 가장 많이 플레이한 함선');
            expect(heading.textContent).not.toMatch(RAW_TOKEN_LEAK);
            expect(heading.textContent).not.toMatch(ENGLISH_CLAUSE_LEAK);
        });

        it('translates every ship-class plural used in the bucket label', () => {
            const cases: Array<[ListShip['ship_type'], string]> = [
                ['Battleship', '전함'],
                ['Cruiser', '순양함'],
                ['Destroyer', '구축함'],
                ['AirCarrier', '항공모함'],
                ['Submarine', '잠수함'],
            ];
            for (const [type, label] of cases) {
                const { unmount } = renderTreemap({ tier: 10, type: type as never, wrPct: null });
                expect(screen.getByRole('heading').textContent).toBe(`NA 서버에서 가장 많이 플레이한 T10 ${label}`);
                unmount();
            }
        });

        it('gives the SVG a fully-Korean accessible name (map view, window days known)', () => {
            renderTreemap({
                tier: 10, type: 'Cruiser', wrPct: 50,
                windowStart: '2026-06-01', windowEnd: '2026-07-31',
            });
            const label = screen.getByRole('img').getAttribute('aria-label');
            expect(label).toBe(
                'na 서버에서 최근 60일간의 함선 순위 집계 기간 동안 가장 많이 플레이한 T10 순양함을 트리맵 형태로 표시',
            );
            expect(label).not.toMatch(RAW_TOKEN_LEAK);
            expect(label).not.toMatch(ENGLISH_CLAUSE_LEAK);
        });

        it('names the view as the Korean scatterplot phrase once Plot is selected, with no window days known', () => {
            renderTreemap({});
            fireEvent.click(screen.getByRole('button', { name: 'Plot' }));
            const label = screen.getByRole('img').getAttribute('aria-label');
            expect(label).toBe(
                'na 서버에서 함선 순위 집계 기간 동안 가장 많이 플레이한 함선을 전투 수 대비 승률 산점도 형태로 표시',
            );
            expect(label).not.toMatch(RAW_TOKEN_LEAK);
            expect(label).not.toMatch(ENGLISH_CLAUSE_LEAK);
        });
    });

    describe('Japanese (bs-locale=ja)', () => {
        beforeEach(() => { localStorage.setItem('bs-locale', 'ja'); });

        it('renders a fully-Japanese heading with bucket, WR-percentile and window clauses', () => {
            renderTreemap({
                tier: 10, type: 'Cruiser', wrPct: 50,
                windowStart: '2026-06-01', windowEnd: '2026-07-01',
            });
            const heading = screen.getByRole('heading');
            expect(heading.textContent).toBe('NAサーバーで最もプレイされたT10 巡洋艦 · 上位50% · 1–30 Jun');
            expect(heading.textContent).not.toMatch(RAW_TOKEN_LEAK);
            expect(heading.textContent).not.toMatch(ENGLISH_CLAUSE_LEAK);
        });

        it('renders the Japanese bucket-absent fallback ("艦艇") when no tier/type filter is active', () => {
            renderTreemap({});
            const heading = screen.getByRole('heading');
            expect(heading.textContent).toBe('NAサーバーで最もプレイされた艦艇');
            expect(heading.textContent).not.toMatch(RAW_TOKEN_LEAK);
            expect(heading.textContent).not.toMatch(ENGLISH_CLAUSE_LEAK);
        });

        it('translates every ship-class plural used in the bucket label', () => {
            const cases: Array<[ListShip['ship_type'], string]> = [
                ['Battleship', '戦艦'],
                ['Cruiser', '巡洋艦'],
                ['Destroyer', '駆逐艦'],
                ['AirCarrier', '空母'],
                ['Submarine', '潜水艦'],
            ];
            for (const [type, label] of cases) {
                const { unmount } = renderTreemap({ tier: 10, type: type as never, wrPct: null });
                expect(screen.getByRole('heading').textContent).toBe(`NAサーバーで最もプレイされたT10 ${label}`);
                unmount();
            }
        });

        it('gives the SVG a fully-Japanese accessible name (map view, window days known)', () => {
            renderTreemap({
                tier: 10, type: 'Cruiser', wrPct: 50,
                windowStart: '2026-06-01', windowEnd: '2026-07-31',
            });
            const label = screen.getByRole('img').getAttribute('aria-label');
            expect(label).toBe(
                'naサーバーで直近60日間の艦艇ランキング集計期間に最もプレイされたT10 巡洋艦をツリーマップとして表示',
            );
            expect(label).not.toMatch(RAW_TOKEN_LEAK);
            expect(label).not.toMatch(ENGLISH_CLAUSE_LEAK);
        });

        it('names the view as the Japanese scatterplot phrase once Plot is selected, with no window days known', () => {
            renderTreemap({});
            fireEvent.click(screen.getByRole('button', { name: 'Plot' }));
            const label = screen.getByRole('img').getAttribute('aria-label');
            expect(label).toBe(
                'naサーバーで艦艇ランキング集計期間に最もプレイされた艦艇を戦闘数と勝率の散布図として表示',
            );
            expect(label).not.toMatch(RAW_TOKEN_LEAK);
            expect(label).not.toMatch(ENGLISH_CLAUSE_LEAK);
        });
    });
});
