import React from 'react';
import TierSVG from './TierSVG';
import TypeSVG from './TypeSVG';
import RandomsSVG from './RandomsSVG';
import ClanMembers from './ClanMembers';
import ClanSVG from './ClanSVG';

interface PlayerDetailProps {
    player: {
        id: number;
        name: string;
        player_id: number;
        total_battles: number;
        pvp_battles: number;
        pvp_wins: number;
        pvp_losses: number;
        pvp_ratio: number;
        pvp_survival_rate: number;
        wins_survival_rate: number | null;
        creation_date: string;
        days_since_last_battle: number;
        last_battle_date: string;
        recent_games: object;
        is_hidden: boolean;
        stats_updated_at: string;
        last_fetch: string;
        last_lookup: string | null;
        clan: number;
        clan_name: string;
        clan_id: number;
    };
    onBack: () => void;
    onSelectMember: (memberName: string) => void;
    onSelectClan: (clanId: number, clanName: string) => void;
    isLoading?: boolean;
}

const PlayerDetail: React.FC<PlayerDetailProps> = ({
    player,
    onBack,
    onSelectMember,
    onSelectClan,
    isLoading = false,
}) => {
    return (
        <div className="relative overflow-hidden bg-white p-6">
            {isLoading ? (
                <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/70 pt-6">
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm">
                        Loading player...
                    </div>
                </div>
            ) : null}
            <div className="grid grid-cols-[340px_1fr] gap-4">
                {/* First Column */}
                <div>
                    <div className="mb-3 border-b border-gray-100 pb-3">
                        {player.clan_id ? (
                            <button
                                type="button"
                                onClick={() => onSelectClan(player.clan_id, player.clan_name || "Clan")}
                                className="mt-1 text-xl font-semibold text-gray-900 underline-offset-4 hover:underline"
                                aria-label={`Open clan page for ${player.clan_name || "clan"}`}
                            >
                                {player.clan_name || 'Clan'}
                            </button>
                        ) : (
                            <h2 className="mt-1 text-xl font-semibold text-gray-900">No Clan</h2>
                        )}
                    </div>
                    {player.clan_id ? (
                        <>
                            <div id="clan_plot_container" className="mb-4">
                                <ClanSVG clanId={player.clan_id} onSelectMember={onSelectMember} />
                            </div>
                            <div id="clan_members_container" className="border-t border-gray-100 pt-4">
                                <ClanMembers clanId={player.clan_id} onSelectMember={onSelectMember} />
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-gray-500">No clan data available</p>
                    )}
                </div>

                {/* Second Column */}
                <div className="min-w-0 text-left border-l border-gray-100 pl-4">
                    <div className="mb-3 border-b border-gray-100 pb-3">
                        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                            {player.name}
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Last played {player.days_since_last_battle} days ago
                        </p>
                    </div>

                    {player.is_hidden ? (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-sm font-medium text-amber-800">
                                This player&apos;s stats are hidden.
                            </p>
                            <p className="mt-1 text-xs text-amber-700">
                                The player has set their profile to private. Detailed statistics and charts are not available.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="mt-4 grid grid-cols-3 gap-3">
                                <div className="rounded-md bg-gray-50 p-3">
                                    <p className="text-xs uppercase tracking-wide text-gray-500">Win Rate</p>
                                    <p className="mt-1 text-2xl font-semibold text-gray-900">{player.pvp_ratio}%</p>
                                </div>
                                <div className="rounded-md bg-gray-50 p-3">
                                    <p className="text-xs uppercase tracking-wide text-gray-500">PvP Battles</p>
                                    <p className="mt-1 text-2xl font-semibold text-gray-900">{player.pvp_battles.toLocaleString()}</p>
                                </div>
                                <div className="rounded-md bg-gray-50 p-3">
                                    <p className="text-xs uppercase tracking-wide text-gray-500">Survival</p>
                                    <p className="mt-1 text-2xl font-semibold text-gray-900">{player.pvp_survival_rate}%</p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                                <p>Total Battles: <span className="font-medium text-gray-900">{player.total_battles}</span></p>
                                <p>PvP Wins: <span className="font-medium text-gray-900">{player.pvp_wins}</span></p>
                                <p>PvP Losses: <span className="font-medium text-gray-900">{player.pvp_losses}</span></p>
                                <p>Last Battle Date: <span className="font-medium text-gray-900">{player.last_battle_date}</span></p>
                            </div>

                            <div className="mt-5 border-t border-gray-100 pt-5">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Top Ships (Random Battles)</h3>
                                <p className="mb-2 text-xs text-gray-500">Compares wins and total battles for the most-played ships.</p>
                                <RandomsSVG playerId={player.player_id} />
                            </div>
                            <div className="mt-4">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Performance by Tier</h3>
                                <p className="mb-2 text-xs text-gray-500">Battle volume and win rate grouped by ship tier.</p>
                                <TierSVG playerId={player.player_id} />
                            </div>
                            <div className="mt-4">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Performance by Ship Type</h3>
                                <p className="mb-2 text-xs text-gray-500">Battle volume and win rate across classes.</p>
                                <TypeSVG playerId={player.player_id} />
                            </div>
                        </>
                    )}

                    <button onClick={onBack} className="mt-5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Back</button>
                </div>
            </div>
        </div>
    );

};

export default PlayerDetail;
