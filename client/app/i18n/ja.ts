import type { StringKey } from './keys';

// Japanese. Partial by design — see ko.ts. Latin `Tier` is deliberate: that is
// how JP players write it (Tier10, T9), evidenced in the research doc.
export const ja: Partial<Record<StringKey, string>> = {
    'nav.selectRealm': 'サーバー選択',
    'nav.language': '言語',
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
    // Multi-part template, word order too risky:
    //   landing.treemap.heading, landing.treemap.ariaLabel
    //
    // Structural blocker — ShipLeaderboard.tsx builds `{suffix}` as a
    // hardcoded English literal (`· last N days rolling`) that never passes
    // through t(). This fix round made the key drive the VISIBLE text too,
    // not just the aria-label (they used to diverge), but the suffix clause
    // itself is still an English literal built in the component, so
    // translating just the heading still mixes languages:
    //   landing.shipLeaderboard.heading
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
};
