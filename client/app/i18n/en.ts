import type { StringKey } from './keys';

// Total by type: `en` can never have a hole. Every other dictionary is Partial.
export const en: Record<StringKey, string> = {
    'nav.selectRealm': 'Select realm',
    'nav.language': 'Language',
    'nav.searchPlayer': 'Search Players',
    'nav.searchClan': 'Search Clans',
    'nav.selectTheme': 'Select theme',
    'footer.lastViewed': 'Last viewed:',

    'insights.tabs.activity': 'Activity',
    'insights.tabs.ships': 'Ships',
    'insights.tabs.profile': 'Profile',
    'insights.tabs.efficiency': 'Efficiency',
    'insights.tabs.ranked': 'Ranked',
    'insights.tabs.clanBattles': 'Clan Battles',
    'insights.panel.activity': 'Recent battle activity',
    'insights.panel.ships': 'Ship insights',
    'insights.panel.profile': 'Profile insights',
    'insights.panel.efficiency': 'Efficiency insights',
    'insights.panel.ranked': 'Ranked insights',
    'insights.panel.clanBattles': 'Clan battles insights',
    'insights.tabsAriaLabel': 'Player insight tabs',

    'player.section.rankedGamesVsWinRate': 'Ranked Games vs Win Rate',
    'player.section.rankedSeasonTimeline': 'Ranked Season Timeline',
    'player.section.rankedSeasons': 'Ranked Seasons',
    'player.section.randomBattlesByTier': 'Random Battles by Tier',
    'player.section.winRateVsSurvival': 'Win Rate vs Survival',
    'player.section.battlesPlayedDistribution': 'Battles Played Distribution',
    'player.section.clanBattlesVsWinRate': 'Clan Battles vs Win Rate',
    'player.section.clanSeasonTimeline': 'Clan Season Timeline',
    'player.section.efficiencyBadges': 'Efficiency Badges',

    // Composed at runtime; word order differs per language, so the whole
    // sentence is one template rather than concatenated fragments.
    'landing.treemap.heading': '{realm} most-played {bucket}{suffix}',
    // Live source (ShipLeaderboard.tsx) carries no realm in this heading — it's
    // always "Ship leaderboard", with an optional " · last N days rolling"
    // clause once the served window is known. {suffix} carries that clause.
    'landing.shipLeaderboard.heading': 'Ship leaderboard{suffix}',

    'common.all': 'All',
    'common.clear': 'Clear',
    'common.tier': 'Tier',
    'common.type': 'Type',
    'common.battles': 'Battles',
    'common.avgDamage': 'Avg dmg',
    'common.winRate': 'Win rate',
    'common.ship': 'Ship',
    'common.player': 'Player',
    'common.clan': 'Clan',
    'common.season': 'Season',
    'common.close': 'Close',

    'notFound.title': 'Page Not Found',
    'notFound.body': 'The requested page could not be found.',
};
