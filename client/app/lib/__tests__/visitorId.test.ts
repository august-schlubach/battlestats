import { VISITOR_ID_STORAGE_KEY, getVisitorId, resetVisitorIdCache } from '../visitorId';

describe('getVisitorId', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetVisitorIdCache();
    });

    it('mints an id once and persists it', () => {
        const first = getVisitorId();

        expect(first).toBeTruthy();
        expect(window.localStorage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(first);
    });

    it('returns the same id across calls and across fresh module state', () => {
        const first = getVisitorId();
        expect(getVisitorId()).toBe(first);

        // A later page load starts with no memo but the same storage.
        resetVisitorIdCache();
        expect(getVisitorId()).toBe(first);
    });

    it('reuses an id already in storage rather than minting a new one', () => {
        window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, 'pre-existing-id');

        expect(getVisitorId()).toBe('pre-existing-id');
    });

    it('returns null when storage reads throw (private mode) instead of throwing', () => {
        const getItem = jest
            .spyOn(window.localStorage.__proto__ as Storage, 'getItem')
            .mockImplementation(() => {
                throw new Error('storage disabled');
            });

        expect(getVisitorId()).toBeNull();

        getItem.mockRestore();
    });

    it('returns null when the id cannot be persisted, so it never becomes a per-load pseudo-visitor', () => {
        const setItem = jest
            .spyOn(window.localStorage.__proto__ as Storage, 'setItem')
            .mockImplementation(() => {
                throw new Error('quota exceeded');
            });

        expect(getVisitorId()).toBeNull();

        setItem.mockRestore();
    });

    it('falls back to getRandomValues when randomUUID is unavailable', () => {
        const originalRandomUuid = crypto.randomUUID;
        // ios Safari below 15.4: getRandomValues present, randomUUID absent.
        Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });

        try {
            const id = getVisitorId();
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        } finally {
            Object.defineProperty(crypto, 'randomUUID', { value: originalRandomUuid, configurable: true });
        }
    });
});
