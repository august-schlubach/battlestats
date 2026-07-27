import {
    CONFIDENCE_FULL_BATTLES,
    THIN_EVIDENCE_CONFIDENCE,
    buildTierTypeDietModel,
    confidenceFadedWrColor,
    confidenceFromBattles,
    formatWinPercent,
} from '../tierTypeDietModel';
import type { TierTypePayload, TierTypePlayerCell } from '../playerProfileChartData';

const SHIP_TYPES = ['Destroyer', 'Cruiser', 'Battleship', 'Aircraft Carrier', 'Submarine'];
const TIERS = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const cell = (
    ship_type: string,
    ship_tier: number,
    pvp_battles: number,
    wins: number,
): TierTypePlayerCell => ({
    ship_type,
    ship_tier,
    pvp_battles,
    wins,
    win_ratio: pvp_battles > 0 ? wins / pvp_battles : 0,
});

const payloadWith = (cells: TierTypePlayerCell[]): TierTypePayload => ({
    metric: 'tier_type',
    label: 'Tier vs Ship Type',
    x_label: 'Ship Type',
    y_label: 'Tier',
    tracked_population: 1000,
    x_labels: SHIP_TYPES,
    y_values: TIERS,
    // The figure reads none of the population layers; they are here so the
    // fixture matches the real payload contract.
    tiles: [{ x_index: 1, y_index: 1, count: 500000 }],
    trend: [{ x_index: 1, avg_tier: 7.4, count: 500000 }],
    player_cells: cells,
});

describe('buildTierTypeDietModel tier rows', () => {
    it('trims the tier axis to the span the captain actually sails', () => {
        const model = buildTierTypeDietModel(payloadWith([
            cell('Cruiser', 8, 100, 50),
            cell('Battleship', 5, 40, 20),
        ]));

        // Tier 11 and tiers 4..1 are never sailed, so they are not drawn.
        expect(model.tiers).toEqual([8, 7, 6, 5]);
    });

    it('keeps interior gaps, because a skipped tier inside the span is a fact', () => {
        const model = buildTierTypeDietModel(payloadWith([
            cell('Cruiser', 10, 200, 100),
            cell('Cruiser', 6, 30, 15),
        ]));

        expect(model.tiers).toEqual([10, 9, 8, 7, 6]);
    });

    it('retains tier 11 when the captain sails superships', () => {
        const model = buildTierTypeDietModel(payloadWith([
            cell('Battleship', 11, 53, 27),
            cell('Battleship', 10, 300, 150),
        ]));

        expect(model.tiers[0]).toBe(11);
    });

    it('orders tiers high to low so tier 10 sits at the top row', () => {
        const model = buildTierTypeDietModel(payloadWith([
            cell('Cruiser', 3, 10, 5),
            cell('Cruiser', 9, 90, 45),
        ]));

        expect(model.tiers).toEqual([...model.tiers].sort((a, b) => b - a));
    });
});

describe('buildTierTypeDietModel class margin', () => {
    it('keeps a zero-battle class in the margin, so absence stays visible', () => {
        const model = buildTierTypeDietModel(payloadWith([cell('Cruiser', 8, 100, 54)]));

        expect(model.byType.map((total) => total.key)).toEqual(SHIP_TYPES);
        const submarines = model.byType.find((total) => total.key === 'Submarine');
        expect(submarines).toMatchObject({ battles: 0, wins: 0, winRatio: 0 });
    });

    it('sums battles and wins per class across tiers', () => {
        const model = buildTierTypeDietModel(payloadWith([
            cell('Cruiser', 8, 100, 60),
            cell('Cruiser', 5, 100, 40),
            cell('Battleship', 7, 50, 30),
        ]));

        expect(model.byType.find((total) => total.key === 'Cruiser')).toMatchObject({
            battles: 200,
            wins: 100,
            winRatio: 0.5,
        });
        expect(model.byType.find((total) => total.key === 'Battleship')).toMatchObject({
            battles: 50,
            winRatio: 0.6,
        });
    });

    it('reports the totals and the longest cell that drive the shared scales', () => {
        const model = buildTierTypeDietModel(payloadWith([
            cell('Aircraft Carrier', 10, 267, 134),
            cell('Battleship', 7, 130, 78),
        ]));

        expect(model.totalBattles).toBe(397);
        expect(model.maxCellBattles).toBe(267);
    });
});

describe('confidenceFromBattles', () => {
    it('reaches full confidence at the documented battle count and clamps above it', () => {
        expect(confidenceFromBattles(CONFIDENCE_FULL_BATTLES)).toBe(1);
        expect(confidenceFromBattles(CONFIDENCE_FULL_BATTLES * 4)).toBe(1);
    });

    it('tracks sqrt(n), since a win rate\'s precision does', () => {
        // 25 battles is a quarter of the full-confidence count, so half the
        // confidence — not a quarter of it.
        expect(confidenceFromBattles(25)).toBeCloseTo(0.5, 5);
    });

    it('classes a handful of battles as thin evidence and a solid sample as not', () => {
        expect(confidenceFromBattles(2)).toBeLessThan(THIN_EVIDENCE_CONFIDENCE);
        expect(confidenceFromBattles(6)).toBeLessThan(THIN_EVIDENCE_CONFIDENCE);
        expect(confidenceFromBattles(267)).toBeGreaterThan(THIN_EVIDENCE_CONFIDENCE);
    });

    it('never returns a negative confidence for a zero-battle cell', () => {
        expect(confidenceFromBattles(0)).toBe(0);
    });
});

// d3.interpolateLab emits "rgb(r, g, b)", not hex — parse to channels so the
// assertions compare colours rather than string formatting.
const channels = (color: string): [number, number, number] => {
    const parts = color.match(/\d+/g);
    if (!parts || parts.length < 3) {
        throw new Error(`Unparseable colour: ${color}`);
    }
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
};

const maxChannelDelta = (a: string, b: string): number => {
    const [ar, ag, ab] = channels(a);
    const [br, bg, bb] = channels(b);
    return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
};

describe('confidenceFadedWrColor', () => {
    it('renders a well-played cell at its full win-rate colour', () => {
        // 65%+ is the top band of the shared WoWS ramp: #810c9e.
        expect(channels(confidenceFadedWrColor(0.7, 1000, 'light'))).toEqual([129, 12, 158]);
    });

    it('collapses thin cells to the same neutral regardless of win rate', () => {
        // A 2-battle 100% cell and a 2-battle 0% cell must be near-indistinguishable:
        // neither has the evidence to make a claim.
        const lucky = confidenceFadedWrColor(1, 2, 'light');
        const unlucky = confidenceFadedWrColor(0, 2, 'light');
        expect(maxChannelDelta(lucky, unlucky)).toBeLessThan(24);

        // The same two win rates at full confidence are wildly far apart, which
        // is what makes the damping meaningful rather than cosmetic.
        const luckyCertain = confidenceFadedWrColor(1, 1000, 'light');
        const unluckyCertain = confidenceFadedWrColor(0, 1000, 'light');
        expect(maxChannelDelta(luckyCertain, unluckyCertain)).toBeGreaterThan(100);
    });

    it('fades toward a different neutral per theme', () => {
        expect(confidenceFadedWrColor(0.55, 3, 'light')).not.toBe(confidenceFadedWrColor(0.55, 3, 'dark'));
    });
});

describe('formatWinPercent', () => {
    it('renders a ratio as a whole-number percentage', () => {
        expect(formatWinPercent(0.5019)).toBe('50%');
        expect(formatWinPercent(0.6667)).toBe('67%');
        expect(formatWinPercent(0)).toBe('0%');
    });
});
