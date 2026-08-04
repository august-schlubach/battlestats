import type { StringKey } from './keys';

// Japanese. Partial by design — see ko.ts. Latin `Tier` is deliberate: that is
// how JP players write it (Tier10, T9), evidenced in the research doc.
export const ja: Partial<Record<StringKey, string>> = {
    'nav.selectRealm': 'サーバー選択',
    'nav.language': '言語',
    'nav.searchPlayer': 'プレイヤー検索',
    'nav.searchClan': 'クラン検索',

    'insights.tabs.ships': '艦艇',
    'insights.tabs.ranked': 'ランク戦',
    'insights.tabs.clanBattles': 'クラン戦',

    'player.section.rankedSeasons': 'ランク戦シーズン',
    'player.section.randomBattlesByTier': 'Tier別ランダム戦',

    'common.all': 'すべて',
    'common.tier': 'Tier',
    'common.battles': '戦闘数',
    'common.avgDamage': '平均ダメージ',
    'common.winRate': '勝率',
    'common.ship': '艦艇',
    'common.player': 'プレイヤー',
    'common.clan': 'クラン',
    'common.season': 'シーズン',

    // NEEDS-NATIVE-CHECK — same residue as ko.ts, key-for-key (the research
    // doc's gaps apply to both locales identically since it's one corpus
    // covering both). See ko.ts for the full reasoning per group; summary:
    //
    // Our coinage, no in-game/community term:
    //   insights.tabs.efficiency, insights.panel.efficiency,
    //   player.section.efficiencyBadges, insights.panel.activity,
    //   insights.panel.ships, insights.panel.profile, insights.panel.ranked,
    //   insights.panel.clanBattles, insights.tabsAriaLabel
    //
    // Explicitly "not verified" in the research doc:
    //   player.section.winRateVsSurvival  (生存率 has no corpus hit)
    //
    // Compound headings — connective ("vs", "timeline") unattested:
    //   player.section.rankedGamesVsWinRate, player.section.clanBattlesVsWinRate,
    //   player.section.rankedSeasonTimeline, player.section.clanSeasonTimeline,
    //   player.section.battlesPlayedDistribution
    //
    // Multi-part template, word order too risky:
    //   landing.treemap.heading, landing.treemap.ariaLabel
    //
    // Structural blocker — ShipLeaderboard.tsx builds `{suffix}` as a
    // hardcoded English literal (`· last N days rolling`) that never passes
    // through t(), so translating just the heading mixes languages:
    //   landing.shipLeaderboard.heading
    //
    // Generic UI chrome outside the research doc's remit, not brief-specified:
    //   nav.selectTheme, footer.lastViewed, common.clear, common.close
    //
    // Category label unattested (individual ship-class nouns are attested;
    // the umbrella word "type"/"class" is not):
    //   common.type
    //
    // No in-game or community source in the corpus:
    //   insights.tabs.activity, insights.tabs.profile, notFound.title, notFound.body
};
