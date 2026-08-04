import type { StringKey } from './keys';

// Japanese. Partial by design — see ko.ts. Latin `Tier` is deliberate: that is
// how JP players write it (Tier10, T9), evidenced in the research doc.
export const ja: Partial<Record<StringKey, string>> = {
    'nav.selectRealm': 'サーバー選択',
    'nav.realmCurrent': 'サーバー: {realm}',
    'nav.language': '言語',
    'nav.languageCurrent': '言語: {language}',
    'nav.selectTheme': 'テーマ選択',
    'nav.searchPlayer': 'プレイヤー検索',
    'nav.searchClan': 'クラン検索',
    'nav.searchSubmit': '検索',
    'nav.themeLight': 'ライト',
    'nav.themeDark': 'ダーク',
    'nav.themeCurrent': 'テーマ: {label}',

    'insights.tabs.activity': 'アクティビティ',
    'insights.tabs.ships': '艦艇',
    'insights.tabs.profile': 'プロフィール',
    'insights.tabs.efficiency': '効率',
    'insights.tabs.ranked': 'ランク戦',
    'insights.tabs.clanBattles': 'クラン戦',

    'player.section.rankedSeasons': 'ランク戦シーズン',
    'player.section.randomBattlesByTier': 'Tier別ランダム戦',

    // Composed-template blocker (see the research doc + spec's "Known traps"
    // section): the clauses below are resolved through t() in the components,
    // so these two multi-part templates can now ship translated.
    'landing.treemap.heading': '{realm}サーバーで最もプレイされた{bucket}{suffix}',
    'landing.treemap.ariaLabel': '{realm}サーバーで{windowPhrase}に最もプレイされた{bucket}を{view}として表示',
    'landing.treemap.topPct': '上位{pct}%',
    'landing.treemap.windowPhraseWithDays': '直近{days}日間の艦艇ランキング集計期間',
    'landing.treemap.windowPhraseNoDays': '艦艇ランキング集計期間',
    'landing.treemap.viewTreemap': 'ツリーマップ',
    'landing.treemap.viewScatterplot': '戦闘数と勝率の散布図',
    'landing.shipLeaderboard.heading': '艦艇リーダーボード{suffix}',
    'landing.shipLeaderboard.windowSuffix': '直近{days}日間',

    'landing.treemap.chartSectionLabel': 'サーバー艦艇チャート',
    'landing.treemap.chartViewGroup': 'チャート表示',
    'landing.treemap.toggleMap': 'ツリーマップ',
    'landing.treemap.togglePlot': '散布図',

    'shipClass.destroyers': '駆逐艦',
    'shipClass.cruisers': '巡洋艦',
    'shipClass.battleships': '戦艦',
    'shipClass.aircraftCarriers': '空母',
    'shipClass.submarines': '潜水艦',
    'shipClass.ships': '艦艇',

    'common.all': 'すべて',
    'common.tier': 'Tier',
    'common.battles': '戦闘数',
    'common.avgDamage': '平均ダメージ',
    'common.winRate': '勝率',
    'common.ship': '艦艇',
    'common.player': 'プレイヤー',
    'common.season': 'シーズン',

    'notFound.title': 'ページが見つかりません',
    'notFound.body': 'お探しのページは見つかりませんでした。',

    // NEEDS-NATIVE-CHECK — same residue as ko.ts, key-for-key (the research
    // doc's gaps apply to both locales identically since it's one corpus
    // covering both). See ko.ts for the full reasoning per group; summary:
    //
    // Our coinage, no in-game/community term:
    //   player.section.efficiencyBadges  (see below for why the Efficiency
    //   TAB label ships anyway), insights.tabsAriaLabel
    //
    // Explicitly "not verified" in the research doc:
    //   player.section.winRateVsSurvival  (生存率 has no corpus hit)
    //
    // Compound headings — connective ("vs", "timeline") unattested:
    //   player.section.rankedGamesVsWinRate, player.section.clanBattlesVsWinRate,
    //   player.section.rankedSeasonTimeline, player.section.clanSeasonTimeline,
    //   player.section.battlesPlayedDistribution
    //
    // RESOLVED (composed-template blocker, follow-on #1): landing.treemap.heading,
    // landing.treemap.ariaLabel, and landing.shipLeaderboard.heading used to sit
    // here — either "word order too risky" or, for the ship-leaderboard heading,
    // a hardcoded English literal (`· last N days rolling`) built in
    // ShipLeaderboard.tsx that never passed through t(). Every interpolated
    // clause (the ship-class plurals, "top N%", the window phrase, the
    // map/plot view name, and the "last N days rolling" suffix) now has its own
    // key, resolved through t() in the component before being handed to the
    // outer template as a var — see landing.treemap.topPct/windowPhraseWithDays/
    // windowPhraseNoDays/viewTreemap/viewScatterplot, landing.shipLeaderboard.
    // windowSuffix, and shipClass.* above. All three templates ship translated.
    //
    // Generic UI chrome outside the research doc's WoWS-jargon remit. Two-tier
    // standard (see the research doc's "Generic UI chrome" section): everyday
    // interface vocabulary with no game-specific register risk may use
    // standard translations even without a corpus hit — nav.selectRealm,
    // nav.language, nav.selectTheme, common.all, nav.searchSubmit,
    // nav.themeLight/nav.themeDark/nav.themeCurrent above are that tier, and
    // — this fix round, closing an inconsistency where the standard was
    // applied to later keys but never backfilled to these three tab labels —
    // so are insights.tabs.activity/insights.tabs.profile/
    // insights.tabs.efficiency and notFound.title/notFound.body: "Activity",
    // "Profile" and "Efficiency" are everyday interface words carrying no
    // WoWS register risk (see the research doc's admission table for the
    // reasoning on 効率 specifically — it's our own coinage in English too,
    // and a consistently-translated tab strip beats one that alternates
    // languages tab to tab). common.clear/common.close/common.clan were
    // deleted outright this fix round rather than kept as unwired
    // scaffolding — no call site references any of them anywhere in the
    // client, and no follow-on task claims them (contrast common.type below
    // and the surviving common.* keys, which Fix 4's spec amendment assigns
    // to a named follow-on).
    //
    // Category label unattested (individual ship-class nouns are attested;
    // the umbrella word "type"/"class" is not):
    //   common.type
    //
    // Out of scope by the spec's own rule, not by attestation gap — see
    // ko.ts for the full reasoning:
    //   landing.treemap.infoLabel
};
