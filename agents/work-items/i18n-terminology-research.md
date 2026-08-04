# WoWS terminology research — Korean and Japanese UI vocabulary

**Date:** 2026-08-04
**For:** `client-locale-toggle-spec.md`
**Method:** Firecrawl search + scrape, 2026-08-04

## Corpus

| Source | Why |
|---|---|
| `asia.wows-numbers.com/ja/…`, `/ko/…` (ranking, clan, player) | The closest analogue: a human-localized WoWS **stats** site. Same vocabulary as ours. |
| `namu.wiki/w/월드 오브 워쉽`, `…/전투 종류` | KR reference register; authoritative on mode names. |
| `arca.live/b/wows` (three threads) | The live KR community channel. Colloquial usage. |
| `wikiwiki.jp/wows` | JP community wiki. |
| `bbstars.work` (JP player stats blog), `note.com` WoWS guide | JP mid-register prose: a player writing about their own numbers. |
| `worldofwarships.asia/ja/`, `/ko/` | Official portals (marketing copy; thin on stats terms). |

**Excluded: Reddit `?tl=ja` / `?tl=ko` pages.** Those are Reddit's machine translations. Sampling them would measure the failure mode this research exists to avoid.

## Register target

Clean and modern; not hip, not young, not formal.

- **JA** — noun-form labels (体言止め), which is what UI labels are anyway. No keigo (`ご覧ください`), no slang (`草`, `神`).
- **KO** — noun-form labels. No 하십시오체 stiffness, no 반말 or board slang (`ㅇㅇ`, `개사기`).
- Community **short forms** (KO `항모`/`구축`/`순양`, JA `空母` as shorthand in prose) are how players *talk*; they are not how a UI *labels*. Full class nouns in labels.

## Verified terms

Counts are occurrences in the corpus above.

| English (our string) | Japanese | Korean | Evidence |
|---|---|---|---|
| Win rate | 勝率 | 승률 | Universal. wows-numbers column header in both locales; JP blog ×2; KR arca ×4. |
| Battles (count) | 戦闘数 | 전투 수 | wows-numbers column `戦闘` / `전투`; `戦闘数` in JP blog + both privacy footers. |
| Average damage | 平均ダメージ | 평균 데미지 | wows-numbers uses precise `平均与ダメージ` (damage *dealt*) in ranking tables; KO clan page uses `평균데미지`. Official KR client says `평균 피해량`. |
| Random battles | ランダム戦 | 무작위 전투 / 랜덤전 | JA universal (blog ×7, wows-numbers nav). KO: `무작위 전투` on namu ×8 + wows-numbers nav; `랜덤전` is the spoken form. |
| Ranked battles | ランク戦 | 랭크 전투 / 랭크전 | JA wows-numbers nav + blog ×2. KO: namu ×5 full, arca ×2 compact. |
| Clan battles | クラン戦 | 클랜 전투 / 클랜전 | JA blog ×9. KO: wows-numbers nav uses full, its own clan **table** uses `클랜전`. Both natural. |
| Co-op | Co-op 戦 | 연습 전투 | wows-numbers nav, both locales. |
| Ship | 艦艇 | 함선 | JA wikiwiki ×13, official ×13. KO wows-numbers nav. |
| Ship name | 艦名 | 함선 | wows-numbers search placeholder. |
| Battleship | 戦艦 | 전함 | Both corpora. KR arca ×11. |
| Cruiser | 巡洋艦 | 순양함 | namu ×69. |
| Destroyer | 駆逐艦 | 구축함 | JP blog ×5; namu ×59. |
| Aircraft carrier | 空母 | 항공모함 | namu ×47. Community shortens to `항모` in speech. |
| Submarine | 潜水艦 | 잠수함 | namu ×48. |
| Tier | Tier | 티어 | JA writes Latin: `Tier10`, `T9`. KO loanword dominates: namu ×21, arca `8티어`. `등급` — zero hits. |
| Player | プレイヤー | 플레이어 | wows-numbers nav (KO). JA nav leaves "Player" in Latin. |
| Clan | クラン | 클랜 | Universal. |
| Leaderboard | リーダーボード | 리더보드 | wows-numbers nav, both locales. |
| Season | シーズン | 시즌 | wows-numbers nav. |
| Search | 検索 | 검색 | wows-numbers search control. |
| Stats / record | 戦績 | 전적 | JP blog ×2; KR arca thread title *전적?같은거 어디서보는거임??* and *유저 닉 검색하면 전적 나옴*. This is the community's word for a player's record. `統計`/`통계` is the formal register. |
| Clan members | 在籍メンバー数 | 클랜 인원 | wows-numbers clan tables. |
| Active members | 活動しているメンバー数 | 활성 멤버수 | wows-numbers clan tables. |
| Personal rating | PR | 개인 레이팅(PR) | wows-numbers, both locales. |

