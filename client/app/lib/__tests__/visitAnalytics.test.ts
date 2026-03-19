import { trackEntityDetailView } from '../visitAnalytics';

describe('visitAnalytics', () => {
    const originalEnv = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    let fetchMock: jest.Mock;
    let gtagMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn().mockResolvedValue({ ok: true });
        gtagMock = jest.fn();
        global.fetch = fetchMock;
        window.history.replaceState({}, '', '/player/player-one');
        Object.defineProperty(document, 'referrer', {
            value: 'http://localhost:3001/',
            configurable: true,
        });
        Object.defineProperty(document, 'cookie', {
            value: '',
            writable: true,
            configurable: true,
        });
        window.sessionStorage.clear();
        window.gtag = gtagMock;
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = originalEnv;
        delete window.gtag;
    });

    it('posts the first-party analytics payload even when GA is not configured', async () => {
        delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

        await trackEntityDetailView({
            entityType: 'player',
            entityId: 77,
            entityName: 'Player One',
            entitySlug: 'player-one',
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/api/analytics/entity-view', expect.objectContaining({
            method: 'POST',
        }));
        expect(gtagMock).not.toHaveBeenCalled();
    });

    it('emits a GA4 event when a measurement id is configured and gtag exists', async () => {
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST1234';

        await trackEntityDetailView({
            entityType: 'clan',
            entityId: 88,
            entityName: 'Clan One',
            entitySlug: '88-clan-one',
        });

        expect(gtagMock).toHaveBeenCalledWith('event', 'entity_detail_view', expect.objectContaining({
            send_to: 'G-TEST1234',
            entity_type: 'clan',
            entity_id: 88,
            entity_slug: '88-clan-one',
            entity_name: 'Clan One',
            route_path: '/player/player-one',
        }));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});