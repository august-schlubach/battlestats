export type RankedLeagueName = 'Bronze' | 'Silver' | 'Gold';

type RankedLeagueRow = {
    total_battles?: number | null;
    highest_league?: number | null;
    highest_league_name?: RankedLeagueName | null;
};

const RANKED_LEAGUE_COLORS: Record<RankedLeagueName, string> = {
    Bronze: '#cd7f32',
    Silver: '#94a3b8',
    Gold: '#d4af37',
};

const RANKED_LEAGUE_ORDER: Record<RankedLeagueName, number> = {
    Gold: 1,
    Silver: 2,
    Bronze: 3,
};

const getRankedLeagueNameFromValue = (leagueValue: number | null | undefined): RankedLeagueName | null => {
    if (leagueValue === 1) {
        return 'Gold';
    }

    if (leagueValue === 2) {
        return 'Silver';
    }

    if (leagueValue === 3) {
        return 'Bronze';
    }

    return null;
};

export const getHighestRankedLeagueName = (rankedRows: RankedLeagueRow[] | null | undefined): RankedLeagueName | null => {
    if (!Array.isArray(rankedRows)) {
        return null;
    }

    return rankedRows.reduce<RankedLeagueName | null>((bestLeague, row) => {
        if ((row?.total_battles || 0) <= 0) {
            return bestLeague;
        }

        const league = row?.highest_league_name ?? getRankedLeagueNameFromValue(row?.highest_league);
        if (!league) {
            return bestLeague;
        }

        if (!bestLeague || RANKED_LEAGUE_ORDER[league] < RANKED_LEAGUE_ORDER[bestLeague]) {
            return league;
        }

        return bestLeague;
    }, null);
};

export const getRankedLeagueColor = (league: RankedLeagueName | null | undefined): string => {
    if (!league) {
        return '#d4af37';
    }

    return RANKED_LEAGUE_COLORS[league];
};

export const getRankedLeagueTooltip = (league: RankedLeagueName | null | undefined): string => {
    if (!league) {
        return 'ranked enjoyer';
    }

    return `ranked enjoyer (${league})`;
};