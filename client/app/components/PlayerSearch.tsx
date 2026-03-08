import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import PlayerDetail from './PlayerDetail';
import ClanDetail from './ClanDetail';
import LandingClanSVG from './LandingClanSVG';

interface LandingClan {
    clan_id: number;
    name: string;
    tag: string;
    members_count: number;
    clan_wr: number | null;
    total_battles: number | null;
}

interface LandingPlayer {
    name: string;
    pvp_ratio: number | null;
}

const wrColor = (r: number | null): string => {
    if (r == null) return '#c6dbef';
    if (r > 65) return '#810c9e';
    if (r >= 60) return '#D042F3';
    if (r >= 56) return '#3182bd';
    if (r >= 54) return '#74c476';
    if (r >= 52) return '#a1d99b';
    if (r >= 50) return '#fed976';
    if (r >= 45) return '#fd8d3c';
    return '#a50f15';
};

interface PlayerData {
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
    clan_tag: string | null;
    clan_id: number;
}

const LANDING_LIMIT = 40;
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
    const [recentPlayers, setRecentPlayers] = useState<LandingPlayer[]>([]);
    const clanHydrationAttemptsRef = useRef<Record<string, number>>({});

    const fetchLandingData = useCallback(async () => {
        try {
            const [clansRes, playersRes, recentRes] = await Promise.all([
                fetch('http://localhost:8888/api/landing/clans/'),
                fetch('http://localhost:8888/api/landing/players/'),
                fetch('http://localhost:8888/api/landing/recent/'),
            ]);
            setClans(await clansRes.json());
            setPlayers(await playersRes.json());
            setRecentPlayers(await recentRes.json());
        } catch (err) {
            console.error('Error fetching landing data:', err);
        }
    }, []);

    const handleBack = useCallback(() => {
        setPlayerData(null);
        setSelectedClan(null);
        setSearchTerm('');
        setError('');
        setIsLoadingPlayer(false);
        clanHydrationAttemptsRef.current = {};
        fetchLandingData();
    }, [fetchLandingData]);

    useEffect(() => {
        const onReset = () => handleBack();
        window.addEventListener('resetApp', onReset);
        return () => window.removeEventListener('resetApp', onReset);
    }, [handleBack]);

    useEffect(() => {
        fetchLandingData();
    }, [fetchLandingData]);

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
                clan_wr: data.clan_wr ?? null,
                total_battles: data.total_battles ?? null,
            };
            handleSelectClan(hydratedClan);
        } catch (_err) {
            // Fall back to a minimal clan model so navigation still works.
            handleSelectClan({
                clan_id: clanId,
                name: clanName || 'Clan',
                tag: '',
                members_count: 0,
                clan_wr: null,
                total_battles: null,
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
        if (!playerData?.name) {
            return;
        }

        // Poll only when clan_id is present but clan_name is still missing
        // (clan record being hydrated in background). Skip for clanless players.
        const needsHydration = playerData.clan_id && !playerData.clan_name;
        if (!needsHydration) {
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

                if (refreshed.clan_id && refreshed.clan_name) {
                    clearInterval(interval);
                }
            } catch (err) {
                if ((clanHydrationAttemptsRef.current[playerName] || 0) >= CLAN_HYDRATION_POLL_LIMIT) {
                    clearInterval(interval);
                }
            }
        }, CLAN_HYDRATION_POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [playerData?.name, playerData?.clan_id, playerData?.clan_name]);

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
                    <form onSubmit={handleSubmit} className="space-y-2">
                        <label htmlFor="search" className="block text-sm font-medium text-[#2171b5]">Search:</label>
                        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                                type="text"
                                id="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="block w-full px-3 py-2 border border-[#c6dbef] rounded-md shadow-sm focus:outline-none focus:ring-[#4292c6] focus:border-[#4292c6] sm:w-1/3 sm:text-sm"
                            />
                            <button type="submit" className="px-4 py-2 bg-[#2171b5] hover:bg-[#084594] text-white rounded transition-colors">Go</button>
                        </div>
                    </form>
                    {error && <p className="mt-2 text-red-600">{error}</p>}

                    {clans.length > 0 && (
                        <div className="mt-8 pt-6">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#2171b5]">Clans</h3>
                            <div className="mt-3">
                                <LandingClanSVG
                                    clans={clans.slice(0, LANDING_LIMIT)}
                                    onSelectClan={handleSelectClan}
                                />
                            </div>
                            <p className="mt-6 text-sm leading-7 text-[#4292c6]">
                                {clans.slice(0, LANDING_LIMIT).map((clan) => (
                                    <button
                                        key={clan.clan_id}
                                        onClick={() => handleSelectClan(clan)}
                                        className="mr-3 inline-flex items-center gap-1 font-medium text-[#084594] underline-offset-2 hover:underline hover:text-[#2171b5]"
                                        aria-label={`Show clan ${clan.name}`}
                                    >
                                        <span style={{ color: wrColor(clan.clan_wr) }} aria-hidden="true">{"\u25C8"}</span>
                                        [{clan.tag}] {clan.name}
                                    </button>
                                ))}
                            </p>
                        </div>
                    )}

                    {players.length > 0 && (
                        <div className="mt-6 border-t border-[#c6dbef] pt-6">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#2171b5]">Active Players</h3>
                            <p className="mt-2 text-sm leading-7 text-[#4292c6]">
                                {players.slice(0, LANDING_LIMIT).map((player) => (
                                    <button
                                        key={player.name}
                                        onClick={() => handleSelectMember(player.name)}
                                        className="mr-3 inline-flex items-center gap-1 font-medium text-[#084594] underline-offset-2 hover:underline hover:text-[#2171b5]"
                                        aria-label={`Show player ${player.name}`}
                                    >
                                        <span style={{ color: wrColor(player.pvp_ratio) }} aria-hidden="true">{"\u25C6"}</span>
                                        {player.name}
                                    </button>
                                ))}
                            </p>

                            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#2171b5]">Recently Viewed</h3>
                            {recentPlayers.length > 0 ? (
                                <p className="mt-2 text-sm leading-7 text-[#4292c6]">
                                    {recentPlayers.slice(0, LANDING_LIMIT).map((player) => (
                                        <button
                                            key={`recent-${player.name}`}
                                            onClick={() => handleSelectMember(player.name)}
                                            className="mr-3 inline-flex items-center gap-1 font-medium text-[#084594] underline-offset-2 hover:underline hover:text-[#2171b5]"
                                            aria-label={`Show recent player ${player.name}`}
                                        >
                                            <span style={{ color: wrColor(player.pvp_ratio) }} aria-hidden="true">{"\u25C6"}</span>
                                            {player.name}
                                        </button>
                                    ))}
                                </p>
                            ) : (
                                <p className="mt-2 text-sm text-[#6baed6]">No recently viewed players yet.</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PlayerSearch;