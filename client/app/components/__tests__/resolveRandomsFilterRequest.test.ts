import { resolveRandomsFilterRequest } from '../RandomsSVG';

// Shape mirrors the randoms_data payload: note "AirCarrier", which the
// tier/type payload behind the Profile figure spells "Aircraft Carrier".
const rows = [
    { ship_id: 1, ship_name: 'Rodney', ship_chart_name: 'Rodney', ship_tier: 7, ship_type: 'Battleship', pvp_battles: 58, wins: 33, win_ratio: 0.57 },
    { ship_id: 2, ship_name: 'Sinop', ship_chart_name: 'Sinop', ship_tier: 7, ship_type: 'Battleship', pvp_battles: 35, wins: 22, win_ratio: 0.63 },
    { ship_id: 3, ship_name: 'Adm. Nakhimov', ship_chart_name: 'Adm. Nakhimov', ship_tier: 10, ship_type: 'AirCarrier', pvp_battles: 267, wins: 134, win_ratio: 0.5 },
    { ship_id: 4, ship_name: 'Ryujo', ship_chart_name: 'Ryujo', ship_tier: 6, ship_type: 'AirCarrier', pvp_battles: 80, wins: 46, win_ratio: 0.575 },
    { ship_id: 5, ship_name: 'Umikaze', ship_chart_name: 'Umikaze', ship_tier: 2, ship_type: 'Destroyer', pvp_battles: 2, wins: 2, win_ratio: 1 },
] as never[];

describe('resolveRandomsFilterRequest', () => {
    it('bridges the class vocabularies between the two payloads', () => {
        // The Profile figure says "Aircraft Carrier"; this payload says
        // "AirCarrier". A literal string match would select nothing.
        const { types } = resolveRandomsFilterRequest(rows, {
            shipTypes: ['Aircraft Carrier'],
            tiers: [10],
        });

        expect(types).toEqual(['AirCarrier']);
    });

    it('selects a single tier x class cell', () => {
        const resolved = resolveRandomsFilterRequest(rows, {
            shipTypes: ['Battleship'],
            tiers: [7],
        });

        expect(resolved).toEqual({ types: ['Battleship'], tiers: [7] });
    });

    it('keeps a sub-tier-5 drill-down, which the tab would otherwise floor away', () => {
        const { tiers } = resolveRandomsFilterRequest(rows, {
            shipTypes: ['Destroyer'],
            tiers: [2],
        });

        expect(tiers).toEqual([2]);
    });

    it('opens every tier for a whole-class drill-down', () => {
        // An empty tier list means the class total was clicked. Leaving the
        // tab's default tier-5 floor in force would silently hide the tier-2
        // destroyer that the class total counted.
        const { types, tiers } = resolveRandomsFilterRequest(rows, {
            shipTypes: ['Destroyer'],
            tiers: [],
        });

        expect(types).toEqual(['Destroyer']);
        expect(tiers).toEqual([10, 7, 6, 2]);
    });

    it('leaves the tier filter alone when the requested tier has no ship', () => {
        const { types, tiers } = resolveRandomsFilterRequest(rows, {
            shipTypes: ['Battleship'],
            tiers: [9],
        });

        expect(types).toEqual(['Battleship']);
        expect(tiers).toBeNull();
    });

    it('leaves the class filter alone when the class has no ship', () => {
        const { types } = resolveRandomsFilterRequest(rows, {
            shipTypes: ['Submarine'],
            tiers: [10],
        });

        expect(types).toBeNull();
    });

    it('changes nothing before the payload has landed', () => {
        expect(resolveRandomsFilterRequest([], { shipTypes: ['Battleship'], tiers: [7] }))
            .toEqual({ types: null, tiers: null });
    });
});
