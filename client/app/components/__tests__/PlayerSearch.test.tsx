import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlayerSearch from '../PlayerSearch';

const pushMock = jest.fn();

const buildJsonResponse = (payload: unknown, headers: Record<string, string> = {}) => ({
    ok: true,
    headers: {
        get: (name: string) => {
            const normalizedName = name.toLowerCase();
            if (normalizedName === 'content-type') {
                return 'application/json';
            }

            const matchingEntry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedName);
            return matchingEntry ? matchingEntry[1] : null;
        },
    },
    json: async () => payload,
});

jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: pushMock,
    }),
    useSearchParams: () => ({
        get: () => null,
    }),
}));

jest.mock('../PlayerDetail', () => {
    return function MockPlayerDetail() {
        return <div data-testid="player-detail" />;
    };
});

jest.mock('../ClanDetail', () => {
    return function MockClanDetail() {
        return <div data-testid="clan-detail" />;
    };
});

describe('PlayerSearch landing efficiency icon', () => {
    beforeEach(() => {
        pushMock.mockReset();
        const clanCacheExpiry = new Date(Date.now() + (41 * 60 * 1000)).toISOString();
        const clanCacheHeaders = {
            'X-Landing-Clans-Cache-TTL-Seconds': '3600',
            'X-Landing-Clans-Cache-Cached-At': new Date().toISOString(),
            'X-Landing-Clans-Cache-Expires-At': clanCacheExpiry,
        };
        const cacheExpiry = new Date(Date.now() + (29 * 60 * 1000)).toISOString();
        const cacheHeaders = {
            'X-Landing-Players-Cache-Mode': 'random',
            'X-Landing-Players-Cache-TTL-Seconds': '3600',
            'X-Landing-Players-Cache-Cached-At': new Date().toISOString(),
            'X-Landing-Players-Cache-Expires-At': cacheExpiry,
        };
        const sigmaCacheHeaders = {
            ...cacheHeaders,
            'X-Landing-Players-Cache-Mode': 'sigma',
        };

        global.fetch = jest.fn((input: RequestInfo | URL) => {
            const url = input.toString();

            if (url === 'http://localhost:8888/api/landing/clans/') {
                return Promise.resolve(buildJsonResponse([
                    {
                        clan_id: 501,
                        name: 'ClanAlpha',
                        tag: 'ALPHA',
                        members_count: 40,
                        clan_wr: 57.4,
                        total_battles: 180000,
                        active_members: 18,
                    },
                ], clanCacheHeaders));
            }

            if (url === 'http://localhost:8888/api/landing/recent-clans/') {
                return Promise.resolve(buildJsonResponse([]));
            }

            if (url === 'http://localhost:8888/api/landing/recent/') {
                return Promise.resolve(buildJsonResponse([]));
            }

            if (url === 'http://localhost:8888/api/landing/players/?mode=random&limit=40') {
                return Promise.resolve(buildJsonResponse([
                    {
                        name: 'AcePlayer',
                        pvp_ratio: 61.2,
                        is_hidden: false,
                        is_ranked_player: true,
                        is_pve_player: true,
                        is_sleepy_player: false,
                        is_clan_battle_player: true,
                        clan_battle_win_rate: 58.4,
                        highest_ranked_league: 'Gold',
                        efficiency_rank_percentile: 0.97,
                        efficiency_rank_tier: 'E',
                        has_efficiency_rank_icon: true,
                        efficiency_rank_population_size: 367,
                        efficiency_rank_updated_at: '2026-03-17T00:00:00Z',
                    },
                    {
                        name: 'SolidPlayer',
                        pvp_ratio: 55.6,
                        is_hidden: false,
                        is_ranked_player: false,
                        is_pve_player: false,
                        is_sleepy_player: false,
                        is_clan_battle_player: false,
                        clan_battle_win_rate: null,
                        highest_ranked_league: null,
                        efficiency_rank_percentile: 0.81,
                        efficiency_rank_tier: 'II',
                        has_efficiency_rank_icon: true,
                        efficiency_rank_population_size: 124,
                        efficiency_rank_updated_at: '2026-03-17T00:00:00Z',
                    },
                ], cacheHeaders));
            }

            if (url === 'http://localhost:8888/api/landing/players/?mode=sigma&limit=40') {
                return Promise.resolve(buildJsonResponse([
                    {
                        name: 'SigmaLeader',
                        pvp_ratio: 59.8,
                        is_hidden: false,
                        is_ranked_player: false,
                        is_pve_player: false,
                        is_sleepy_player: false,
                        is_clan_battle_player: false,
                        clan_battle_win_rate: null,
                        highest_ranked_league: null,
                        efficiency_rank_percentile: 0.97,
                        efficiency_rank_tier: 'E',
                        has_efficiency_rank_icon: true,
                        efficiency_rank_population_size: 367,
                        efficiency_rank_updated_at: '2026-03-17T00:00:00Z',
                    },
                    {
                        name: 'SigmaRunnerUp',
                        pvp_ratio: 57.2,
                        is_hidden: false,
                        is_ranked_player: false,
                        is_pve_player: false,
                        is_sleepy_player: false,
                        is_clan_battle_player: false,
                        clan_battle_win_rate: null,
                        highest_ranked_league: null,
                        efficiency_rank_percentile: 0.91,
                        efficiency_rank_tier: 'I',
                        has_efficiency_rank_icon: true,
                        efficiency_rank_population_size: 367,
                        efficiency_rank_updated_at: '2026-03-17T00:00:00Z',
                    },
                ], sigmaCacheHeaders));
            }

            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        }) as jest.Mock;
    });

    it('renders the sigma only for Expert landing rows while preserving existing landing icons', async () => {
        render(<PlayerSearch />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Active Players' })).toBeInTheDocument();
        });

        const expertRow = screen.getByRole('button', { name: /Show player AcePlayer/i });
        const nonExpertRow = screen.getByRole('button', { name: /Show player SolidPlayer/i });

        expect(within(expertRow).getByText('Σ')).toBeInTheDocument();
        expect(within(expertRow).getByLabelText(/Battlestats efficiency rank Expert: 97th percentile among eligible tracked players\. Based on stored WG badge profile for 367 tracked players\./i)).toBeInTheDocument();
        expect(within(expertRow).getByLabelText(/ranked enjoyer \(Gold\)/i)).toBeInTheDocument();
        expect(within(expertRow).getByLabelText(/pve enjoyer/i)).toBeInTheDocument();
        expect(within(expertRow).getByLabelText(/clan battle enjoyer 58\.4 percent WR/i)).toBeInTheDocument();
        expect(within(nonExpertRow).queryByText('Σ')).not.toBeInTheDocument();
    });

    it('adds a Sigma filter button and switches the landing request to sigma mode', async () => {
        render(<PlayerSearch />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Sigma' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Sigma' }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('http://localhost:8888/api/landing/players/?mode=sigma&limit=40');
        });

        const sigmaLeaderRow = await screen.findByRole('button', { name: /Show player SigmaLeader/i });
        const sigmaRunnerUpRow = screen.getByRole('button', { name: /Show player SigmaRunnerUp/i });

        expect(within(sigmaLeaderRow).getByText('Σ')).toBeInTheDocument();
        expect(within(sigmaRunnerUpRow).queryByText('Σ')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sigma' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows the best formula tooltip and refreshes cache metadata on hover', async () => {
        render(<PlayerSearch />);

        const infoButton = await screen.findByRole('button', {
            name: 'Best ranking formula and player list cache refresh details',
        });

        expect(screen.getByText(/Best ≈ \(0\.40·WR_5-10 \+ 0\.22·Score \+ 0\.18·Eff \+ 0\.10·Vol_5-10 \+ 0\.06·Ranked \+ 0\.04·Clan\) × M_share/i)).toBeInTheDocument();
        expect(screen.getByText(/Current random cache refreshes in about/i)).toBeInTheDocument();

        const priorRandomCalls = (global.fetch as jest.Mock).mock.calls.filter(
            ([url]) => url === 'http://localhost:8888/api/landing/players/?mode=random&limit=40',
        ).length;

        fireEvent.mouseEnter(infoButton);

        await waitFor(() => {
            const nextRandomCalls = (global.fetch as jest.Mock).mock.calls.filter(
                ([url]) => url === 'http://localhost:8888/api/landing/players/?mode=random&limit=40',
            ).length;
            expect(nextRandomCalls).toBeGreaterThan(priorRandomCalls);
        });
    });

    it('shows the clan best tooltip and refreshes clan cache metadata on hover', async () => {
        render(<PlayerSearch />);

        const infoButton = await screen.findByRole('button', {
            name: 'Clan ranking formula and clan list cache refresh details',
        });

        expect(screen.getByText(/Best_clan ≈ WR × I\(Battles ≥ 100k\) × I\(ActiveShare ≥ 0\.30\), tie → Battles/i)).toBeInTheDocument();
        expect(screen.getByText(/Current clan cache refreshes in about/i)).toBeInTheDocument();

        const priorClanCalls = (global.fetch as jest.Mock).mock.calls.filter(
            ([url]) => url === 'http://localhost:8888/api/landing/clans/',
        ).length;

        fireEvent.mouseEnter(infoButton);

        await waitFor(() => {
            const nextClanCalls = (global.fetch as jest.Mock).mock.calls.filter(
                ([url]) => url === 'http://localhost:8888/api/landing/clans/',
            ).length;
            expect(nextClanCalls).toBeGreaterThan(priorClanCalls);
        });
    });
});