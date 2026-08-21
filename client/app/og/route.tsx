import { ImageResponse } from 'next/og';
import ogCardLayout, { type OgCardLayoutProps } from '../lib/ogCardLayout';
import {
    OG_IMAGE_SIZE,
    OG_REVALIDATE_SECONDS,
    buildClanCardProps,
    buildDefaultCardProps,
    buildPlayerCardProps,
    buildShipBoardCardProps,
    buildShipListCardProps,
    fetchClanOgCard,
    fetchPlayerOgCard,
    fetchShipBoardOgCard,
    fetchShipListOgCard,
    resolveOgRealm,
} from '../lib/ogCard';
import {
    parseClanIdFromRouteSegment,
    parseShipBucketSegment,
    parseWrPctParam,
} from '../lib/entityRoutes';
import { parseSort, type SortDir } from '../lib/tableSort';

// Dynamic Open Graph card renderer: GET /og?kind=player&name=…&realm=asia
//   …&kind=shiplist&bucket=t10-battleships&wr=50&sort=win_rate&dir=desc
//   …&kind=ship&id=<ship_id>&label=Bungo&sort=win_rate
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

// Columns each board can be sorted by. Anything else in a shared link is ignored
// in favour of the natural order rather than trusted -- these params arrive from
// the open internet and feed a comparator.
const SHIP_LIST_SORT_KEYS = ['ship_name', 'battles', 'avg_damage', 'kills_per_battle', 'win_rate'] as const;
const SHIP_BOARD_SORT_KEYS = ['rank', 'player_name', 'win_rate', 'battles', 'avg_damage', 'kills_per_battle'] as const;

const readSort = (
    searchParams: URLSearchParams,
    keys: ReadonlyArray<string>,
    textKeys: ReadonlyArray<string>,
): { key: string; dir: SortDir } | null =>
    parseSort<Record<string, unknown>>(
        searchParams.get('sort'),
        searchParams.get('dir'),
        keys,
        textKeys,
    ) as { key: string; dir: SortDir } | null;

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

    // The ship list for one tier x type bucket, ranked as the sharer had it.
    if (kind === 'shiplist') {
        const bucket = parseShipBucketSegment(searchParams.get('bucket') ?? '');
        if (bucket) {
            const wrPct = parseWrPctParam(searchParams.get('wr'));
            const sort = readSort(searchParams, SHIP_LIST_SORT_KEYS, ['ship_name']);
            return respond(
                buildShipListCardProps(
                    bucket.tier,
                    bucket.type,
                    wrPct,
                    await fetchShipListOgCard(realm, bucket.tier, bucket.type, wrPct),
                    realm,
                    sort,
                ),
            );
        }
    }

    // One ship's player standings. `id` is what makes the card data-bearing; a
    // link from before it shipped carries only `label` and still renders.
    if (kind === 'ship' && label) {
        const shipId = Number(searchParams.get('id'));
        const card = Number.isInteger(shipId) && shipId > 0
            ? await fetchShipBoardOgCard(shipId, realm)
            : null;
        const sort = readSort(searchParams, SHIP_BOARD_SORT_KEYS, ['player_name']);
        return respond(buildShipBoardCardProps(label, card, realm, sort));
    }

    return respond(buildDefaultCardProps());
}
