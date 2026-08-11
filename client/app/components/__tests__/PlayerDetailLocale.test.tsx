import React from 'react';
import { render, screen } from '@testing-library/react';
import PlayerDetail from '../PlayerDetail';
import { LocaleProvider, useT } from '../../context/LocaleContext';

// Player-header locale wiring (2026-08-11). Until this round PlayerDetail held
// ZERO t() calls: a ko/ja visitor got a translated tab strip sitting above an
// entirely English header — the alternating-language defect the filter-bar
// follow-on already fixed once, on a bigger surface. Browser-language
// autodetect makes it the first thing a detected visitor sees, which is why it
// was wired before that flag flips.
//
// These render under the REAL dictionaries (no translate() mock), because an
// English-only assertion cannot tell a working t() call from the hardcoded
// literal it replaced — both render the same text in the default locale.
//
// 생존/生還 and 격침 비율/キル/デス比 come from a corpus pass against
// asia.wows-numbers.com's player summary table (2026-08-11); the research doc
// had predicted 생존율/生存率 and found no hit. Asserting the exact strings
// here means a later "correction" toward the predicted forms fails loudly and
// sends the reader to ko.ts's evidence comment.

jest.mock('../PlayerDetailInsightsTabs', () => {
    const Mock = () => null;
    Mock.displayName = 'MockPlayerDetailInsightsTabs';
    return Mock;
});
jest.mock('../PlayerClanSection', () => {
    const Mock = () => null;
    Mock.displayName = 'MockPlayerClanSection';
    return Mock;
});
jest.mock('../ShipTopPlayerBanner', () => {
    const Mock = () => null;
    Mock.displayName = 'MockShipTopPlayerBanner';
    return Mock;
});
jest.mock('../../lib/umami', () => ({ trackEvent: jest.fn() }));

const basePlayer = {
    id: 1,
    name: 'Rank Captain',
    player_id: 101,
    kill_ratio: 1.22,
    actual_kdr: 1.67,
    player_score: 5.15,
    total_battles: 1000,
    pvp_battles: 800,
    pvp_wins: 440,
    pvp_losses: 360,
    pvp_ratio: 55,
    pvp_survival_rate: 40,
    wins_survival_rate: null,
    creation_date: '2024-01-01',
    days_since_last_battle: 2,
    last_battle_date: '2026-03-01',
    recent_games: {},
    is_hidden: false,
    stats_updated_at: '2026-03-01T00:00:00Z',
    last_fetch: '2026-03-01T00:00:00Z',
    last_lookup: '2026-03-01T00:00:00Z',
    clan: 0,
    clan_name: '',
    clan_tag: null,
    clan_id: 0,
    is_pve_player: false,
    verdict: null,
    randoms_json: [],
    efficiency_json: [],
    ranked_json: [],
};

const renderPlayer = (overrides: Partial<typeof basePlayer> = {}) => render(
    <LocaleProvider>
        <PlayerDetail
            player={{ ...basePlayer, ...overrides }}
            refreshStatus={{ phase: 'cooldown', secondsRemaining: 900 }}
        />
    </LocaleProvider>,
);

