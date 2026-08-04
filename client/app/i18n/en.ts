import type { StringKey } from './keys';

// Total by type: `en` can never have a hole. Every other dictionary is Partial.
export const en: Record<StringKey, string> = {
    'nav.selectRealm': 'Select realm',
    'nav.language': 'Language',
    'nav.searchPlayer': 'Search Players',
    'nav.searchClan': 'Search Clans',
    'nav.searchSubmit': 'Go',
    'nav.selectTheme': 'Select theme',
    'nav.themeLight': 'Light',
    'nav.themeDark': 'Dark',
    // Composed at runtime so the whole accessible name — not just the theme
    // word — is a single translated sentence; see ThemeToggle.tsx.
    'nav.themeCurrent': 'Theme: {label}',
    'footer.lastViewed': 'Last viewed:',

    'insights.tabs.activity': 'Activity',
    'insights.tabs.ships': 'Ships',
    'insights.tabs.profile': 'Profile',
    'insights.tabs.efficiency': 'Efficiency',
    'insights.tabs.ranked': 'Ranked',
    'insights.tabs.clanBattles': 'Clan Battles',
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
    // sentence is one template rather than concatenated fragments. {bucket}
    // and {suffix} are themselves resolved through t() in the component
    // before being passed in — see landing.treemap.topPct/viewTreemap/
    // viewScatterplot/windowPhraseWithDays/windowPhraseNoDays and the
    // shipClass.* keys below (the composed-template blocker, closed).
    'landing.treemap.heading': '{realm} most-played {bucket}{suffix}',
    // The treemap SVG's accessible name (role="img" aria-label). Lifted verbatim
    // from RealmTopShipsTreemapSVG.tsx's prior hardcoded template so the
    // accessible name keeps pace with the visible <h2> above it, which already
    // went through t() in Task 6 — added in Task 6b, the gap that left this one
    // sentence untranslated in the same header row. {windowPhrase} and {view}
    // are resolved through t() in the component, not built as English literals.
    'landing.treemap.ariaLabel': '{realm} most-played {bucket} over the {windowPhrase}, shown as a {view}',
    // The " · top {pct}%" clause in landing.treemap.heading's {suffix}. Generic
    // UI chrome (no WoWS jargon), admitted per the research doc's two-tier
    // standard — see agents/work-items/i18n-terminology-research.md.
    'landing.treemap.topPct': 'top {pct}%',
    // The "over the {windowPhrase}" clause in landing.treemap.ariaLabel, and
    // (kept English-only, see RealmTopShipsTreemapSVG.tsx) the same wording in
    // the component's out-of-scope info-tooltip paragraph.
    'landing.treemap.windowPhraseWithDays': 'rolling, trailing {days}-day ship-standings window',
    'landing.treemap.windowPhraseNoDays': 'rolling ship-standings window',
    // The "{view}" clause in landing.treemap.ariaLabel.
    'landing.treemap.viewTreemap': 'treemap',
    'landing.treemap.viewScatterplot': 'battles-vs-win-rate scatterplot',
    // Live source (ShipLeaderboard.tsx) carries no realm in this heading — it's
    // always "Ship leaderboard", with an optional " · last N days rolling"
    // clause once the served window is known. {suffix} carries that clause,
    // itself built from landing.shipLeaderboard.windowSuffix resolved through
    // t() in the component (not an English literal).
    'landing.shipLeaderboard.heading': 'Ship leaderboard{suffix}',
    // The "last {days} days rolling" clause inside that suffix.
    'landing.shipLeaderboard.windowSuffix': 'last {days} days rolling',

    // Reusable ship-class vocabulary (plural form, for headings that name a
    // bucket of ships by class — not treemap-specific). The individual class
    // nouns are corpus-attested (see the research doc's Verified terms table);
    // neither ko nor ja pluralizes, so their values below equal the singular.
    'shipClass.destroyers': 'Destroyers',
    'shipClass.cruisers': 'Cruisers',
    'shipClass.battleships': 'Battleships',
    'shipClass.aircraftCarriers': 'Aircraft Carriers',
    'shipClass.submarines': 'Submarines',
    // Generic fallback when no class filter is active.
    'shipClass.ships': 'ships',

    'common.all': 'All',
    'common.tier': 'Tier',
    'common.type': 'Type',
    'common.battles': 'Battles',
    'common.avgDamage': 'Avg dmg',
    'common.winRate': 'Win rate',
    'common.ship': 'Ship',
    'common.player': 'Player',
    'common.season': 'Season',

    'notFound.title': 'Page Not Found',
    'notFound.body': 'The requested page could not be found.',
};
