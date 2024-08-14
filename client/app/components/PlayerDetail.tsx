import React from 'react';
import BattleActivity from './BattleActivity';

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
    };
    onBack: () => void;
}

const PlayerDetail: React.FC<PlayerDetailProps> = ({ player, onBack }) => {
    return (
        <div>
            <table className="w-full border-collapse">
                <tbody>
                    {Object.entries(player).map(([key, value]) => (
                        <tr key={key}>
                            <td className="px-2 py-1 text-right">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</td>
                            <td className="px-2 py-1 text-left">{typeof value === 'object' ? JSON.stringify(value) : value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div id="activity_svg_container"></div>
            <BattleActivity playerId={player.player_id} />
            <button onClick={onBack} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded">Back</button>
        </div>
    );
};

export default PlayerDetail;