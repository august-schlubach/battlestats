import React from 'react';

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
            <h2>Player Details</h2>
            <p>ID: {player.id}</p>
            <p>Name: {player.name}</p>
            <p>Player ID: {player.player_id}</p>
            <p>Total Battles: {player.total_battles}</p>
            <p>PvP Battles: {player.pvp_battles}</p>
            <p>PvP Wins: {player.pvp_wins}</p>
            <p>PvP Losses: {player.pvp_losses}</p>
            <p>PvP Ratio: {player.pvp_ratio}</p>
            <p>PvP Survival Rate: {player.pvp_survival_rate}</p>
            <p>Wins Survival Rate: {player.wins_survival_rate}</p>
            <p>Creation Date: {player.creation_date}</p>
            <p>Days Since Last Battle: {player.days_since_last_battle}</p>
            <p>Last Battle Date: {player.last_battle_date}</p>
            <p>Recent Games: {JSON.stringify(player.recent_games)}</p>
            <p>Is Hidden: {player.is_hidden ? 'Yes' : 'No'}</p>
            <p>Stats Updated At: {player.stats_updated_at}</p>
            <p>Last Fetch: {player.last_fetch}</p>
            <p>Last Lookup: {player.last_lookup}</p>
            <p>Clan: {player.clan}</p>
            <button onClick={onBack}>Back</button>
        </div>
    );
};

export default PlayerDetail;