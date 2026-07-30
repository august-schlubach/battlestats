import { generateMetadata as playerMetadata } from '../../player/[playerName]/page';
import { generateMetadata as clanMetadata } from '../../clan/[clanSlug]/page';
import { generateMetadata as shipMetadata } from '../../ship/[shipSlug]/page';

// Guards the share-card contract on the three entity routes: every shared link
// must resolve to a realm-correct card image, and must ask X for the large
// format rather than the text-stub `summary` card.
// Runbook: agents/runbooks/runbook-audience-growth-instrumentation-2026-07-29.md

type EntityMetadata = Awaited<ReturnType<typeof playerMetadata>>;

// `Metadata['twitter']` is a union whose other arms have no `card`, so narrow
// through the summary-card arm rather than sprinkling optional chaining.
const twitterCard = (metadata: EntityMetadata): string | undefined =>
    (metadata.twitter as { card?: string } | null | undefined)?.card;

const firstOgImageUrl = (metadata: EntityMetadata): string => {
    const images = metadata.openGraph?.images;
    const first = Array.isArray(images) ? images[0] : images;
    if (first && typeof first === 'object' && 'url' in first) {
        return String((first as { url: string | URL }).url);
    }
    return String(first);
};

describe('player page metadata', () => {
    it('points the card at the realm the link carries', async () => {
        const metadata = await playerMetadata({
            params: Promise.resolve({ playerName: 'Nagashino_SB_Nori' }),
            searchParams: Promise.resolve({ realm: 'asia' }),
        });

        const image = firstOgImageUrl(metadata);
        expect(image).toContain('/og?kind=player');
        expect(image).toContain('name=Nagashino_SB_Nori');
        expect(image).toContain('realm=asia');
        expect(twitterCard(metadata)).toBe('summary_large_image');
        expect(metadata.twitter?.images).toEqual([image]);
    });

    it('falls back to na for an unknown realm', async () => {
        const metadata = await playerMetadata({
            params: Promise.resolve({ playerName: 'lasna' }),
            searchParams: Promise.resolve({ realm: 'ru' }),
        });

        expect(firstOgImageUrl(metadata)).toContain('realm=na');
    });

    it('url-encodes names that need it', async () => {
        const metadata = await playerMetadata({
            params: Promise.resolve({ playerName: encodeURIComponent('a b+c') }),
            searchParams: Promise.resolve({}),
        });

        const image = firstOgImageUrl(metadata);
        expect(image).toContain('name=a%20b%2Bc');
    });
});

describe('clan page metadata', () => {
    it('passes the slug and label through to the card', async () => {
        const metadata = await clanMetadata({
            params: Promise.resolve({ clanSlug: '2000010922-pride' }),
            searchParams: Promise.resolve({ realm: 'eu' }),
        });

        const image = firstOgImageUrl(metadata);
        expect(image).toContain('/og?kind=clan');
        expect(image).toContain('slug=2000010922-pride');
        expect(image).toContain('label=pride');
        expect(image).toContain('realm=eu');
        expect(twitterCard(metadata)).toBe('summary_large_image');
    });
});

describe('ship page metadata', () => {
    it('passes the derived ship label through to the card', async () => {
        const metadata = await shipMetadata({
            params: Promise.resolve({ shipSlug: '3762398160-moskva' }),
            searchParams: Promise.resolve({ realm: 'asia' }),
        });

        const image = firstOgImageUrl(metadata);
        expect(image).toContain('/og?kind=ship');
        expect(image).toContain('label=Moskva');
        expect(image).toContain('realm=asia');
        expect(twitterCard(metadata)).toBe('summary_large_image');
    });
});
