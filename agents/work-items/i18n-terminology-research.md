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
- **Efficiency** — not a WoWS term at all; it is our coinage. `効率` / `효율` are the literal renderings and may read as jargon-free but also as meaningless.
- **Activity** (our tab) — no direct analogue in the corpus.
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

This tier is deliberately narrow. `common.clear` and `common.close` remain omitted
even though they are generic — they belong to table/filter chrome scoped to a separate
follow-on task, not this admission list. Do not extend this tier without a matching
entry here.

`common.type` is a different case and does **not** belong in the paragraph above:
"type" here means ship class (Battleship / Cruiser / Destroyer / …), which is
game-category vocabulary, not generic interface chrome. It is blocked under the
**absolute** tier — omitted for lack of corpus attestation of the umbrella category
word itself, the same status as `common.tier`/`common.avgDamage` would carry if this
corpus hadn't attested them. It is not scoped to a follow-on task the way
`common.clear`/`common.close` are; it is scoped to whoever runs the next corpus pass.
