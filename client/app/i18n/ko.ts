import type { StringKey } from './keys';

// Korean. Partial by design: an untranslated string is ABSENT, not a copy of
// the English one. Terminology + register decisions (compact mode names,
// 데미지 over 피해량, 전적 over 통계) are evidenced in
// agents/work-items/i18n-terminology-research.md
export const ko: Partial<Record<StringKey, string>> = {
    'nav.selectRealm': '서버 선택',
    'nav.language': '언어',
    'nav.selectTheme': '테마 선택',
    'nav.searchPlayer': '플레이어 검색',
    'nav.searchClan': '클랜 검색',

    'insights.tabs.ships': '함선',
    'insights.tabs.ranked': '랭크전',
    'insights.tabs.clanBattles': '클랜전',

    'player.section.rankedSeasons': '랭크전 시즌',
    'player.section.randomBattlesByTier': '티어별 랜덤전',

    'common.all': '전체',
    'common.tier': '티어',
    'common.battles': '전투 수',
    'common.avgDamage': '평균 데미지',
    'common.winRate': '승률',
    'common.ship': '함선',
    'common.player': '플레이어',
    'common.clan': '클랜',
    'common.season': '시즌',

    // NEEDS-NATIVE-CHECK — every key below is omitted, not guessed. Grouped by
    // why the research doc doesn't clear it. `en.ts` grew past the brief's
    // dictionary listing (Task 6b + others); these keys are the reconciled
    // superset, not just the brief's original residue.
    //
    // Our own product coinage, no in-game/community term exists:
    //   insights.tabs.efficiency, insights.panel.efficiency,
    //   player.section.efficiencyBadges  ("efficiency" isn't a WoWS term)
    //   insights.panel.activity, insights.panel.ships, insights.panel.profile,
    //   insights.panel.ranked, insights.panel.clanBattles,
    //   insights.tabsAriaLabel  ("insights" as a UI concept is ours, not WG's)
    //
    // Flagged "not verified" in the research doc directly:
    //   player.section.winRateVsSurvival  (생존율 has no corpus hit)
    //
    // Compound headings whose connective isn't attested (nouns are covered
    // individually, but "vs" and "timeline" as constructions are not):
    //   player.section.rankedGamesVsWinRate, player.section.clanBattlesVsWinRate,
    //   player.section.rankedSeasonTimeline, player.section.clanSeasonTimeline,
    //   player.section.battlesPlayedDistribution
    //
    // Word order judged too risky for a template with multiple moving parts:
    //   landing.treemap.heading, landing.treemap.ariaLabel
    //
    // Structural blocker, not a vocabulary gap: `{suffix}` in
    // landing.shipLeaderboard.heading is a hardcoded English literal built in
    // ShipLeaderboard.tsx (`· last N days rolling`) that never passes through
    // t(). Translating the heading alone would render a mixed-language string
    // ("함선 리더보드 · last 45 days rolling") on the landing page. Needs the
    // suffix clause to become its own key before this one can honestly ship:
    //   landing.shipLeaderboard.heading
    //
    // Generic UI chrome outside the research doc's WoWS-jargon remit. Two-tier
    // standard (see the research doc's "Generic UI chrome" section, added
    // after the fix-round-1 review): everyday interface vocabulary with no
    // game-specific register risk may use standard translations even without
    // a corpus hit (nav.selectRealm, nav.language, nav.selectTheme, common.all
    // above are that tier). footer.lastViewed, common.clear, common.close are
    // NOT admitted here — they belong to table/filter/footer chrome a
    // separate follow-on task owns, so they stay omitted for now:
    //   footer.lastViewed, common.clear, common.close
    //
    // Category label unattested (the individual ship-class nouns — 전함,
    // 순양함, 구축함, 항공모함, 잠수함 — are attested, but the umbrella word
    // "type"/"class" itself is not):
    //   common.type
    //
    // No in-game or community source in the corpus:
    //   insights.tabs.activity, insights.tabs.profile, notFound.title, notFound.body
};
