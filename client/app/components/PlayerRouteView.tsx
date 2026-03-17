"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerDetail from './PlayerDetail';
import type { PlayerData } from './entityTypes';
import { buildClanPath, buildPlayerPath } from '../lib/entityRoutes';
import { trackEntityDetailView } from '../lib/visitAnalytics';


const LoadingPanel: React.FC<{ label: string; minHeight?: number }> = ({ label, minHeight = 220 }) => (
    <div
        className="flex animate-pulse items-center justify-center rounded-md border border-[#dbe9f6] bg-[#f7fbff] text-sm text-[#6baed6]"
        style={{ minHeight }}
    >
        {label}
    </div>
);


const readJsonOrThrow = async <T,>(response: Response, label: string): Promise<T> => {
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`${label} failed with ${response.status}: ${body.slice(0, 120)}`);
    }

    if (!contentType.toLowerCase().includes('application/json')) {
        const body = await response.text();
        throw new Error(`${label} returned non-JSON content: ${body.slice(0, 120)}`);
    }

    return response.json() as Promise<T>;
};


interface PlayerRouteViewProps {
    playerName: string;
}


const PlayerRouteView: React.FC<PlayerRouteViewProps> = ({ playerName }) => {
    const router = useRouter();
    const [playerData, setPlayerData] = useState<PlayerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const trackedPlayerIdRef = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadPlayer = async () => {
            setIsLoading(true);
            setError('');

            try {
                const response = await fetch(`http://localhost:8888/api/player/${encodeURIComponent(playerName)}/`);
                const data = await readJsonOrThrow<PlayerData>(response, `Player ${playerName}`);
                if (!cancelled) {
                    setPlayerData(data);
                }
            } catch (fetchError) {
                console.error('Error loading player route:', fetchError);
                if (!cancelled) {
                    setPlayerData(null);
                    setError('Player not found.');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void loadPlayer();
        return () => {
            cancelled = true;
        };
    }, [playerName]);

    useEffect(() => {
        if (!playerData) {
            trackedPlayerIdRef.current = null;
            return;
        }

        if (trackedPlayerIdRef.current === playerData.player_id) {
            return;
        }

        trackedPlayerIdRef.current = playerData.player_id;
        void trackEntityDetailView({
            entityType: 'player',
            entityId: playerData.player_id,
            entityName: playerData.name,
            entitySlug: playerName,
        });
    }, [playerData, playerName]);

    if (isLoading) {
        return <LoadingPanel label="Loading player profile..." minHeight={280} />;
    }

    if (!playerData) {
        return <p className="p-6 text-sm text-red-600">{error || 'Player not found.'}</p>;
    }

    return (
        <PlayerDetail
            player={playerData}
            onBack={() => router.push('/')}
            onSelectMember={(memberName) => router.push(buildPlayerPath(memberName))}
            onSelectClan={(clanId, clanName) => router.push(buildClanPath(clanId, clanName))}
            isLoading={false}
        />
    );
};


export default PlayerRouteView;