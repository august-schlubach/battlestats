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
    'nav.searchSubmit': '검색',
    'nav.themeLight': '라이트',
    'nav.themeDark': '다크',
    'nav.themeCurrent': '테마: {label}',

    'insights.tabs.activity': '활동',
    'insights.tabs.ships': '함선',
    'insights.tabs.profile': '프로필',
    'insights.tabs.efficiency': '효율',
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
    'common.season': '시즌',

    'notFound.title': '페이지를 찾을 수 없습니다',
    'notFound.body': '요청하신 페이지를 찾을 수 없습니다.',

    // NEEDS-NATIVE-CHECK — every key below is omitted, not guessed. Grouped by
    // why the research doc doesn't clear it. `en.ts` grew past the brief's
    // dictionary listing (Task 6b + others); these keys are the reconciled
    // superset, not just the brief's original residue.
    //
    // Our own product coinage, no in-game/community term exists:
    //   player.section.efficiencyBadges  ("efficiency" isn't a WoWS term — see
    //   below for why the Efficiency TAB label ships anyway)
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
    // t(). This fix round made the key drive the VISIBLE text too, not just
    // the aria-label (they used to diverge — see ShipLeaderboard.tsx), but
    // that only fixed the wiring; the suffix clause itself is still an
    // English literal built in the component, so translating this key alone
    // would still render a mixed-language string
    // ("함선 리더보드 · last 45 days rolling") on the landing page. Needs the
    // suffix clause to become its own key before this one can honestly ship:
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
    // reasoning on 효율 specifically — it's our own coinage in English too,
    // and a consistently-translated tab strip beats one that alternates
    // languages tab to tab). common.clear/common.close/common.clan were
    // deleted outright this fix round rather than kept as unwired
    // scaffolding — no call site references any of them anywhere in the
    // client, and no follow-on task claims them (contrast common.type below
    // and the surviving common.* keys, which Fix 4's spec amendment assigns
    // to a named follow-on).
    //
    // Category label unattested (the individual ship-class nouns — 전함,
    // 순양함, 구축함, 항공모함, 잠수함 — are attested, but the umbrella word
    // "type"/"class" itself is not):
    //   common.type
};