## Not verified in this corpus

Flagged rather than guessed. These need a second pass or a native check before shipping:

- **Survival rate** — expected `生存率` / `생존율`; no corpus hit.
- **Nation** (ship nationality) — expected `国家` / `국가`; no corpus hit.
- **Efficiency** — not a WoWS term at all; it is our coinage. `効率` / `효율` are the literal renderings and may read as jargon-free but also as meaningless. **Admitted anyway as the `insights.tabs.efficiency` TAB label** under the generic-UI-chrome tier — see the admission table below for the reasoning (the vagueness is symmetric: the English word carries the same ambiguity for an English reader, and a consistently-translated tab strip beats one that alternates languages tab to tab). `player.section.efficiencyBadges` (the section heading, a compound noun phrase rather than a bare tab label) stays unadmitted.
- **Activity** (our tab) — no direct analogue in the corpus. **Admitted anyway as the `insights.tabs.activity` TAB label** under the generic-UI-chrome tier — see the admission table below.
- **Reigning champion**, **Skill bracket**, **Compare vs** — our own product language, no in-game source.

## Resolved forks

Decided 2026-08-04. Both options were attested in every case; register decided.

| Fork | Decision | Rationale |
|---|---|---|
| KO battle-mode length | **Compact**: `랜덤전` / `랭크전` / `클랜전` | What players write (arca.live), and what wows-numbers' own tables use. Fits tab labels. Diverges from the client's `무작위 전투`, accepted. |
| KO damage | **`데미지`** | The loanword the community and wows-numbers use. `피해량` is the client term and reads officialese. |
| JA tier | **`Tier`, Latin** | How JP players write it (`Tier10`, `T9`). Keeps the numeral adjacent in dense rows. |
| Word for "stats" | **`戦績` / `전적`** | The community's own word for a player's record; `統計`/`통계` reads institutional. |

Applied consistently: `랜덤전` (not `랭덤전`), `랭크전`, `클랜전`.

## Generic UI chrome: a two-tier attestation standard

Added 2026-08-04 (fix round 1 on the dictionary-population task), after review found the
original "do not translate anything not attested here" instruction self-contradicted:
it also specified three chrome strings (`nav.selectRealm`, `nav.language`, `common.all`)
that this corpus does not attest. That gap is closed here, explicitly, so the next
person doesn't re-derive it:

- **Game terminology requires corpus attestation.** Ship classes, battle modes, tiers,
  damage, win rate, seasons, clans — anything a player would recognize from the game
  client. Unattested means omitted. This is unchanged and absolute; it is the rule the
  rest of this document exists to serve.
- **Generic UI chrome may use standard everyday vocabulary without a corpus hit.**
  Words like "language," "all," "select," "close" carry no game-specific register
  risk — there is no plausible-but-wrong WoWS jargon to accidentally introduce, because
  they aren't WoWS jargon at all.

Keys admitted under the generic-chrome tier, with their values:

