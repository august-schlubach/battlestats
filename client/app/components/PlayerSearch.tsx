import React, { useState } from 'react';
import axios from 'axios';
import PlayerDetail from './PlayerDetail';

const PlayerSearch: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [playerData, setPlayerData] = useState(null);
    const [error, setError] = useState('');

    const handleSearch = async () => {
        try {
            const response = await axios.get(`http://localhost:8888/api/player/${searchTerm}`);
            setPlayerData(response.data);
            setError('');
        } catch (err) {
            setError('Player not found');
            setPlayerData(null);
        }
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        handleSearch();
    };

    const handleBack = () => {
        setPlayerData(null);
        setSearchTerm('');
        setError('');
    };

    return (
        <div>
            {playerData ? (
                <PlayerDetail player={playerData} onBack={handleBack} />
            ) : (
                <div>
                    <form onSubmit={handleSubmit}>
                        <label htmlFor="search">Search:</label>
                        <input
                            type="text"
                            id="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <button type="submit">Go</button>
                    </form>
                    {error && <p>{error}</p>}
                </div>
            )}
        </div>
    );
};

export default PlayerSearch;