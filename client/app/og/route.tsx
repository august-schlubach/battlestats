import { ImageResponse } from 'next/og';
import ogCardLayout, { type OgCardLayoutProps } from '../lib/ogCardLayout';
import {
    OG_IMAGE_SIZE,
    OG_REVALIDATE_SECONDS,
    buildClanCardProps,
    buildDefaultCardProps,
    buildPlayerCardProps,
    buildShipCardProps,
    fetchClanOgCard,
    fetchPlayerOgCard,
    resolveOgRealm,
} from '../lib/ogCard';
import { parseClanIdFromRouteSegment } from '../lib/entityRoutes';

// Dynamic Open Graph card renderer: GET /og?kind=player&name=…&realm=asia
//
// Why a route and not the `opengraph-image.tsx` file convention: image routes
// receive `params` but no `searchParams`, so a conventional card cannot know the
// realm — and realm is not cosmetic here. The same nickname can exist on two
// realms as two unrelated accounts, and ASIA outdraws NA on this site, so a
// realm-blind card would confidently show the wrong player's numbers. Metadata
// *can* read searchParams, so `generateMetadata` builds this URL with the realm
// baked in.
//
// It cannot live under /api/*: next.config.mjs rewrites that whole prefix to
// Django.
//
// Contract: this endpoint never fails. An unknown kind, a missing parameter, or
// an upstream miss still renders a branded card, because the consumer is a
// crawler that shows whatever comes back — an error would be a broken preview.
//
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

const CACHE_CONTROL = `public, max-age=${OG_REVALIDATE_SECONDS}, s-maxage=86400, stale-while-revalidate=86400`;

const MAX_LABEL_LENGTH = 80;

const respond = (props: OgCardLayoutProps) =>
    new ImageResponse(ogCardLayout(props), {
        ...OG_IMAGE_SIZE,
        headers: { 'Cache-Control': CACHE_CONTROL },
    });

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get('kind');
    const realm = resolveOgRealm(searchParams.get('realm'));
    const label = (searchParams.get('label') ?? '').slice(0, MAX_LABEL_LENGTH);

    if (kind === 'player') {
        const name = (searchParams.get('name') ?? '').slice(0, MAX_LABEL_LENGTH);
        if (name) {
            return respond(buildPlayerCardProps(name, await fetchPlayerOgCard(name, realm), realm));
        }
    }

    if (kind === 'clan') {
        const slug = searchParams.get('slug') ?? '';
        const clanId = parseClanIdFromRouteSegment(slug);
        if (clanId) {
            return respond(
                buildClanCardProps(label || slug, await fetchClanOgCard(clanId, realm), realm),
            );
        }
    }

    if (kind === 'ship' && label) {
        return respond(buildShipCardProps(label, realm));
    }

    return respond(buildDefaultCardProps());
}
