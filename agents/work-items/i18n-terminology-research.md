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
| Tier | Tier | 티어 | JA writes Latin: `Tier10`, `T9`. KO loanword dominates: namu ×21, arca `8티어`. `등급` — zero hits. `단계` is a second attested-but-not-chosen KO alternative — see the Resolved forks table below; the `티어` ruling stands. |
| Player | プレイヤー | 플레이어 | wows-numbers nav (KO). JA nav leaves "Player" in Latin. |
| Clan | クラン | 클랜 | Universal. |
| Leaderboard | リーダーボード | 리더보드 | wows-numbers nav, both locales. |
| Season | シーズン | 시즌 | wows-numbers nav. |
| Search | 検索 | 검색 | wows-numbers search control. |
| Stats / record | 戦績 | 전적 | JP blog ×2; KR arca thread title *전적?같은거 어디서보는거임??* and *유저 닉 검색하면 전적 나옴*. This is the community's word for a player's record. `統計`/`통계` is the formal register. |
| Clan members | 在籍メンバー数 | 클랜 인원 | wows-numbers clan tables. |
| Active members | 活動しているメンバー数 | 활성 멤버수 | wows-numbers clan tables. |
| Personal rating | PR | 개인 레이팅(PR) | wows-numbers, both locales. |
| Ship type / class (umbrella) | 艦種 | 함종 | `asia.wows-numbers.com/ko/ships/` and `/ja/ships/`, corpus pass 2026-08-04. Appears **twice on the page, in both roles**: as the filter label above the ranking table (`**함종:** 전체 \| 구축함 항공모함 …`) and as a column header in the table itself (`\| 함선 \| 단계 \| 함종 \| 국가 \| …`). Reproduces on both hosts. (Fix round 1 first recorded "column header", a later pass over-corrected to "filter label only"; both were partial — it is both, which is the strongest form of the evidence, since our own use is a filter label.) Distinct from the individual class nouns (전함/戦艦, 순양함/巡洋艦, …) already attested above. Closes the gap the client-locale-toggle spec named as the blocker on `common.type`. |
| Nation (ship nationality) | 国家 | 국가 | Same 2026-08-04 pass, same page, same dual role as 함종/艦種 above: it labels the nationality filter and heads the nationality column (`\| 함종 \| 국가 \| 전투 \| …`). Closes the gap the spec named as the blocker on `common.nation`. |
| Top N% (percentile filter, KO only) | — (see note) | 상위{pct}% | **Re-cited, fix round 1** — the original attribution to `asia.wows-numbers.com/ko/ships/` was wrong; re-verification found zero occurrences of `상위` there. The real source is `namu.wiki/w/월드 오브 워쉽` (`상위` ×3). Already shipped as `landing.treemap.topPct`'s Korean value under the generic-chrome tier (2026-08-04, follow-on #1); promoted here now that namu.wiki attests it directly. **Japanese `上位` is NOT promoted** — see the demotion note under Generic UI chrome below; its only hit is a single occurrence on an unvetted source. |
| Survival (player stat) | **生存率** | 생존 | **Two sources, two tiers, and the locales end up DIVERGENT — this is deliberate.** The 2026-08-11 corpus pass found the localization site's row (`\| 생존 \| 39.28% \|` / `\| 生還 \| 39.28% \|`) — a bare label, percentage in the value, no block header supplying "rate", reproduced across four player pages on two hosts. The native audit later that day upheld **ko 생존** on exactly that structural ground, and overturned **ja 生還**: JP's best LABEL-register source, `wikiwiki.jp/nanjwows/指標`, carries the heading `### 生存率` (×2 on the page; 生還 ×0), and a player blog enumerating his own stat screen reads `…勝数(勝率)/生存率/ダメージ/平均キル数…`. Where a localizer and the community disagree, this doc's Register target picks the community — and Korean's community evidence for the *label* position agrees with its localizer while Japanese's does not. Do not "harmonize" the two. (KO prose does say 생존률 — `arca.live` "게임 전체 평균 생존률이 50프로 언저리" — but that is prose, not label, register.) |
| Kill/death ratio | キル/デス比 | 격침 비율 | Same 2026-08-11 pass, same table (`\| 격침 비율 \| 1.16 \|`, `\| キル/デス比 \| 1.16 \|` — identical value, so the two label the same metric). Our card shows the Latin abbreviation **KDR**; the corpus never abbreviates this one, unlike WR and PR, so it ships translated. **Upheld by the native audit on arithmetic rather than assertion**: from one quoted ko page, 생존 45.39% and 함선 격침 0.52 give deaths/battle = 0.5461 and frags ÷ deaths = 0.952, against that page's printed 격침 비율 of 0.95. So 격침 비율 *is* kills ÷ deaths. |
| Frags per battle | **平均撃沈数** | **평균 격침** | **The corpus uses TWO labels for this one metric, and which one is correct depends on whether a block header is present. Read this row before "restoring" the older citation — it is real, and it describes a different position on the page.** *Header present*: under `전투 평균치` / `期間平均値` ("battle averages") the table reads `\| 함선 격침 \| 0.7 \|` / `\| 艦船撃沈 \| 0.7 \|`; the header supplies the per-battle sense. *Header absent*: the same page heads its per-ship columns `평균 격침` (×4 on the ko page: `\| 전투 \| 전투 % \| 승률 \| PR \| 평균 격침 \| 평균 데미지 \|`) and `平均撃破数` on the ja side, and `wikiwiki.jp/nanjwows/指標` has the heading `### 平均撃沈数` (×2). **The clincher**: both pages ALSO use the bare form for a raw single-battle record count (ko `함선 격침` line 194, ja `艦船撃沈` beside 武蔵 with the value **10**), so it carries no per-battle sense of its own. Our tile is header-free — it sits beside `전투 수 38` / `戦闘数 38` — so it takes the 평균/平均 form. 撃沈 over 撃破 on ship-specificity (judgment, both attested). |
| Recent / last (KO) | — (see note) | 최근 | **Re-cited, fix round 1** — the original attribution was wrong; re-verification found zero occurrences on the `ships/` pages. Real sources: `namu.wiki/w/월드 오브 워쉽` (`최근` ×8) and `asia.wows-numbers.com/ko/` root (`최근 이벤트`, `최근 전적` ×2 — `최근 전적` is exactly our register, "recent record"). Already shipped as the `최근` clause inside `landing.treemap.windowPhraseWithDays`'s and `landing.shipLeaderboard.windowSuffix`'s Korean values; promoted for the same reason as Top N% above. Japanese's `直近` was recorded here as having "no corpus hit of its own" — **that is false, corrected 2026-08-11 by the native audit**: the ja player page's own column header row reads `\| 全期間 \| 最近 \| 直近７日 \| 直近3週間 \| 直近 90 日 \| 直近 180 日 \| 直近 365 日 \|`, which attests `直近N日` in exactly the role our window phrases use it. Promote it alongside the Korean. |

