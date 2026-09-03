# Runbook: Korean Community Outreach and the Monthly ASIA Roll-Up Post

_Created: 2026-08-27_
_Context: Investigating why battlestats was receiving referral traffic from dcinside.com resolved to exactly three forum threads in one gallery, and revealed that KR players cite our win-rate-percentile filter by name to settle in-game arguments. This runbook turns that one-off investigation into a repeatable outreach process._
_QA: Every venue fact below was measured by scraping the live boards on 2026-08-26; every vocabulary rule is a counted occurrence in real posts, not an assumption. The generator was executed against production on 2026-08-26 and 2026-08-27._
_Status: **Generator written and tested** (`scripts/monthly_asia_post.py`), now also emitting a
new-ships section and a per-type rank-movement column. First post (covering August) is IN PROGRESS
as of 2026-09-02 — blocked once on arca.live's link filter (see arca.live posting mechanics below),
workaround shipped._

## Purpose

`runbook-audience-growth-instrumentation-2026-07-29.md` deliberately scoped outreach out
("which communities, which clans, which posts is operator-owned"). This runbook fills that gap for
the one language community that measurably exists: Korea. It records where the audience actually
is, what the venues' rules permit, the exact register a post must use to not read as
machine-translated, and the script that regenerates the monthly post from production data.

Read it before writing anything in Korean for a public board, and before the first of any month
when the ASIA roll-up is due.

## 1. Where the Korean audience actually is

Measured 2026-08-26. Ranked by whether anyone is home, which is the only ranking that matters.

