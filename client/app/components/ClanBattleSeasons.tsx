import React, { useEffect, useState } from 'react';

interface ClanBattleSeason {
    season_id: number;
    season_name: string;
    season_label: string;
    start_date: string | null;
    end_date: string | null;
    ship_tier_min: number | null;
    ship_tier_max: number | null;
    participants: number;
    roster_battles: number;
    roster_wins: number;
    roster_losses: number;
    roster_win_rate: number;
}

interface ClanBattleSeasonsProps {
    clanId: number;
}

const formatTierRange = (minTier: number | null, maxTier: number | null): string => {
    if (minTier == null && maxTier == null) return '—';
    if (minTier === maxTier) return `Tier ${minTier}`;
    if (minTier == null) return `Up to Tier ${maxTier}`;
    if (maxTier == null) return `Tier ${minTier}+`;
    return `Tiers ${minTier}-${maxTier}`;
};

const formatDateRange = (startDate: string | null, endDate: string | null): string => {
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    return startDate || endDate || '—';
};

const ClanBattleSeasons: React.FC<ClanBattleSeasonsProps> = ({ clanId }) => {
    const [seasons, setSeasons] = useState<ClanBattleSeason[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const fetchSeasons = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await fetch(`http://localhost:8888/api/fetch/clan_battle_seasons/${clanId}/`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch clan battle seasons: ${response.status}`);
                }
                const data = await response.json();
                if (!cancelled) {
                    setSeasons(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error('Error fetching clan battle seasons:', err);
                if (!cancelled) {
                    setError('Unable to load clan battles seasons.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchSeasons();

        return () => {
            cancelled = true;
        };
    }, [clanId]);

    return (
        <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Clan Battles Seasons</h3>
            <p className="mt-1 text-xs text-gray-500">Current roster aggregate by season.</p>

            {loading && <p className="mt-3 text-sm text-gray-500">Loading clan battles seasons...</p>}
            {!loading && error && <p className="mt-3 text-sm text-gray-500">{error}</p>}
            {!loading && !error && seasons.length === 0 && (
                <p className="mt-3 text-sm text-gray-500">No clan battles season data available.</p>
            )}

            {!loading && !error && seasons.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm tabular-nums text-gray-700">
                        <thead>
                            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-[0.14em] text-gray-500">
                                <th className="py-2 pr-4 text-left font-semibold">Season</th>
                                <th className="py-2 pr-4 text-left font-semibold">Dates</th>
                                <th className="py-2 pr-4 text-left font-semibold">Ships</th>
                                <th className="py-2 pr-4 text-right font-semibold">Players</th>
                                <th className="py-2 pr-4 text-right font-semibold">Battles</th>
                                <th className="py-2 pr-4 text-right font-semibold">Wins</th>
                                <th className="py-2 text-right font-semibold">WR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {seasons.map((season) => (
                                <tr key={season.season_id} className="border-b border-gray-100 align-top last:border-b-0">
                                    <td className="py-2 pr-4 text-left text-[#084594]">
                                        <div className="font-medium">{season.season_name}</div>
                                        <div className="text-xs text-gray-500">{season.season_label}</div>
                                    </td>
                                    <td className="py-2 pr-4 text-left text-gray-600">{formatDateRange(season.start_date, season.end_date)}</td>
                                    <td className="py-2 pr-4 text-left text-gray-600">{formatTierRange(season.ship_tier_min, season.ship_tier_max)}</td>
                                    <td className="py-2 pr-4 text-right">{season.participants.toLocaleString()}</td>
                                    <td className="py-2 pr-4 text-right">{season.roster_battles.toLocaleString()}</td>
                                    <td className="py-2 pr-4 text-right">{season.roster_wins.toLocaleString()}</td>
                                    <td className="py-2 text-right font-medium text-[#2171b5]">{season.roster_win_rate.toFixed(1)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ClanBattleSeasons;