## Deliberately untranslated: `PvP` / `PvE`, `Window WR`, and the metric pills

Added 2026-08-11 with the player-page wiring. Same shape of ruling as `WR ≥`
below — evidenced decisions, not gaps a later pass should "fix":

- **`PvP` / `PvE`** appear nowhere as display text in either localized corpus.
  The only hits on the ko player page are URL query values (`?type=cpvp`).
  They stay Latin, bolted to the verified noun (`PvP 전투 수`, `PvP 戦闘数`) —
  the same treatment `PR` already gets in the Verified terms table.
- **`Window WR`** is omitted outright in both dictionaries (pinned in
  `dictionaries.test.ts`'s `NEEDS_NATIVE_CHECK`). "Window" as a span of time is
  our own framing: ja's nearest phrase, `期間平均値`, labels an averages block
  rather than a window, and ko's counterpart on the same table is `전투 평균치`,
  a different idea again. With WR itself staying Latin, any rendering would be
  a coinage bolted to an abbreviation.
- **The treemap metric pills (`WR%` / `dmg` / `Kills`)** stay Latin **as a
  set**. WR is Latin by the rule below; translating `Kills` alone (격침/撃沈 is
  attested) would leave one mixed-script control group, which is worse than a
  consistent Latin one. The panel TITLES around them are translated, because
  `Type`/`Tier` there are the same two words the ships table below renders —
  leaving those English was the alternating-language defect the 2026-08-11
  round set out to close.

## Deliberately untranslated: `WR ≥`

Added 2026-08-04, filter-bar wiring (follow-on #2). `ShipLeaderboard.tsx`'s
WR-percentile filter label (`WR&nbsp;≥`) stays hardcoded English in every
locale — this is a **decision, evidenced against this corpus, not an
omission**: the localized `asia.wows-numbers.com` ranking tables keep `WR
Diff` in Latin in **both** the ko and ja versions of the page. Neither locale
substitutes a native rendering for "WR" — the community reads it as an
untranslated abbreviation in both languages, the same way `PR` (Personal
Rating) already appears untranslated in the Verified terms table above. No
`common.*` key was added for it, and none should be added by a future pass
that notices `WR ≥` sitting in English next to a translated `Tier`/`Type`
and assumes it was missed — it wasn't; see `ShipLeaderboard.tsx`'s inline
comment at this call site and the client-locale-toggle spec's "Known traps"
section, which records the same ruling.

## Not verified in this corpus

Flagged rather than guessed. These need a second pass or a native check before shipping:

- ~~**Survival rate**~~ — **resolved 2026-08-11, in two steps, and the original
  prediction was wrong in an instructive way** (see the Verified terms row for
  the final values: ja `生存率`, ko `생존` — deliberately divergent).** This entry expected `生存率` /
  `생존율` and found nothing, which read as "the corpus has no word for it."
  It does; the word simply has no 率/율 suffix. `asia.wows-numbers.com`'s player
  summary table carries the row `| 생존 | 39.28% |` in ko and `| 生還 |
  39.28% |` in ja — the percentage lives in the value, so the label is the bare
  noun. Shipped as `player.stats.survival`. A future pass that "corrects" these
  toward the predicted forms would be reverting evidence to a guess; both
  dictionaries carry a comment saying so. Note this does **not** unblock
  `player.section.winRateVsSurvival`, which stays omitted for its unattested
  `vs` connective (see the Compound headings group).
- ~~**Nation** (ship nationality)~~ — resolved by the 2026-08-04 corpus pass;
  see the Verified terms table above (`国家`/`국가`).
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
| KO tier word | **`티어` (unchanged)** | The 2026-08-04 corpus pass surfaces `단계` as the literal ko.wows-numbers column header for "Tier" — a second attested option, not a guess. The ruling stands anyway: `단계` is the formal, institutional word a table header uses; `티어` is the community's own register (namu ×21, arca), which is what this doc's Register target section asks for throughout. Recorded as the attested-but-not-chosen alternative, not a fork to re-open. |

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
| `common.clear` (restored fix round 1, F3 — see the note below the "This tier is deliberately narrow" paragraph) | 초기화 | クリア |
| `nav.selectTheme` | 테마 선택 | テーマ選択 |
| `nav.searchSubmit` | 검색 | 検索 |
| `nav.themeLight` | 라이트 | ライト |
| `nav.themeDark` | 다크 | ダーク |
| `nav.themeCurrent` | 테마: {label} | テーマ: {label} |
| `insights.tabs.activity` | 활동 | アクティビティ |
| `insights.tabs.profile` | 프로필 | プロフィール |
| `insights.tabs.efficiency` | 효율 | 効率 |
| `footer.lastViewed` (added 2026-08-10 — see the note below) | 최근 조회: | 最近見た: |
| `notFound.title` | 페이지를 찾을 수 없습니다 | ページが見つかりません |
| `notFound.body` | 요청하신 페이지를 찾을 수 없습니다. | お探しのページは見つかりませんでした。 |
| `common.award` (EfficiencyBadgeTable's filter-bar label) | 등급 ‡ | 等級 ‡ |
| `landing.treemap.topPct` (Japanese half only — Korean is promoted, see Verified terms) | *(promoted — see Verified terms table)* | 上位{pct}% † |
| `landing.treemap.windowPhraseWithDays` | 최근 {days}일간의 함선 순위 집계 기간 | 直近{days}日間の艦艇ランキング集計期間 |
| `landing.treemap.windowPhraseNoDays` | 함선 순위 집계 기간 | 艦艇ランキング集計期間 |
| `landing.treemap.viewTreemap` | 트리맵 | ツリーマップ |
| `landing.treemap.viewScatterplot` | 전투 수 대비 승률 산점도 | 戦闘数と勝率の散布図 |
| `landing.shipLeaderboard.windowSuffix` | 최근 {days}일 | 直近{days}日間 |
| `landing.treemap.heading` (template) | {realm} 서버에서 가장 많이 플레이한 {bucket}{suffix} | {realm}サーバーで最もプレイされた{bucket}{suffix} |
| `landing.treemap.ariaLabel` (template) | {realm} 서버에서 {windowPhrase} 동안 가장 많이 플레이한 {bucket}을 {view} 형태로 표시 | {realm}サーバーで{windowPhrase}に最もプレイされた{bucket}を{view}として表示 |
| `landing.shipLeaderboard.heading` (template) | 함선 리더보드{suffix} | 艦艇リーダーボード{suffix} |
| `nav.realmCurrent` | 서버: {realm} | サーバー: {realm} |
| `nav.languageCurrent` | 언어: {language} | 言語: {language} |
| `landing.treemap.chartSectionLabel` | 서버 함선 차트 | サーバー艦艇チャート |
| `landing.treemap.chartViewGroup` | 차트 보기 | チャート表示 |
| `landing.treemap.toggleMap` | 트리맵 | ツリーマップ |
| `landing.treemap.togglePlot` | 산점도 | 散布図 |
| `footer.leaveFeedback` | 피드백 남기기 | フィードバックを送る |
| `feedback.modal.title` | 피드백 남기기 | フィードバックを送る |
| `feedback.category.featureSuggestion` | 기능 제안 | 機能の提案 |
| `feedback.category.bugReport` | 버그 신고 | バグ報告 |
| `feedback.messagePlaceholder` | 문제나 제안 사항을 알려주세요 | 問題や提案の内容を入力してください |
| `feedback.submit` | 제출 | 送信 |
| `feedback.submitting` | 제출 중… | 送信中… |
| `feedback.cancel` | 취소 | キャンセル |
| `feedback.close` | 닫기 | 閉じる |
| `feedback.success` | 감사합니다! 피드백이 검토를 기다리고 있습니다. | ありがとうございます!いただいたフィードバックは確認を待っています。 |
| `feedback.error.correctBelow` | 아래 오류를 수정해 주세요. | 以下のエラーを修正してください。 |
| `feedback.error.generic` | 문제가 발생했습니다. 나중에 다시 시도해 주세요. | 問題が発生しました。しばらくしてからもう一度お試しください。 |
| `feedback.error.network` | 네트워크 오류입니다. 다시 시도해 주세요. | ネットワークエラーです。もう一度お試しください。 |
| `feedback.category.languageIssue` (NEEDS-NATIVE-CHECK, see § below) | 번역 오류 신고 | 翻訳問題の報告 |

Added 2026-08-11 with the player-page wiring (PlayerDetail + BattleHistoryCard
+ BattleHistoryTreemaps). Calendar words, refresh state, a privacy notice, and
two compounds built from already-admitted or already-verified parts:

| Key | Korean | Japanese |
|---|---|---|
| `player.header.lastPlayedToday` / `…DaysAgo` | 마지막 전투: 오늘 / …: {days}일 전 | 最終戦闘: 本日 / …: {days}日前 |
| `player.header.updating` | 업데이트 중… | 更新中… |
| `player.header.nextUpdate` | 다음 업데이트: {minutes}분 | 次の更新: {minutes}分 |
| `player.header.shareAriaLabel` | 플레이어 URL 복사 | プレイヤーURLをコピー |
| `player.hidden.title` / `…body` (NEEDS-NATIVE-CHECK — longest prose in either dictionary) | 이 플레이어의 전적은 비공개입니다. / … | このプレイヤーの戦績は非公開です。/ … |
| `player.stats.pvpBattles` / `player.stats.pveBattles` | PvP 전투 수 / PvE 전투 수: | PvP 戦闘数 / PvE 戦闘数: |
| `player.stats.totalBattles` (NEEDS-NATIVE-CHECK — the compound is ours) | 전체 전투 수: | すべての戦闘数: |
| `battleHistory.window.day/week/month/fortyfive` | 일 / 주 / 월 / 45일 | 日 / 週 / 月 / 45日 |
| `battleHistory.header.today/last7/last30/last45` | 오늘 / 최근 7일 / 최근 30일 / 최근 45일 | 本日 / 直近7日間 / 直近30日間 / 直近45日間 |
| `battleHistory.tile.ships` | 함선 | 艦艇 |

Amended 2026-08-11 by the native audits (both languages, independently):

| Key | Korean | Japanese |
|---|---|---|
| `player.header.nextUpdate` | 다음 업데이트: {minutes}**분 후** | 次の更新: {minutes}**分後** |
| `battleHistory.tile.ships` | **함선 수** (was 함선) | 艦艇 |

`분 후`/`分後` because the bare minute unit denotes a *duration* ("15 minutes"),
not the time-until the English means; both audits raised this independently in
their own language. `함선 수` puts the ship COUNT in parallel with the attested
`전투 수` beside it — a composition of ours, admitted on that pattern, and it
also removes the 함선/함선-격침 collision that made the old Frags tile misread.
Japanese needs no equivalent: `艦艇` is already the object/count noun there,
distinct from `艦名` for the name column (see `common.ship`).

`player.stats.totalBattles`'s Korean NEEDS-NATIVE-CHECK is **cleared**: `전체`
is not merely our admitted chrome word, it is the site's own "all" column
header on the same table. The Japanese half stays flagged — its `総戦闘数`
alternative rests on a search snippet, which the audit refused to promote.

**Still unkeyed, and gaps rather than rulings** (recorded so the next round
does not have to rediscover them): the ships-table's `F/B` column — the same
metric as the Frags tile, for which the corpus gives `평균 격침` outright — and
`Overall WR %`, where the WR-stays-Latin ruling covers `WR` but not `Overall`
(`전체` is available). Neither exists in `keys.ts`, so neither is covered by
`NEEDS_NATIVE_CHECK`.

**The two `lastPlayed` keys are restructured, not calqued.** English leads with
the verb ("Last played 2 days ago"); both translations lead with the noun and
put the time after a colon, which is how the corpus writes recency (`최근 전적`,
`直近N日`). A calque would be grammatical and wrong in register.

**`landing.treemap.topPct`'s Korean half and the `최근` clause: promoted, the
Japanese half of `topPct`: demoted back (fix round 1).** All three were
admitted here on 2026-08-04 before any corpus evidence existed for them. A
follow-up corpus pass claimed to attest both halves of `landing.treemap.topPct`
and Korean `최근` against `asia.wows-numbers.com`'s `ships/` pages — re-verified
2026-08-04 (fix round 1) and found **zero** occurrences of any of them on those
pages; the attribution, not the underlying words, was wrong. Re-citing against
the real sources (see the Verified terms table above): Korean `상위` (namu.wiki
×3) and Korean `최근` (namu.wiki ×8, wows-numbers ko root ×2) both hold up and
stay promoted to Verified terms. **Japanese `上位` does not hold up the same
way** — the only occurrence found anywhere in re-verification is a single hit
on `gamewith.jp/worldofwarships/article/show/461801`, a source never vetted
into this corpus (see the Corpus table at the top of this doc). One hit on an
unvetted source is a weak signal, not an attestation — the whole point of this
attestation discipline is that the word "attested" means something, so
`landing.treemap.topPct`'s Japanese value moves back to this table (marked †
below) rather than staying in Verified terms on a single thin hit. It is not
deleted: a future corpus pass against a vetted JP source (wikiwiki.jp,
bbstars.work, official portal) is the way to actually attest it.
`landing.treemap.windowPhraseWithDays` and `landing.shipLeaderboard.windowSuffix`
stay listed here rather than moving wholesale: each composes a full phrase
("N-day ship-standings window", "last N days rolling") where only the Korean
`최근` word inside is independently attested — the rest of the phrase ("함선
순위 집계 기간", the standings-window concept itself) is still our own
coinage, not a WoWS term. Japanese `直近`, used in the same two keys, was
recorded here as having "no corpus hit of its own (not even a weak one)" —
**corrected 2026-08-11**: it heads the ja player page's own window columns
(`直近７日`, `直近 90 日`, `直近 365 日`), so the WORD is attested in exactly
our role; only the surrounding standings-window phrase remains our coinage.
(The client-locale-toggle spec's "Known traps" section still carries the old
claim and should be read against this correction.)

† `landing.treemap.topPct`'s Japanese value (`上位{pct}%`) is a **weak signal,
not an attestation**: one occurrence on `gamewith.jp`, unvetted. Recorded here
under generic UI chrome (no WoWS-jargon register risk either way — it's a
percentile-filter word, not a game term) rather than deleted, pending a
stronger future hit.

‡ **Added 2026-08-04, filter-bar wiring (follow-on #2).** `common.award` is
the weakest attestation in this document, flagged deliberately rather than
left to blend in with the stronger rows above. It names
`EfficiencyBadgeTable.tsx`'s badge-tier filter — our own product taxonomy
(Expert/I/II/III), not anything WoWS or its community ranks ships or players
by, so no stats-site corpus pass will ever attest it (this is not a "second
pass might find it" gap like `Survival rate`; the concept itself doesn't
exist outside this site). Admitted under the generic-UI-chrome tier anyway:
"award" is common everyday vocabulary, if a strained fit for a WoWS-specific
badge taxonomy. The Korean/Japanese values chosen (등급/等級, "grade") are a
literal description of what the column's four values actually are — a
ranked grade, not an "award" in the trophy sense — rather than a rendering
of the English word "Award" itself. **NEEDS-NATIVE-CHECK**, marked inline in
`ko.ts`/`ja.ts` next to the key (not filed under the omission-list comment
block, since this key ships rather than being left absent): a native
speaker should confirm 등급/等級 read naturally as a filter-dropdown label
in this position, not just as a plausible dictionary rendering.

`nav.realmCurrent`/`nav.languageCurrent` compose the realm/language chip's
accessible name the same way `nav.themeCurrent` already does — "Realm"/
"Language" plus a generic colon-separated value, no WoWS register risk.
`landing.treemap.chartSectionLabel`/`chartViewGroup` pair the already-attested
`함선`/`艦艇` (ship) noun with the generic word for "chart" (차트/チャート);
`toggleMap`/`togglePlot` reuse the exact vocabulary already shipped for
`landing.treemap.viewTreemap`/`viewScatterplot` (트리맵/ツリーマップ for the
map view) plus a shortened, bare "scatterplot" word (산점도/散布図) for the
plot toggle, since the full "battles-vs-win-rate scatterplot" phrase used in
the aria-label clause does not fit a compact pill button.

`landing.treemap.infoLabel` (`en.ts`: "About the ship treemap and its
eligibility window") is deliberately **absent** from this table and from
`ko.ts`/`ja.ts` — it is keyed (so the structure is complete for a future pass)
but not translated, because the long info-tooltip paragraph it opens is
explicitly out of scope for localization per the client-locale-toggle spec's
Scope section. Translating the trigger's accessible name while the panel it
opens stays English would announce a translated label for an English panel;
that is a worse experience than a consistently-English trigger-and-panel
pair. See the comment on this key in `en.ts`/`ko.ts`/`ja.ts`.

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

**Added 2026-08-10 (`footer.lastViewed`), and the reason it was missed matters.**
This key arrived with the landing recent-players list (v4.9.0), *after* the pass
that triaged every other key into either a translation or a documented
NEEDS-NATIVE-CHECK omission, so it was never triaged at all: it sat in the
untranslated residue looking exactly like a deliberate omission while being an
ordinary gap. It qualifies for this tier plainly — `최근` is corpus-attested
(Verified terms, row 61), `조회` and `最近見た` are everyday interface vocabulary,
and the string labels a row of player links with no WoWS register to get wrong.
`最近` is deliberately not `直近`, which the same row leaves unattested.

The residue is now pinned by a test (`app/i18n/__tests__/dictionaries.test.ts`,
`the untranslated residue is exactly the documented NEEDS-NATIVE-CHECK set`), so
a later key cannot go untriaged the same way: adding one to `en.ts` without
either translating it or listing it there fails the suite. Coverage after this
change is 67 of 76 keys (88%) in both locales.

`notFound.title`/`notFound.body` are the client's 404 copy ("Page Not Found" / "The
requested page could not be found.") — generic application chrome with no game
vocabulary in it at all, admitted for the same reason as `nav.language`.

This tier is deliberately narrow. `common.close` and `common.clan` were considered for
it and **rejected** — not deferred to a follow-on, deleted outright (final fix round):
no call site in the client references either, and no follow-on task claims them, so
keeping them as translated-but-unwired scaffolding cost more than it delivered.
`common.clan` in particular was translated in both locales with nowhere to land.
Contrast the *other* nine `common.*` keys that existed before this pass (`tier`, `type`,
`all`, `battles`, `avgDamage`, `winRate`, `ship`, `player`, `season`), which stayed as
scaffolding because the client-locale-toggle spec's Scope section named an actual
follow-on for them (the landing filter bar + `EfficiencyBadgeTable.tsx`). Do not extend
this tier without a matching entry here.

**`common.clear` was deleted in that same round on the same reasoning and it was
wrong — corrected fix round 1 (F3).** "No call site references it" was true of the
code; "no follow-on task claims it" was not true of the intent. It restored the
already-named follow-on's business: `EfficiencyBadgeTable.tsx:330` renders a hardcoded
`Clear` button in the exact filter row this pass translated (see the entries above),
so the key had an owner the whole time — the deletion rationale mistook an unwired
key for an orphaned one, the same distinction that correctly kept `common.type`
scaffolded rather than deleting it alongside `common.close`/`common.clan`. Re-added
with English `'Clear'`, admitted under the generic-chrome tier (everyday interface
vocabulary, same tier as `common.all` — see the admission table above), and wired to
the button it was always describing.

(added to the admission table above this section, alongside `common.all`.)

`common.type` was a different case from the paragraph above: "type" here means ship
class (Battleship / Cruiser / Destroyer / …), which is game-category vocabulary, not
generic interface chrome, so its omission was never this tier's business to resolve.
**Update, 2026-08-04 corpus pass:** the umbrella category word itself is attested —
함종/艦種, the ship-class **filter label** above the ranking table on
`asia.wows-numbers.com/ko/ships/` and `/ja/ships/` (a filter label, not a column
header — corrected in fix round 1; see the Verified terms table above) — which closed
the attestation gap the same pass also closed for `common.nation` (국가/国家, same
page, same dual role).

**Wired, 2026-08-04, filter-bar follow-on #2.** The corpus pass above closed the
vocabulary gap; this pass closed the wiring gap it left open — `common.type` and the
new `common.nation` key are now populated in `ko.ts`/`ja.ts` and wired into both
`ShipLeaderboard.tsx`'s and `EfficiencyBadgeTable.tsx`'s filter bars, and a third new
key, `common.award` (등급/等級, generic-chrome admission — see the admission table's
`‡` entry above), fills the one label neither corpus pass could ever attest: it names
this site's own badge taxonomy, not a WoWS or community concept. The client-locale-
toggle spec's "What blocks wiring it now" section and Follow-ons list are updated to
match — see that spec.

**Added 2026-08-05, `feedback-submission-spec.md`'s frontend half (`FeedbackModal.tsx`
+ the footer "Leave feedback" link).** Fourteen new keys, all generic UI chrome —
form labels, button/state text, and success/error copy for a feedback form, none of
it WoWS vocabulary, so all fourteen are admitted under this tier without a corpus
hit and populated in `ko.ts`/`ja.ts` immediately (no omission, this is not the
WoWS-jargon tier). See the admission table above for the values.

The one case worth arguing explicitly: `feedback.category.languageIssue`. The
category exists specifically to close the loop on this project's own translation
mistakes (the `NEEDS-NATIVE-CHECK` residue this doc's earlier sections describe), so
"language issue" in this product means "our translation is wrong" — a literal calque
of "language" (언어/言語) would read as a report about the *game's* language settings,
not ours. Rendered instead as "translation error/problem report" (번역 오류 신고 /
翻訳問題の報告), which names the actual thing being reported. This is a judgment call
about framing, not a corpus attestation (there is no WoWS-community source for "how
to phrase a feedback-form category label"), so it carries `NEEDS-NATIVE-CHECK` in
`ko.ts`/`ja.ts` next to the key — same precedent as `common.award` — rather than
shipping a confident-looking guess.
