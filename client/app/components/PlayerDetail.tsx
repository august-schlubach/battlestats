import React, { useState, useEffect } from 'react';
import ActivitySVG from './BattleActivitySVG';
import TierSVG from './BattleTierSVG';
import TypeSVG from './BattleTypeSVG';
import RandomsSVG from './BattleRandomsSVG';
import { SpinnerCircular } from 'spinners-react';

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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate loading time for SVGs
        const timer = setTimeout(() => {
            setLoading(false);
        }, 2000); // Adjust time as needed

        return () => clearTimeout(timer);
    }, []);

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
            {loading ? (
                <div className="flex justify-center items-center">
                    <SpinnerCircular size={50} thickness={100} color="#38ad48" />
                    <p>Loading...</p>
                </div>
            ) : (
                <>
                    <div id="randoms_svg_container">
                        <RandomsSVG playerId={player.player_id} />
                    </div>
                    <div id="activity_svg_container">
                        <ActivitySVG playerId={player.player_id} />
                    </div>
                    <div id="tier_svg_container">
                        <TierSVG playerId={player.player_id} />
                    </div>
                    <div id="type_svg_container">
                        <TypeSVG playerId={player.player_id} />
                    </div>
                </>
            )}
            <button onClick={onBack} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded">Back</button>
        </div>
    );
};

export default PlayerDetail;
