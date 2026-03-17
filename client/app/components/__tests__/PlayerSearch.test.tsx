import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlayerSearch from '../PlayerSearch';

const pushMock = jest.fn();

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
        global.fetch = jest.fn((input: RequestInfo | URL) => {
            const url = input.toString();

            if (url === 'http://localhost:8888/api/landing/clans/') {
                return Promise.resolve({
                    ok: true,
                    headers: { get: () => 'application/json' },
                    json: async () => [],
                });
            }

            if (url === 'http://localhost:8888/api/landing/recent-clans/') {
                return Promise.resolve({
                    ok: true,
                    headers: { get: () => 'application/json' },
                    json: async () => [],
                });
            }

            if (url === 'http://localhost:8888/api/landing/recent/') {
                return Promise.resolve({
                    ok: true,
                    headers: { get: () => 'application/json' },
                    json: async () => [],
                });
            }

            if (url === 'http://localhost:8888/api/landing/players/?mode=random&limit=40') {
                return Promise.resolve({
                    ok: true,
                    headers: { get: () => 'application/json' },
                    json: async () => [
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
                    ],
                });
            }

            if (url === 'http://localhost:8888/api/landing/players/?mode=sigma&limit=40') {
                return Promise.resolve({
                    ok: true,
                    headers: { get: () => 'application/json' },
                    json: async () => [
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
                    ],
                });
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
});