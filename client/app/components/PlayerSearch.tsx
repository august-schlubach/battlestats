import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import PlayerDetail from './PlayerDetail';
import ClanDetail from './ClanDetail';

interface LandingClan {
    clan_id: number;
    name: string;
    tag: string;
    members_count: number;
}

interface LandingPlayer {
    name: string;
}

interface PlayerData {
    name: string;
    clan_id: number | null;
    clan_name: string | null;
    [key: string]: any;
}

const LANDING_LIMIT = 20;
const CLAN_HYDRATION_POLL_LIMIT = 6;
const CLAN_HYDRATION_POLL_INTERVAL_MS = 2500;

const PlayerSearch: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [playerData, setPlayerData] = useState<PlayerData | null>(null);
    const [selectedClan, setSelectedClan] = useState<LandingClan | null>(null);
    const [error, setError] = useState('');
    const [isLoadingPlayer, setIsLoadingPlayer] = useState(false);
    const [clans, setClans] = useState<LandingClan[]>([]);
    const [players, setPlayers] = useState<LandingPlayer[]>([]);
    const clanHydrationAttemptsRef = useRef<Record<string, number>>({});

    useEffect(() => {
        const onReset = () => handleBack();
        window.addEventListener('resetApp', onReset);
        return () => window.removeEventListener('resetApp', onReset);
    });

    useEffect(() => {
        const fetchLandingData = async () => {
            try {
                const [clansRes, playersRes] = await Promise.all([
                    fetch('http://localhost:8888/api/landing/clans/'),
                    fetch('http://localhost:8888/api/landing/players/'),
                ]);
                setClans(await clansRes.json());
                setPlayers(await playersRes.json());
            } catch (err) {
                console.error('Error fetching landing data:', err);
            }
        };
        fetchLandingData();
    }, []);

    const fetchPlayerByName = async (playerName: string): Promise<PlayerData | null> => {
        const response = await axios.get<PlayerData>(`http://localhost:8888/api/player/${playerName}`);
        return response.data;
    };

    const handleSearch = async () => {
        setIsLoadingPlayer(true);
        try {
            const data = await fetchPlayerByName(searchTerm);
            setPlayerData(data);
            setError('');
            setSelectedClan(null);
        } catch (err) {
            setError('Player not found');
            setPlayerData(null);
        } finally {
            setIsLoadingPlayer(false);
        }
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        handleSearch();
    };

    const handleBack = () => {
        setPlayerData(null);
        setSelectedClan(null);
        setSearchTerm('');
        setError('');
        setIsLoadingPlayer(false);
        clanHydrationAttemptsRef.current = {};
    };

    const handleSelectClan = (clan: LandingClan) => {
        setSelectedClan(clan);
        setPlayerData(null);
        setError('');
    };

    const handleSelectClanById = async (clanId: number, clanName: string) => {
        const existingClan = clans.find((clan) => clan.clan_id === clanId);
        if (existingClan) {
            handleSelectClan(existingClan);
            return;
        }

        try {
            const response = await fetch(`http://localhost:8888/api/clans/${clanId}/`);
            if (!response.ok) {
                throw new Error(`Failed to fetch clan ${clanId}`);
            }

            const data = await response.json();
            const hydratedClan: LandingClan = {
                clan_id: data.clan_id,
                name: data.name || clanName,
                tag: data.tag || '',
                members_count: data.members_count || 0,
            };
            handleSelectClan(hydratedClan);
        } catch (_err) {
            // Fall back to a minimal clan model so navigation still works.
            handleSelectClan({
                clan_id: clanId,
                name: clanName || 'Clan',
                tag: '',
                members_count: 0,
            });
        }
    };

    const handleSelectMember = async (memberName: string) => {
        setIsLoadingPlayer(true);
        try {
            const data = await fetchPlayerByName(memberName);
            setPlayerData(data);
            setError('');
            setSelectedClan(null);
        } catch (err) {
            setError('Player not found');
        } finally {
            setIsLoadingPlayer(false);
        }
    };

    useEffect(() => {
        if (!playerData?.name || playerData.clan_id) {
            return;
        }

        const playerName = playerData.name;
        const attemptsUsed = clanHydrationAttemptsRef.current[playerName] || 0;
        if (attemptsUsed >= CLAN_HYDRATION_POLL_LIMIT) {
            return;
        }

        const interval = setInterval(async () => {
            const currentAttempts = clanHydrationAttemptsRef.current[playerName] || 0;
            if (currentAttempts >= CLAN_HYDRATION_POLL_LIMIT) {
                clearInterval(interval);
                return;
            }

            clanHydrationAttemptsRef.current[playerName] = currentAttempts + 1;

            try {
                const refreshed = await fetchPlayerByName(playerName);
                if (!refreshed) {
                    return;
                }

                setPlayerData(refreshed);

                if (refreshed.clan_id) {
                    clearInterval(interval);
                }
            } catch (err) {
                if ((clanHydrationAttemptsRef.current[playerName] || 0) >= CLAN_HYDRATION_POLL_LIMIT) {
                    clearInterval(interval);
                }
            }
        }, CLAN_HYDRATION_POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [playerData?.name, playerData?.clan_id]);

    return (
        <div className="p-4">
            {playerData ? (
                <PlayerDetail
                    player={playerData}
                    onBack={handleBack}
                    onSelectMember={handleSelectMember}
                    onSelectClan={handleSelectClanById}
                    isLoading={isLoadingPlayer}
                />
            ) : selectedClan ? (
                <ClanDetail clan={selectedClan} onBack={handleBack} onSelectMember={handleSelectMember} />
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

                    {clans.length > 0 && (
                        <div className="mt-8 border-t border-gray-100 pt-6">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Clans</h3>
                            <p className="mt-2 text-sm leading-7 text-gray-700">
                                {clans.slice(0, LANDING_LIMIT).map((clan, index) => (
                                    <React.Fragment key={clan.clan_id}>
                                        <button
                                            onClick={() => handleSelectClan(clan)}
                                            className="font-medium text-gray-900 underline-offset-2 hover:underline"
                                            aria-label={`Show clan ${clan.name}`}
                                        >
                                            [{clan.tag}] {clan.name}
                                        </button>
                                        {index < Math.min(clans.length, LANDING_LIMIT) - 1 && <span className="mx-2 text-gray-400">&bull;</span>}
                                    </React.Fragment>
                                ))}
                            </p>
                        </div>
                    )}

                    {players.length > 0 && (
                        <div className="mt-6 border-t border-gray-100 pt-6">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Players</h3>
                            <p className="mt-2 text-sm leading-7 text-gray-700">
                                {players.slice(0, LANDING_LIMIT).map((player, index) => (
                                    <React.Fragment key={player.name}>
                                        <button
                                            onClick={() => handleSelectMember(player.name)}
                                            className="font-medium text-gray-900 underline-offset-2 hover:underline"
                                            aria-label={`Show player ${player.name}`}
                                        >
                                            {player.name}
                                        </button>
                                        {index < Math.min(players.length, LANDING_LIMIT) - 1 && <span className="mx-2 text-gray-400">&bull;</span>}
                                    </React.Fragment>
                                ))}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PlayerSearch;