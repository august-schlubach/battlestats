import {
    LAST_VIEWED_PLAYER_STORAGE_KEY,
    forgetLastViewedPlayer,
    readLastViewedPlayer,
    rememberLastViewedPlayer,
} from '../lastViewedPlayer';

describe('lastViewedPlayer', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('round-trips a name and realm', () => {
        rememberLastViewedPlayer('Nagashino_SB_Nori', 'asia');

        expect(readLastViewedPlayer()).toEqual({ name: 'Nagashino_SB_Nori', realm: 'asia' });
    });

    it('trims the stored name', () => {
        rememberLastViewedPlayer('  lasna  ', 'eu');

        expect(readLastViewedPlayer()).toEqual({ name: 'lasna', realm: 'eu' });
    });

    it('refuses a blank name or an unknown realm', () => {
        rememberLastViewedPlayer('   ', 'na');
        expect(readLastViewedPlayer()).toBeNull();

        rememberLastViewedPlayer('SomePlayer', 'ru');
        expect(readLastViewedPlayer()).toBeNull();
    });

    it('treats a corrupt stored value as absent instead of throwing', () => {
        window.localStorage.setItem(LAST_VIEWED_PLAYER_STORAGE_KEY, 'not json');
        expect(readLastViewedPlayer()).toBeNull();

        window.localStorage.setItem(LAST_VIEWED_PLAYER_STORAGE_KEY, JSON.stringify({ name: 'x' }));
        expect(readLastViewedPlayer()).toBeNull();

        window.localStorage.setItem(LAST_VIEWED_PLAYER_STORAGE_KEY, JSON.stringify({ realm: 'na' }));
        expect(readLastViewedPlayer()).toBeNull();
    });

    it('survives storage that throws (private mode)', () => {
        const setItem = jest
            .spyOn(window.localStorage.__proto__ as Storage, 'setItem')
            .mockImplementation(() => {
                throw new Error('storage disabled');
            });

        expect(() => rememberLastViewedPlayer('SomePlayer', 'na')).not.toThrow();
        setItem.mockRestore();

        const getItem = jest
            .spyOn(window.localStorage.__proto__ as Storage, 'getItem')
            .mockImplementation(() => {
                throw new Error('storage disabled');
            });

        expect(readLastViewedPlayer()).toBeNull();
        getItem.mockRestore();
    });

    it('forgets on request', () => {
        rememberLastViewedPlayer('SomePlayer', 'na');
        forgetLastViewedPlayer();

        expect(readLastViewedPlayer()).toBeNull();
    });
});