describe('PlayerDetail header — locale coverage', () => {
    beforeEach(() => localStorage.clear());

    it('renders the English header exactly as it did before the keys existed', () => {
        // Guards the casing trap: player.stats.winRate is a SEPARATE key from
        // common.winRate ('Win rate', sentence case) precisely so wiring this
        // card cannot restyle live English text. If someone later points the
        // card at common.winRate, this fails.
        renderPlayer();
        expect(screen.getByText('Win Rate')).toBeInTheDocument();
        expect(screen.getByText('PvP Battles')).toBeInTheDocument();
        expect(screen.getByText('KDR')).toBeInTheDocument();
        expect(screen.getByText('Survival')).toBeInTheDocument();
        expect(screen.getByText('Total Battles:')).toBeInTheDocument();
        expect(screen.getByText('PvE Battles:')).toBeInTheDocument();
        expect(screen.getByText('Last played 2 days ago')).toBeInTheDocument();
        expect(screen.getByText('Next update: 15 min')).toBeInTheDocument();
    });

    it('renders the Korean header', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderPlayer();
        expect(screen.getByText('승률')).toBeInTheDocument();
        expect(screen.getByText('생존')).toBeInTheDocument();
        expect(screen.getByText('격침 비율')).toBeInTheDocument();
        expect(screen.getByText('PvP 전투 수')).toBeInTheDocument();
        expect(screen.getByText('전체 전투 수:')).toBeInTheDocument();
        expect(screen.getByText('PvE 전투 수:')).toBeInTheDocument();
        expect(screen.getByText('마지막 전투: 2일 전')).toBeInTheDocument();
        // 분 후: bare 분 would read as a duration, not a time-until.
        expect(screen.getByText('다음 업데이트: 15분 후')).toBeInTheDocument();
        // The English literals are gone, which is what proves the wiring
        // rather than a coincidental dictionary hit.
        expect(screen.queryByText('Win Rate')).toBeNull();
        expect(screen.queryByText('Survival')).toBeNull();
    });

    it('renders the Japanese header', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderPlayer();
        expect(screen.getByText('勝率')).toBeInTheDocument();
        // 生存率 is the JP community's word for this stat; 生還 is the
        // localization site's. See ja.ts for why the community source wins.
        expect(screen.getByText('生存率')).toBeInTheDocument();
        expect(screen.getByText('キル/デス比')).toBeInTheDocument();
        expect(screen.getByText('PvP 戦闘数')).toBeInTheDocument();
        expect(screen.getByText('すべての戦闘数:')).toBeInTheDocument();
        expect(screen.getByText('最終戦闘: 2日前')).toBeInTheDocument();
        expect(screen.queryByText('Win Rate')).toBeNull();
    });

    it('translates the "last played today" branch, which has its own key', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderPlayer({ days_since_last_battle: 0 });
        expect(screen.getByText('마지막 전투: 오늘')).toBeInTheDocument();
    });

    it('translates the hidden-account notice', () => {
        localStorage.setItem('bs-locale', 'ja');
        renderPlayer({ is_hidden: true });
        expect(screen.getByText('このプレイヤーの戦績は非公開です。')).toBeInTheDocument();
        expect(screen.queryByText(/stats are hidden/)).toBeNull();
    });

    // The case that only exists once NEXT_PUBLIC_LOCALE_AUTODETECT flips: a
    // ko-browser visitor with NO stored preference. resolveInitialLocale hands
    // back 'ko' from navigator.languages, but the server prerendered the
    // English shell, so useDisplayLocale/useT must still resolve English on the
    // very FIRST render and only correct after mount. LocaleContext.test.tsx
    // asserts that staging for the stored-locale path against a bare probe;
    // this asserts it for a DETECTED locale through a real component tree,
    // which is where a hydration mismatch would actually surface (as a console
    // error on every ko arrival, in production, on the day of the flip).
    it('detected locales still render English on the first pass, then Korean', () => {
        process.env.NEXT_PUBLIC_LOCALE_AUTODETECT = '1';
        Object.defineProperty(window.navigator, 'languages', { value: ['ko-KR', 'en-US'], configurable: true });
        try {
            let firstRender: string | undefined;
            const Probe: React.FC = () => {
                const label = useT()('player.stats.winRate');
                if (firstRender === undefined) {
                    // eslint-disable-next-line react-hooks/globals
                    firstRender = label;
                }
                return <span data-testid="probe">{label}</span>;
            };
            render(<LocaleProvider><Probe /></LocaleProvider>);
            expect(firstRender).toBe('Win Rate');
            expect(screen.getByTestId('probe')).toHaveTextContent('승률');

            // And the whole header follows, with nothing persisted: detection
            // must never write bs-locale.
            renderPlayer();
            expect(screen.getAllByText('승률').length).toBeGreaterThan(0);
            expect(localStorage.getItem('bs-locale')).toBeNull();
        } finally {
            delete process.env.NEXT_PUBLIC_LOCALE_AUTODETECT;
            Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true });
        }
    });

    it('translates the share button’s accessible name', () => {
        localStorage.setItem('bs-locale', 'ko');
        renderPlayer();
        expect(screen.getByLabelText('플레이어 URL 복사')).toBeInTheDocument();
    });
});
