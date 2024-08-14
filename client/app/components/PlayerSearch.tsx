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
        <div className="p-4">
            {playerData ? (
                <PlayerDetail player={playerData} onBack={handleBack} />
            ) : (
                <div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <label htmlFor="search" className="block text-sm font-medium text-gray-700">Search:</label>
                        <input
                            type="text"
                            id="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                        <button type="submit" className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">Go</button>
                    </form>
                    {error && <p className="mt-2 text-red-600">{error}</p>}
                </div>
            )}
        </div>
    );
};

export default PlayerSearch;