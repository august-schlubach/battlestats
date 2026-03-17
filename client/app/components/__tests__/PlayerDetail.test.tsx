import React from 'react';
import { render, screen } from '@testing-library/react';
import PlayerDetail from '../PlayerDetail';

jest.mock('next/dynamic', () => {
    return () => function MockDynamicComponent() {
        return null;
    };
});

jest.mock('../DeferredSection', () => {
    return function MockDeferredSection({ children }: { children: React.ReactNode }) {
        return <>{children}</>;
    };
});

jest.mock('../PlayerEfficiencyBadges', () => {
    return function MockPlayerEfficiencyBadges() {
        return <div>Efficiency badges</div>;
    };
});

jest.mock('../SectionHeadingWithTooltip', () => {
    return function MockSectionHeadingWithTooltip({ title }: { title: string }) {
        return <div>{title}</div>;
    };
});

jest.mock('../HiddenAccountIcon', () => {
    return function MockHiddenAccountIcon() {
        return <span>hidden</span>;
    };
});

jest.mock('../useClanMembers', () => ({
    useClanMembers: () => ({ members: [], loading: false, error: null }),
}));

const basePlayer = {
    id: 1,
    name: 'Rank Captain',
    player_id: 101,
    kill_ratio: 1.22,
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
    verdict: null,
    randoms_json: [],
    efficiency_json: [],
    ranked_json: [],
};

describe('PlayerDetail efficiency-rank icon', () => {
    it('renders the tracked-player efficiency icon when the API flag is true', () => {
        render(
            <PlayerDetail
                player={{
                    ...basePlayer,
                    efficiency_rank_tier: 'II',
                    has_efficiency_rank_icon: true,
                    efficiency_rank_percentile: 0.81,
                    efficiency_rank_population_size: 120,
                    efficiency_rank_updated_at: '2026-03-16T00:00:00Z',
                }}
                onBack={() => undefined}
                onSelectMember={() => undefined}
                onSelectClan={() => undefined}
            />,
        );

        expect(screen.getByLabelText(/Battlestats efficiency rank Grade II: 81st percentile among eligible tracked players\. Based on stored WG badge profile for 120 tracked players\./i)).toBeInTheDocument();
        expect(screen.getByText('BST')).toBeInTheDocument();
        expect(screen.getByText('II')).toBeInTheDocument();
    });

    it('falls back to grade III when only the legacy icon flag is present', () => {
        render(
            <PlayerDetail
                player={{
                    ...basePlayer,
                    efficiency_rank_tier: null,
                    has_efficiency_rank_icon: true,
                    efficiency_rank_percentile: 0.62,
                    efficiency_rank_population_size: 84,
                }}
                onBack={() => undefined}
                onSelectMember={() => undefined}
                onSelectClan={() => undefined}
            />,
        );

        expect(screen.getByLabelText(/Battlestats efficiency rank Grade III: 62nd percentile among eligible tracked players\. Based on stored WG badge profile for 84 tracked players\./i)).toBeInTheDocument();
        expect(screen.getByText('III')).toBeInTheDocument();
    });

    it('hides the tracked-player efficiency icon when the API flag is false', () => {
        render(
            <PlayerDetail
                player={{
                    ...basePlayer,
                    efficiency_rank_tier: null,
                    has_efficiency_rank_icon: false,
                    efficiency_rank_percentile: 0.81,
                }}
                onBack={() => undefined}
                onSelectMember={() => undefined}
                onSelectClan={() => undefined}
            />,
        );

        expect(screen.queryByLabelText(/Battlestats efficiency rank/i)).not.toBeInTheDocument();
    });

    it('does not render the icon for hidden players even if legacy rank fields are present', () => {
        render(
            <PlayerDetail
                player={{
                    ...basePlayer,
                    is_hidden: true,
                    efficiency_rank_tier: 'E',
                    has_efficiency_rank_icon: true,
                    efficiency_rank_percentile: 0.99,
                    efficiency_rank_population_size: 120,
                }}
                onBack={() => undefined}
                onSelectMember={() => undefined}
                onSelectClan={() => undefined}
            />,
        );

        expect(screen.queryByLabelText(/Battlestats efficiency rank/i)).not.toBeInTheDocument();
    });
});