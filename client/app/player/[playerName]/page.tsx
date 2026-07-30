import React from 'react';
import type { Metadata } from 'next';
import PlayerRouteView from '../../components/PlayerRouteView';
import { getSiteUrl } from '../../lib/siteOrigin';


interface PlayerPageProps {
    params: Promise<{
        playerName: string;
    }>;
    searchParams: Promise<{
        realm?: string;
    }>;
}


export async function generateMetadata({ params, searchParams }: PlayerPageProps): Promise<Metadata> {
    const { playerName } = await params;
    const { realm } = await searchParams;
    const realmParam = realm && ['na', 'eu', 'asia'].includes(realm) ? realm : 'na';
    const decoded = decodeURIComponent(playerName);
    const url = getSiteUrl(`/player/${playerName}?realm=${realmParam}`);
    // The card renders the player's real numbers. It is built here rather than by
    // the opengraph-image file convention because only metadata sees the realm,
    // and a realm-blind card can show a same-named account from another realm.
    // The numbers stay out of `description`: a fetch here would sit on the HTML
    // critical path for every visitor, whereas the card route is only reached
    // when a crawler scrapes a shared link (and it is Cache-Control'd).
    const ogImage = getSiteUrl(
        `/og?kind=player&name=${encodeURIComponent(decoded)}&realm=${realmParam}`,
    );

    return {
        title: `${decoded} — WoWs Battlestats`,
        description: `World of Warships statistics for ${decoded} — win rate, battles, survival rate, ships, ranked, and more.`,
        alternates: { canonical: url },
        openGraph: {
            title: `${decoded} — WoWs Battlestats`,
            description: `Player statistics for ${decoded} on World of Warships.`,
            url,
            siteName: 'WoWs Battlestats',
            type: 'profile',
            images: [{ url: ogImage, width: 1200, height: 630, alt: `${decoded} — WoWs Battlestats` }],
        },
        twitter: {
            card: 'summary_large_image',
            title: `${decoded} — WoWs Battlestats`,
            description: `Player statistics for ${decoded} on World of Warships.`,
            images: [ogImage],
        },
    };
}


const PlayerPage = async ({ params }: PlayerPageProps) => {
    const { playerName } = await params;
    // key={playerName} remounts the main well on a soft-nav player swap so
    // per-player well state (selected tab, scroll, sort) never bleeds across
    // players.
    return <PlayerRouteView key={playerName} playerName={playerName} />;
};


export default PlayerPage;