| Key | Korean | Japanese |
|---|---|---|
| `nav.selectRealm` | 서버 선택 | サーバー選択 |
| `nav.language` | 언어 | 言語 |
| `common.all` | 전체 | すべて |
| `nav.selectTheme` | 테마 선택 | テーマ選択 |
| `nav.searchSubmit` | 검색 | 検索 |
| `nav.themeLight` | 라이트 | ライト |
| `nav.themeDark` | 다크 | ダーク |
| `nav.themeCurrent` | 테마: {label} | テーマ: {label} |
| `insights.tabs.activity` | 활동 | アクティビティ |
| `insights.tabs.profile` | 프로필 | プロフィール |
| `insights.tabs.efficiency` | 효율 | 効率 |
| `notFound.title` | 페이지를 찾을 수 없습니다 | ページが見つかりません |
| `notFound.body` | 요청하신 페이지를 찾을 수 없습니다. | お探しのページは見つかりませんでした。 |
| `landing.treemap.topPct` | 상위 {pct}% | 上位{pct}% |
| `landing.treemap.windowPhraseWithDays` | 최근 {days}일간의 함선 순위 집계 기간 | 直近{days}日間の艦艇ランキング集計期間 |
| `landing.treemap.windowPhraseNoDays` | 함선 순위 집계 기간 | 艦艇ランキング集計期間 |
| `landing.treemap.viewTreemap` | 트리맵 | ツリーマップ |
| `landing.treemap.viewScatterplot` | 전투 수 대비 승률 산점도 | 戦闘数と勝率の散布図 |
| `landing.shipLeaderboard.windowSuffix` | 최근 {days}일 | 直近{days}日間 |
| `landing.treemap.heading` (template) | {realm} 서버에서 가장 많이 플레이한 {bucket}{suffix} | {realm}サーバーで最もプレイされた{bucket}{suffix} |
| `landing.treemap.ariaLabel` (template) | {realm} 서버에서 {windowPhrase} 동안 가장 많이 플레이한 {bucket}을 {view} 형태로 표시 | {realm}サーバーで{windowPhrase}に最もプレイされた{bucket}を{view}として表示 |
| `landing.shipLeaderboard.heading` (template) | 함선 리더보드{suffix} | 艦艇リーダーボード{suffix} |

