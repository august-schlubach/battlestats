import React, { useState, useEffect } from 'react';
import ActivitySVG from './ActivitySVG';
import TierSVG from './TierSVG';
import TypeSVG from './TypeSVG';
import RandomsSVG from './RandomsSVG';
import ClanMembers from './ClanMembers';
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
        clan_name: string;
        clan_id: number;
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
            <div className="text-left p-4">
                <h1 className="text-2xl font-bold">
                    {player.name}
                    <span className="ml-2 text-lg font-normal">[{player.clan_name}]</span>
                </h1>
                <div className="mt-2">
                    <span className="block text-lg font-semibold">
                        <span className="text-3xl">{player.pvp_ratio}</span>% Win Rate
                    </span>
                    <span className="block text-lg">
                        <span className="text-3xl">{player.pvp_battles.toLocaleString()}</span> PvP Battles
                    </span>
                    <span className="block text-lg">
                        <span className="text-3xl">{player.pvp_survival_rate}</span>% Survival
                    </span>
                </div>
                <div className="mt-2 text-gray-600">
                    <span className="block">Last Played: {player.days_since_last_battle} days ago</span>
                </div>
                <div className="mt-2">
                    <p>Total Battles: {player.total_battles}</p>
                    <p>PvP Wins: {player.pvp_wins}</p>
                    <p>PvP Losses: {player.pvp_losses}</p>
                    <p>Last Battle Date: {player.last_battle_date}</p>
                    <p>Clan Name: {player.clan_name}</p>
                </div>
            </div>
            {
                loading ? (
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
                        <div id="clan_members_container">
                            <ClanMembers clanId={player.clan_id} />
                        </div>
                    </>
                )
            }
            <button onClick={onBack} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded">Back</button>
        </div >
    );
};

export default PlayerDetail;