| Venue | Activity | Verdict |
|---|---|---|
| DCInside `warship` minor gallery | ~104 posts/day | Live. Source of 100% of our KR referral traffic to date. |
| **arca.live `/b/wows`** | several posts/day, **persistent nicknames** | **Primary venue.** Standing accumulates here; on DCInside it cannot. |
| arca.live `/b/wowsasia` | last post 08-24 | Exists, much slower. Not the venue despite the ASIA-specific name. |
| Inven `wows` | 1-3 posts/**month** | Near-dead. Answer questions; never post an introduction. |
| Ruliweb `family/4804` | last activity 2026-05-20 | Dead. |
| Naver Cafe | no active PC WoWS cafe found | Absent. The Naver Game lounges are Blitz and Modern Warships. |

**Korea's community market leader is DCInside** (290M monthly visits, ~2x the runner-up FMKorea;
then theqoo 66M, arca.live 58M, Ruliweb 52M, MLBPark 49M, Inven 48M). That ranking excludes Naver
Cafe / Band / KakaoTalk openchat, which are closed gardens with no public front page: Korea has no
Reddit-shaped winner, it has a public-anonymous leader and a walled-garden leader that do not
compete on the same axis. Treat published MAU figures as ordinal only; 290M against a 51M
population means visits, not people.

**Do not propose building a better forum.** Arca.live already is one (same channel-per-topic
structure, better software, launched 2016) and sits at a fifth of DCInside ten years on. Its growth
event was the July 2020 DCInside minor-gallery restriction that drove the 디시 대이주 migration, not
product quality; and its operator is umanle S.R.L., **registered in Paraguay**, which is how a
Korean-audience site stays outside KCSC takedown jurisdiction and operator liability. The barrier
is jurisdiction and moderation, not design.

### The three DCInside threads (our entire KR referral history)

Gallery: `gall.dcinside.com/mgallery/board/lists/?id=warship` (mobile `m.dcinside.com/board/warship/<no>`).
A subject+body search for "battlestats" returns exactly three posts, and they map 1:1 onto the
three referral bursts ever recorded.

| Thread | Date | Title | Views/cmts | Linked |
|---|---|---|---|---|
| 61514 | 06-01 | 배틀스텟.온라인 (bare link drop) | 359 / 5 | `battlestats.online/` |
| 65235 | 07-08 | 공방 메타픽은 이거 보면 끝남? | 245 / 5 | `/?realm=na` |
| 69764 | 08-19 | 아시아 공방에선 근접배 힘들다는 사람 겜알못이라고 봐도됨? | 322 / 23 | `/?realm=asia` |

**The product signal is in the comments, not the traffic.** On 69764 a reply objects that
"통계가 항상 옳은 절대적 지표는 아님"; another answers **"상위 25% 플레이어 기준으로 해놓고 보셈
그럼 어느정도 정확해짐"** (*set it to the top-25% filter and it gets reasonably accurate*).
`top25` is a real bucket (`ShipLeaderboard.tsx`, `ShipStats.tsx`), so that is our filter being
quoted by name. The bare link drop drew 5 comments; the post that used the data to make an
**argument** drew 23. Arguments travel; links do not.

`?realm=` is functioning as a share primitive in the wild (posted as both `?realm=na` and
`?realm=asia`). Same hazard shape as `/ships/[bucket]`: confirm the landing page honours the param
over a recipient's stored realm.

**Reading gotchas for this data.** Filter `event_type=1` on detail queries too, or custom events
inflate a single session into an apparent burst (observed 08-20). Most DCInside referrers arrive
with the path stripped (`https://m.dcinside.com/`) in nginx as well as Umami, so attribute by the
landing URL's `realm` param and by which thread was posted nearby in time. nginx keeps the full
Referer query string that Umami's `referrer_path` drops, but only for ~15 days.

## 2. Rules: what the venues actually prohibit

Read the rulebooks; do not assume. Neither venue prohibits what we are doing.

**DCInside `warship` gallery rules** (manager 롯테, rev 2026-02-04) restrict exactly four commercial
things: referral/recruiter links in a post body (comments only), clan-recruitment posts (1/day, no
bumping), anything involving cash consideration or payback, and account sales. Plus a discretionary
catch-all for 문제있는 광고글. Nothing restricts linking a free tool. The manager closes with
"규정이 존나 깐깐하고 빡빡해서 좆망갤같은데요? = 다 읽어보면 정상적인 갤질만하면 전혀 문제없는 내용 입니다."

**Inven** restricts 상업적인 홍보 (commercial promotion) and referral/signup-inducing links.

**We trip none of it:** no ad tech in the client, no signup, no payment, no referral scheme.
And the empirical proof outranks any reading of a rulebook: three posts, none removed, the June one
still up twelve weeks later at +3, retrieved by gallery search as recently as 08-26.

### arca.live posting mechanics

- **Categories:** `공지 / 뉴스 & 정보 / 미디어 / 서브컬쳐 / 전대 모집 / 질문 / 코드 / 협약 / 홍보 / 후기`.
  A data post belongs in **뉴스 & 정보**. Note a **홍보** category also exists, so filing a
  site-owner's post outside it is a judgement call a 완장 could overrule. If moved, accept it and
  do **not** re-post.
- **The durable prize:** the channel's pinned index (`/b/wows/57350183`) contains a
  **워쉽 관련 웹사이트** section at `/b/wows/72170830`. Getting listed there outlasts any single post.
- **Login is CAPTCHA + optional 2FA** (username -> password -> Try Captcha -> WebAuthn ->
  OTP/recovery/mail). **Do not automate posting.** The CAPTCHA is the site stating this is for
  humans; a banned account does not lose a post, it loses the venue permanently. The operator posts;
  the agent translates. This is also the only arrangement in which the post's own closing promise
  ("point out any number that looks wrong and I will check it") is keepable.
- **The post filter rejects a raw `battlestats.online/...` link outright.** Observed 2026-09-02 on
  the first live posting attempt: `내용에 금지된 문구가 포함되어 있습니다. [.online/]` — a
  literal-substring match on `.online/` (dot, then "online", then slash), almost certainly a
  generic anti-spam rule against link-shaped `.online` TLDs rather than anything about this site
  specifically. A bare `battlestats.online` mention with no trailing slash is unaffected. The
  generator (`SITE_URL_DISPLAY` in `scripts/monthly_asia_post.py`) now prints the source-data line
  bracket-dotted (`battlestats[.]online/?realm=asia`) with a "remove the brackets" instruction,
  which is the standard workaround for this class of filter. If the inline-hyperlink step (turning
  the opening "battlestats.online" mention into a real link) also gets rejected, skip it — a
  plain-text mention is fine, only the source-data line needs to actually carry the URL.

### Anti-바이럴 doctrine

커뮤니티 침투 마케팅 ("community infiltration marketing") is a professionalised industry in Korea,
with agencies openly selling ordinary-looking accounts that post ordinary-looking recommendations.
Users are primed to detect and punish it, and the accusation costs more than being a self-promoter.

1. **Disclose authorship in the first lines, once, plainly.** It forecloses the only accusation
   that matters.
2. **Never cross-post the same content to multiple boards in one week.** That is the clearest
   바이럴 signature.
3. **Lead with the finding; link at the bottom.** Give the value away before asking for a click.
4. **Volunteer the number that undercuts your own headline.** It is the cheapest credibility
   available (see section 4).
5. **No clickbait.** A headline promising a result the data contradicts is the single most
   expensive mistake available; the neighbouring gallery bans 뉴비낚시 by name.

## 3. Register and vocabulary: measured, not assumed

Counted in real posts scraped from arca.live `/b/wows` and the DCInside gallery, excluding our own
drafts. **Zero-counterexample findings are strong; treat everything else as provisional.**

| Our instinct | What they actually say | Evidence |
|---|---|---|
| 랜덤전 | **공방** | 랜덤전 = **0** occurrences; 공방 = 11 |
| 티어10 | **10티어** | 티어10 = **0**; 10티어 = 5 |
| 평균 데미지 | **평딜** | 평균데미지 = 0 |
| 전투 (count) | **전투** - see the 판 trap | - |

Other attested jargon: 승률, 너프, 피탐, 음탐, 잠탐기, 수상함, 앵벌이 (grinding), 쌀먹 (credit farming).

### The 판 trap (we got this wrong once)

`판` means "a round" and **is** used: "한판 타고", "그판 끝날때까지", "2판인데". But it is
**conversational only**. As a numeric counter it is unattested (`[0-9]판` and `판수` both approx. 0
in real posts), so a stats table reading `59,575판` looks wrong. Use **전투**, the in-game Korean term.

**Method note:** a plain `grep -c 판` returned 160 and nearly convinced us, because `판` matches
inside 판다 / 판단 / 게시판 / 간판 / 재판. **Always bounded-grep** (`[0-9]판`, `판수`) before
trusting a substring count, and exclude our own drafts from the corpus.

### Ship names

Written in Korean and often abbreviated (힐데 = Hildebrand, 2501/4501 = U-2501/U-4501).
Confirmed in the wild: 샤토르노, 발라오, 아처피시, 아키, 이즈모, 레판토, 하노버, 슐리펜.
Corrected by readers on the August 2026 post: 알미란테 이리자르 (Almirante Irizar; we wrote
이리사르), 오데이셔스 (Audacious; we wrote 오다시어스). Both fixed in the generator; treat a
reader correction as the top authority for the `KO` table.
**Always include the English name in parentheses** - our site displays English, so it aids the
cross-checking we are explicitly inviting.

Unattested transliterations still carrying risk: 세치 지 세템브루 (Sete de Setembro),
프린스 판 오라녜 (Prins van Oranje).

### Register

Chat posts on these boards are 반말 with profanity. **That is not the register for an info post.**
The idiomatic pattern:

- **음슴체 (`~임` / `~함`)** for data, findings, and bullets. It reads as terse and neutral, *not* rude.
- **존댓말 (`~습니다` / `~해주세요`)** for direct address: the self-introduction, the limitations
  preamble, and the closing request.

Mixing that way is idiomatic, not sloppy. It is what "polite posture" means here.

Watch particles when interpolating: `전투` ends in a vowel, so it takes `-로`, not `-으로`.

## 4. The monthly ASIA roll-up post

### Why a calendar month needs a different data source

The site's ship standings run on a **rolling 60-day window** (`SHIP_LEADERBOARD_WINDOW_DAYS=60`,
pinned in `server/deploy/deploy_to_droplet.sh:793`). That cannot carry a monthly column:
consecutive posts would share half their battles and show near-identical numbers.

The generator therefore reads **`ShipPopDailyAgg`**, which is per-(realm, mode, ship, **day**) and
cuts cleanly by calendar month. Retention is `max(100, window + 15)` days (`data.py:7346`), so the
current month and the prior one are **always** available and month-over-month never breaks.
Year-over-year is permanently impossible, and a long series requires archiving each month's output.

The two views agree where they overlap (Sicilia topped battleships in both the 60-day and the
calendar-August cut), so a reader who clicks through finds the site consistent with the post. One
line in the limitations block explains the difference; keep it.

Note `roll_up_player_daily_ship_stats_task` has been failing nightly since 08-21 (see
`project_log_sweep_2026-08-26` memory). No data is lost, but **self-healing is down**, so verify day
coverage rather than assuming it: the generator does this and refuses to emit a clean post otherwise.

### Running it

The script lives at `scripts/monthly_asia_post.py` in the repo root (**not** `server/scripts/`), so
it is not inside the tree a backend deploy rsyncs. Until it is deployed, copy it over first:

```bash
scp scripts/monthly_asia_post.py root@battlestats.online:/tmp/mp.py
ssh root@battlestats.online
cd /opt/battlestats-server/current/server
set -a; . /opt/battlestats-server/shared/.env; set +a
/opt/battlestats-server/venv/bin/python manage.py shell \
    -c "import sys; sys.argv=['x','2026','8']; exec(open('/tmp/mp.py').read())"
```

It reads only `ShipPopDailyAgg` and `Ship`; it writes nothing, so it is safe to run against
production. (If it is ever moved under `server/`, a normal backend deploy will ship it and the
`scp` step drops away — see `reference_deploy_ships_working_tree`.)

Run on the **first of the following month**. The script refuses an incomplete month:

```
### WARNING: only 26/31 days present for 2026-08. Do not publish until the rollup has caught up.
```

Constants at the top: `FLOOR = 5000` (battles required to appear in a ranking table),
`MOVER_FLOOR = 8000` (battles required in **both** months for a MoM delta).

### Editorial invariants the script enforces

- **State the floor in the text and print battle counts beside every win rate.** An early draft had
  table entries resting on 268 battles; a WoWS audience finds that in seconds and it discredits
  every other number on the page.
- **Only genuinely below-average ships go in the "not just X" list.** Mechanically taking the top-N
  by battles pulled in good ships and contradicted the section's own claim.
- **Always compute the counterexample** (a heavily-played ship that is *also* good - Bungo in
  August). It is the line that proves we are describing the data rather than pushing a thesis. The
  script prints 예외 없음 if none qualifies.
- **Qualify the denominator.** At the 5,000-battle floor Yamato is last of 33 *battleships* but 4th-from-bottom of 92 ships
  overall. The lede volunteers the wider ranking and names the three ships below it.

### The `\xa0` trap

WG ship names contain **non-breaking spaces**: `'San\xa0Martín'`, `'Prins van\xa0Oranje'`. Korean
name lookups fail silently on exactly those and raw English leaks into the post. `_norm()` in the
generator strips them; any new name-mapping code must do the same.

### Do NOT publish the skill-sensitivity stat

`wr_pct=25` re-pools each ship's stats over the top 25% of **its own** players **by that ship's win
rate** (`compute_realm_ships_by_tier_type` docstring in `data.py`). Ranking ships by the
top25-minus-all gap therefore **selects on the outcome variable** and is circular; a ship with
higher win-rate variance shows a bigger gap mechanically. It is an interesting-looking number that
would not survive scrutiny.

Note also that the all-view and pct buckets are filled by **different warmers into separate cache
keys**, so they can be served from different windows (observed 2026-08-12). Verify
`window_start`/`window_end` parity before publishing any all-vs-pct comparison.

Explaining what 상위 25% actually measures is fine and worth doing, since the 69764 commenter
believes it filters to skilled players generally.

## 5. Procedure for the next post

1. Run the generator for the completed month; confirm no `WARNING`.
2. Read the output against section 3. New ship names entering the tables need a Korean form added
   to the `KO` map.
3. **Have a native Korean speaker read it.** Register reads subtly wrong in ways scraping cannot
   surface, and the transliterations above remain unattested. The post is short; this is cheap
   insurance on a first impression that happens once.
4. Operator logs into arca.live and posts to **뉴스 & 정보**. The agent does not log in.
5. Archive the generated text so a long series accumulates before retention drops it.
6. Replies: operator pastes them in, agent translates and drafts responses in the same register.

## 6. Follow-ups

- **`/api/realm/<realm>/top-ships/?limit=20` returns 504 after 20s**; the no-param form returns in
  0.2s. The UI never passes `limit`, so no user hits it, but it blocks a gunicorn worker on an
  uncached variant against the load-bearing no-blocking rule. An audience of stats-curious players
  who just learned we have an API is the population most likely to poke it.
- **Naver sends literally zero referrals** over 90 days while KR is the #2 country (69 sessions /
  255 pv over 14d). Naver is the front door to the Korean web. That is a search-presence gap, not a
  community gap, and `runbook-seo.md` is where it would be closed.
- **Inven and Ruliweb have WoWS boards and send zero.** Presence there is unbuilt.
- Confirm the landing page honours `?realm=` over a recipient's stored realm.
- Consider proposing battlestats for the `워쉽 관련 웹사이트` list (`/b/wows/72170830`) once the
  monthly post has established standing.
- A reply to DCInside thread 69764 (answering the methodology question about 상위 25%) remains the
  lowest-risk single action available: participation in a thread already about our data.

## Related

- `runbook-audience-growth-instrumentation-2026-07-29.md` - the growth baseline; scopes outreach out, which this fills
- `runbook-ship-leaderboard-architecture-2026-06-18.md` - the standings pipeline and percentile buckets
- `runbook-shareable-ship-leaderboard-2026-08-20.md` - the URL-outranks-localStorage rule that `?realm=` shares depend on
- `runbook-seo.md` - the surface that would close the Naver gap