**Added 2026-08-04 (follow-on #1, the composed-template blocker).** The client-
locale-toggle spec named three `en.ts` keys whose `{}` clauses were built as
English literals inside components, never passed through `t()` — translating
the outer template alone would have shipped a mixed-language string like
`함선 리더보드 · last 45 days rolling`. Each clause now has its own key,
resolved through `t()` in the component before being handed to the outer
template as a var. Two kinds of new key:

- **Compositions of already-attested terms**, no new admission needed:
  `shipClass.destroyers`/`cruisers`/`battleships`/`aircraftCarriers`/
  `submarines`/`ships` reuse the individual ship-class nouns from the Verified
  terms table above (전함/戦艦, 순양함/巡洋艦, 구축함/駆逐艦, 항공모함/空母,
  잠수함/潜水艦, 함선/艦艇). Neither Korean nor Japanese pluralizes, so each
  value equals the singular noun already verified there — there is no new
  vocabulary claim being made, only a new call site (the treemap heading's
  bucket label) for nouns this document already clears.
- **New generic-chrome admissions**, added to the table above: `top {pct}%`,
  the two window-phrase variants ("rolling[, trailing N-day] ship-standings
  window"), `treemap`/`scatterplot`, and "last {days} days rolling" (as
  `landing.shipLeaderboard.windowSuffix`). These are exactly the class the
  "Generic UI chrome" section above describes — sort/filter/view-mode chrome
  with no plausible-but-wrong WoWS jargon to introduce, since none of them are
  WoWS jargon. The two composed heading/ariaLabel **templates** themselves
  (`landing.treemap.heading`/`landing.treemap.ariaLabel`/
  `landing.shipLeaderboard.heading`) are listed too, since this is also the
  point their word order was decided (previously blocked as "too risky") —
  KO/JA both keep the bucket/suffix clauses in the same relative position as
  English, adding a possessive/locative connective (`서버에서`/`サーバーで`,
  "at the {realm} server") rather than reordering, since the source order
  already reads naturally in both target languages for this sentence shape.

Added 2026-08-04 (Task 8b, closing the header's last two untranslated words —
the `Go` submit button and the theme chip's `Light`/`Dark`/`Theme: …`).
`nav.searchSubmit` is not a literal rendering of "Go": it reuses the
corpus-attested Search verb (row 53 above, 検索/검색) because a Korean or
Japanese search form labels its button with the verb, not an English
interjection. `nav.themeLight`/`nav.themeDark` are the established loanwords
interface toggles actually use. `nav.themeCurrent` composes the WHOLE button
aria-label (`Theme: {label}`) as one template — keying only the theme word
would leave the accessible name a mixed-language `Theme: 다크`.

**Added 2026-08-04 (final fix round), backfilled onto keys the standard existed
before but was never applied to.** `insights.tabs.activity`, `insights.tabs.profile`,
and `insights.tabs.efficiency` are the three tab labels that were left English while
`insights.tabs.ships`/`insights.tabs.ranked`/`insights.tabs.clanBattles` were
translated — the two-tier standard was written (Task 7) and then applied forward to
later keys, but never applied backward to close this gap, so the six-tab strip read
as `Activity | 함선 | Profile | Efficiency | 랭크전 | 클랜전`: three of six adjacent
labels flipping language, which reads as broken rather than as scoped. "Activity" and
"Profile" are unambiguous everyday interface words with no WoWS register risk — the
same class as `nav.language`/`common.all` above.

**`insights.tabs.efficiency` (효율/効率) is the harder case, argued explicitly.** The
"Not verified in this corpus" section above already flags `効率`/`효율` as literal
renderings that "may read as jargon-free but also as meaningless" — that is true, and
it is *equally* true of the English word "Efficiency" to an English reader: this is
our own product coinage with no in-game source, so the vagueness is a property of the
concept, not of the translation. Given that, leaving the label untranslated buys no
extra precision, only inconsistency: a six-tab strip with three tabs in Korean and
three in English is a worse experience than six tabs uniformly in Korean, even where
one of those six is an admittedly-vague coinage. A consistent language beats a
precise-but-alternating one. `player.section.efficiencyBadges` — the section heading,
not the tab label — is a different case (a compound noun phrase, not a bare generic
word) and stays unadmitted.

`notFound.title`/`notFound.body` are the client's 404 copy ("Page Not Found" / "The
requested page could not be found.") — generic application chrome with no game
vocabulary in it at all, admitted for the same reason as `nav.language`.

This tier is deliberately narrow. `common.clear`, `common.close`, and `common.clan`
were considered for it and **rejected** — not deferred to a follow-on, deleted outright
(final fix round): no call site in the client references any of the three, and no
follow-on task claims them, so keeping them as translated-but-unwired scaffolding cost
more than it delivered. `common.clan` in particular was translated in both locales with
nowhere to land. Contrast the *other* nine `common.*` keys (`tier`, `type`, `all`,
`battles`, `avgDamage`, `winRate`, `ship`, `player`, `season`), which stay as
scaffolding because the client-locale-toggle spec's Scope section now names an actual
follow-on for them (the landing filter bar + `EfficiencyBadgeTable.tsx`). Do not extend
this tier without a matching entry here.

`common.type` is a different case and does **not** belong in the paragraph above:
"type" here means ship class (Battleship / Cruiser / Destroyer / …), which is
game-category vocabulary, not generic interface chrome. It is blocked under the
**absolute** tier — omitted for lack of corpus attestation of the umbrella category
word itself, the same status as `common.tier`/`common.avgDamage` would carry if this
corpus hadn't attested them. Unlike `common.clear`/`common.close`/`common.clan`
(deleted outright above), `common.type` is kept as scaffolding — the client-locale-toggle
spec names the landing filter bar + `EfficiencyBadgeTable.tsx` as its follow-on owner —
but is blocked on whoever runs the next corpus pass to attest the umbrella word, not on
finding it a call site.
