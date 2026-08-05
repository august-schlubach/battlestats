import type { StringKey } from './keys';

// Korean. Partial by design: an untranslated string is ABSENT, not a copy of
// the English one. Terminology + register decisions (compact mode names,
// 데미지 over 피해량, 전적 over 통계) are evidenced in
// agents/work-items/i18n-terminology-research.md
export const ko: Partial<Record<StringKey, string>> = {
    'nav.selectRealm': '서버 선택',
    'nav.realmCurrent': '서버: {realm}',
    'nav.language': '언어',
    'nav.languageCurrent': '언어: {language}',
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

    // Composed-template blocker (see the research doc + spec's "Known traps"
    // section): the clauses below are resolved through t() in the components,
    // so these two multi-part templates can now ship translated.
    'landing.treemap.heading': '{realm} 서버에서 가장 많이 플레이한 {bucket}{suffix}',
    'landing.treemap.ariaLabel': '{realm} 서버에서 {windowPhrase} 동안 가장 많이 플레이한 {bucket}을 {view} 형태로 표시',
    'landing.treemap.topPct': '상위 {pct}%',
    'landing.treemap.windowPhraseWithDays': '최근 {days}일간의 함선 순위 집계 기간',
    'landing.treemap.windowPhraseNoDays': '함선 순위 집계 기간',
    'landing.treemap.viewTreemap': '트리맵',
    'landing.treemap.viewScatterplot': '전투 수 대비 승률 산점도',
    'landing.shipLeaderboard.heading': '함선 리더보드{suffix}',
    'landing.shipLeaderboard.windowSuffix': '최근 {days}일',

    'landing.treemap.chartSectionLabel': '서버 함선 차트',
    'landing.treemap.chartViewGroup': '차트 보기',
    'landing.treemap.toggleMap': '트리맵',
    'landing.treemap.togglePlot': '산점도',

    'shipClass.destroyers': '구축함',
    'shipClass.cruisers': '순양함',
    'shipClass.battleships': '전함',
    'shipClass.aircraftCarriers': '항공모함',
    'shipClass.submarines': '잠수함',
    'shipClass.ships': '함선',

    'common.all': '전체',
    // Restored, fix round 1 (F3) — see en.ts's comment on this key.
    'common.clear': '초기화',
    'common.tier': '티어',
    // Filter-bar wiring (2026-08-04, follow-on #2): 함종, the ship-class
    // umbrella word — corpus-attested as a filter label on
    // asia.wows-numbers.com/ko/ships/ (see the research doc's Verified terms
    // table). No longer omitted — see the comment block at the bottom of
    // this file for how the omission note used to read.
    'common.type': '함종',
    // Same 2026-08-04 corpus pass, same page, same dual role: 국가 labels
    // the nationality filter above the ranking table.
    'common.nation': '국가',
    // NEEDS-NATIVE-CHECK — shipped anyway (generic-chrome admission, not a
    // corpus attestation): 등급 ("grade") is this task's own rendering of
    // our badge taxonomy (Expert/I/II/III), not a wows-numbers or community
    // term for it. This is the weakest attestation in this change, flagged
    // deliberately rather than left to blend in with the rest.
    'common.award': '등급',
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
    // reasoning on 효율 specifically — it's our own coinage in English too,
    // and a consistently-translated tab strip beats one that alternates
    // languages tab to tab). common.close/common.clan were deleted outright
    // this fix round rather than kept as unwired scaffolding — no call site
    // references either anywhere in the client, and no follow-on task claims
    // them (contrast the surviving common.* keys, which Fix 4's spec
    // amendment assigned to a named follow-on — now wired, see
    // common.type/common.nation/common.award above). common.clear was
    // ALSO deleted in that round on the same "no call site" reasoning —
    // **that inference was wrong, corrected fix round 1**: no call site is
    // not the same as no owner. EfficiencyBadgeTable.tsx's filter-row Clear
    // button was always there, rendering the same hardcoded 'Clear' literal
    // this key would have driven; it just hadn't been wired yet, the same
    // unwired state common.type/common.nation/common.award were in before
    // this pass. Restored above with the key populated and the button wired.
    //
    // Out of scope by the spec's own rule, not by attestation gap — the
    // long info-tooltip paragraph this label opens is explicitly excluded
    // from localization (client-locale-toggle-spec.md's Scope section), so
    // translating just the trigger's accessible name would announce a
    // Korean label for an English panel:
    //   landing.treemap.infoLabel
};
