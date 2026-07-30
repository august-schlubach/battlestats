import {
    LAST_VIEWED_PLAYER_STORAGE_KEY,
    MAX_LAST_VIEWED_PLAYERS,
    forgetLastViewedPlayers,
    readLastViewedPlayers,
    rememberLastViewedPlayer,
} from '../lastViewedPlayer';

describe('lastViewedPlayer', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('round-trips a name and realm', () => {
        rememberLastViewedPlayer('Nagashino_SB_Nori', 'asia');

        expect(readLastViewedPlayers()).toEqual([{ name: 'Nagashino_SB_Nori', realm: 'asia' }]);
    });

    it('trims the stored name', () => {
        rememberLastViewedPlayer('  lasna  ', 'eu');

        expect(readLastViewedPlayers()).toEqual([{ name: 'lasna', realm: 'eu' }]);
    });

    it('refuses a blank name or an unknown realm', () => {
        rememberLastViewedPlayer('   ', 'na');
        expect(readLastViewedPlayers()).toEqual([]);

        rememberLastViewedPlayer('SomePlayer', 'ru');
        expect(readLastViewedPlayers()).toEqual([]);
    });

    it('keeps the most recent view first', () => {
        rememberLastViewedPlayer('First', 'na');
        rememberLastViewedPlayer('Second', 'eu');
        rememberLastViewedPlayer('Third', 'asia');

        expect(readLastViewedPlayers()).toEqual([
            { name: 'Third', realm: 'asia' },
            { name: 'Second', realm: 'eu' },
            { name: 'First', realm: 'na' },
        ]);
    });

    it('moves a re-viewed player to the front instead of duplicating them', () => {
        rememberLastViewedPlayer('First', 'na');
        rememberLastViewedPlayer('Second', 'na');
        rememberLastViewedPlayer('First', 'na');

        expect(readLastViewedPlayers()).toEqual([
            { name: 'First', realm: 'na' },
            { name: 'Second', realm: 'na' },
        ]);
    });

    it('matches a re-viewed player case-insensitively but stores the latest spelling', () => {
        // The write falls back to the URL segment the visitor typed, so the same
        // account can arrive under different casing.
        rememberLastViewedPlayer('Nagashino_SB_Nori', 'asia');
        rememberLastViewedPlayer('nagashino_sb_nori', 'asia');

        expect(readLastViewedPlayers()).toEqual([{ name: 'nagashino_sb_nori', realm: 'asia' }]);
    });

    it('treats the same name on two realms as two players', () => {
        rememberLastViewedPlayer('Twin', 'na');
        rememberLastViewedPlayer('Twin', 'eu');

        expect(readLastViewedPlayers()).toEqual([
            { name: 'Twin', realm: 'eu' },
            { name: 'Twin', realm: 'na' },
        ]);
    });

    it('caps the history and evicts the oldest', () => {
        rememberLastViewedPlayer('First', 'na');
        rememberLastViewedPlayer('Second', 'na');
        rememberLastViewedPlayer('Third', 'na');
        rememberLastViewedPlayer('Fourth', 'na');

        const stored = readLastViewedPlayers();
        expect(stored).toHaveLength(MAX_LAST_VIEWED_PLAYERS);
        expect(stored.map((entry) => entry.name)).toEqual(['Fourth', 'Third', 'Second']);
    });

    it('migrates the legacy single-entry value instead of dropping it', () => {
        // Shipped shape before this change. A returning visitor must not lose their
        // one remembered player on the deploy that widens the list.
        window.localStorage.setItem(
            LAST_VIEWED_PLAYER_STORAGE_KEY,
            JSON.stringify({ name: 'Legacy', realm: 'eu' }),
        );

        expect(readLastViewedPlayers()).toEqual([{ name: 'Legacy', realm: 'eu' }]);

        rememberLastViewedPlayer('Fresh', 'na');
        expect(readLastViewedPlayers()).toEqual([
            { name: 'Fresh', realm: 'na' },
            { name: 'Legacy', realm: 'eu' },
        ]);
    });

    it('drops only the invalid entries of a stored list', () => {
        window.localStorage.setItem(
            LAST_VIEWED_PLAYER_STORAGE_KEY,
            JSON.stringify([
                { name: 'Good', realm: 'na' },
                { name: '', realm: 'na' },
                { name: 'BadRealm', realm: 'ru' },
                null,
                { name: 'AlsoGood', realm: 'eu' },
            ]),
        );

        expect(readLastViewedPlayers()).toEqual([
            { name: 'Good', realm: 'na' },
            { name: 'AlsoGood', realm: 'eu' },
        ]);
    });

    it('treats a corrupt stored value as absent instead of throwing', () => {
        window.localStorage.setItem(LAST_VIEWED_PLAYER_STORAGE_KEY, 'not json');
        expect(readLastViewedPlayers()).toEqual([]);

        window.localStorage.setItem(LAST_VIEWED_PLAYER_STORAGE_KEY, JSON.stringify({ name: 'x' }));
        expect(readLastViewedPlayers()).toEqual([]);

        window.localStorage.setItem(LAST_VIEWED_PLAYER_STORAGE_KEY, JSON.stringify({ realm: 'na' }));
        expect(readLastViewedPlayers()).toEqual([]);
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

        expect(readLastViewedPlayers()).toEqual([]);
        getItem.mockRestore();
    });

    it('forgets on request', () => {
        rememberLastViewedPlayer('SomePlayer', 'na');
        forgetLastViewedPlayers();

        expect(readLastViewedPlayers()).toEqual([]);
    });
});
