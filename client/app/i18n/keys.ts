// Every localizable string in the client, keyed semantically. Semantic keys
// (not English-source-as-key) because one English word maps to two different
// CJK words depending on context: the "Ships" tab and a "Ships" column are not
// the same noun in Korean.
export type StringKey =
    // — header / footer chrome —
    | 'nav.selectRealm'
    | 'nav.language'
    | 'nav.searchPlayer'
    | 'nav.searchClan'
    | 'nav.searchSubmit'
    | 'nav.selectTheme'
    | 'nav.themeLight'
    | 'nav.themeDark'
    | 'nav.themeCurrent'
    | 'footer.lastViewed'
    // — player insight tabs —
    | 'insights.tabs.activity'
    | 'insights.tabs.ships'
    | 'insights.tabs.profile'
    | 'insights.tabs.efficiency'
    | 'insights.tabs.ranked'
    | 'insights.tabs.clanBattles'
    | 'insights.tabsAriaLabel'
    // — player section headings —
    | 'player.section.rankedGamesVsWinRate'
    | 'player.section.rankedSeasonTimeline'
    | 'player.section.rankedSeasons'
    | 'player.section.randomBattlesByTier'
    | 'player.section.winRateVsSurvival'
    | 'player.section.battlesPlayedDistribution'
    | 'player.section.clanBattlesVsWinRate'
    | 'player.section.clanSeasonTimeline'
    | 'player.section.efficiencyBadges'
    // — landing —
    | 'landing.treemap.heading'
    | 'landing.treemap.ariaLabel'
    | 'landing.shipLeaderboard.heading'
    // — shared controls —
    | 'common.all'
    | 'common.tier'
    | 'common.type'
    | 'common.battles'
    | 'common.avgDamage'
    | 'common.winRate'
    | 'common.ship'
    | 'common.player'
    | 'common.season'
    // — not found —
    | 'notFound.title'
    | 'notFound.body';
