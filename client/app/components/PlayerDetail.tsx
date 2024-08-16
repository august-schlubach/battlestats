import React from 'react';
import ActivitySVG from './BattleActivitySVG';
import TierSVG from './BattleTierSVG';

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
            <div className="text-left">
                <h1 className="text-2xl font-bold">{player.name} ({player.player_id})</h1>
                <p>total battles: {player.total_battles}</p>
                <p>pvp battles: {player.pvp_battles}</p>
                <p>pvp wins: {player.pvp_wins}</p>
                <p>pvp losses: {player.pvp_losses}</p>
                <p>pvp ratio: {player.pvp_ratio}</p>
                <p>pvp survival rate: {player.pvp_survival_rate}</p>
                <p>days since last battle: {player.days_since_last_battle}</p>
                <p>last battle date: {player.last_battle_date}</p>
            </div>
            <div id="activity_svg_container"></div>

            <div id="tier_svg_container"></div>
            <TierSVG playerId={player.player_id} />
            <button onClick={onBack} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded">Back</button>
        </div>
    );
};

export default PlayerDetail;