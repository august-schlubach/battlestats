#!/usr/bin/env python
"""Generate the monthly Korean ASIA tier-10 roll-up post for arca.live/b/wows.

Run ON THE DROPLET, inside the server checkout:

    cd /opt/battlestats-server/current/server
    set -a; . /opt/battlestats-server/shared/.env; set +a
    /opt/battlestats-server/venv/bin/python manage.py shell \
        -c "exec(open('scripts/monthly_asia_post.py').read())" 2026 8

Reads ShipPopDailyAgg (daily grain, so it cuts by CALENDAR month, unlike the
site's rolling 60-day standings). Retention is max(100, window+15) days, so the
current month and the prior one are always available; anything older is gone.
Archive each month's output if you want a long series.
"""
import sys, calendar, datetime, json
from collections import defaultdict
from django.db.models import Sum, Min
from warships.models import ShipPopDailyAgg, Ship

YEAR = int(sys.argv[-2]) if len(sys.argv) >= 3 else 2026
MONTH = int(sys.argv[-1]) if len(sys.argv) >= 2 else 8
REALM, MODE, TIER = "asia", "random", 10
FLOOR = 5000          # battles in-month required to appear in a ranking table
MOVER_FLOOR = 8000    # battles in BOTH months required for a MoM delta
TOP_N = 3             # rows per ship-type table, and per highlight list (was 5/4 until 2026-09-02)

SITE_URL = f"https://battlestats.online/?realm={REALM}"
# arca.live's own post filter rejects the raw link outright (observed
# 2026-09-02 on the August post attempt: "내용에 금지된 문구가 포함되어
# 있습니다. [.online/]" — a literal-substring match on ".online/"). Bracket
# the dot in anything printed into the post body below; a bare
# "battlestats.online" mention with no trailing slash is unaffected and
# does not need this treatment.
SITE_URL_DISPLAY = f"battlestats[.]online/?realm={REALM}"

KOT = {"Battleship": "전함", "Cruiser": "순양함", "Destroyer": "구축함",
       "AirCarrier": "항공모함", "Submarine": "잠수함"}
KO = {"Sicilia": "시칠리아", "Thor": "토르", "Sete de Setembro": "세치 지 세템브루",
      "Kremlin": "크렘린", "Aki": "아키", "Yamato": "야마토", "Montana": "몬타나",
      "Cristoforo Colombo": "콜롬보", "Shimakaze": "시마카제", "Hildebrand": "힐데브란트",
      "Pioneer": "파이오니어", "Svea": "스베아", "San Martín": "산 마르틴",
      "Minotaur": "미노타우어", "Yoshino": "요시노", "Småland": "스몰란드",
      "Laffey": "라피", "Daring": "데어링", "Châteaurenault": "샤토르노",
      "AL Shimakaze": "AL 시마카제", "Manfred von Richthofen": "리히트호펜",
      "Essex": "에식스", "Audacious": "오다시어스", "Shinano": "시나노",
      "Malta": "몰타", "Archerfish": "아처피시", "Balao": "발라오",
      "Admiral Nakhimov": "아드미랄 나히모프", "Hindenburg": "힌덴부르크", "Bungo": "붕고", "Slava": "슬라바",
      "Shikishima": "시키시마", "Bourgogne": "부르고뉴", "Libertad": "리베르타드",
      "Kearsarge": "키어사지", "Azuma": "아즈마", "Kitakaze": "키타카제",
      "Affondatore": "아폰다토레", "Conqueror": "컨쿼러", "Schlieffen": "슐리펜",
      "Worcester": "우스터", "Venezia": "베네치아", "Gearing": "기어링",
      "Prins van Oranje": "프린스 판 오라녜", "Lüshun B": "뤼순 B",
      "Almirante Irizar": "알미란테 이리사르", "20 de Julio": "20 데 훌리오",
      # Added for the August post. Midway/Hayate/Ohio/Gato are standard,
      # high-confidence transliterations (each is a common class/hull name
      # with established Korean naval-discussion usage). Amiral Lartigue and
      # Cassard are lower-confidence guesses, unattested in the wild same as
      # 세치 지 세템브루 / 프린스 판 오라녜 above — flag both for the
      # native-speaker read before this post goes out (runbook §5 step 3).
      "Midway": "미드웨이", "Hayate": "하야테", "Ohio": "오하이오", "Gato": "가토",
      "Amiral Lartigue": "아미랄 라르티그", "Cassard": "카사르"}

def _norm(n):
    # WG ship names carry NON-BREAKING spaces (e.g. 'San\xa0Martín'); normalise
    # before any lookup or display, or the Korean name silently fails to match.
    return n.replace("\xa0", " ")

def ko(n):
    return KO.get(_norm(n), _norm(n))

def nm(n):
    n = _norm(n)
    k = KO.get(n)
    return f"{k} ({n})" if k and k != n else n

def month_bounds(y, m):
    return datetime.date(y, m, 1), datetime.date(y, m, calendar.monthrange(y, m)[1])

def pull(a, b, ship_ids):
    qs = (ShipPopDailyAgg.objects
          .filter(realm=REALM, mode=MODE, date__gte=a, date__lte=b, ship_id__in=ship_ids)
          .values("ship_id").annotate(bt=Sum("battles"), wn=Sum("wins"),
                                      dm=Sum("damage_sum")))
    return {r["ship_id"]: r for r in qs if r["bt"]}

def covered_days(a, b):
    return len({d for d in ShipPopDailyAgg.objects
                .filter(realm=REALM, mode=MODE, date__gte=a, date__lte=b)
                .values_list("date", flat=True)})

t10 = {s.ship_id: s for s in Ship.objects.filter(tier=TIER)}
a, b = month_bounds(YEAR, MONTH)
pm = (a - datetime.timedelta(days=1)).replace(day=1)
pa, pb = month_bounds(pm.year, pm.month)

cur, prev = pull(a, b, t10), pull(pa, pb, t10)
days, want = covered_days(a, b), (b - a).days + 1
if days != want:
    print(f"### WARNING: only {days}/{want} days present for {YEAR}-{MONTH:02d}. "
          f"Do not publish until the rollup has caught up.\n")

rows = []
for sid, r in cur.items():
    s = t10[sid]
    p = prev.get(sid)
    rows.append(dict(sid=sid, name=s.name, type=s.ship_type, bt=r["bt"],
                     wr=round(r["wn"] / r["bt"] * 100, 2),
                     dmg=int(r["dm"] / r["bt"]),
                     pwr=round(p["wn"] / p["bt"] * 100, 2) if p and p["bt"] >= MOVER_FLOOR else None,
                     pbt=p["bt"] if p else 0))

# Prior-month rank within each ship's type, at the same FLOOR gate used for this
# month's tables — independent of MOVER_FLOOR, which only gates the wr-delta.
# Used for the record-chart-style rank movement column below.
prev_rows = []
for sid, r in prev.items():
    s = t10[sid]
    prev_rows.append(dict(sid=sid, type=s.ship_type,
                          wr=round(r["wn"] / r["bt"] * 100, 2), bt=r["bt"]))
prev_rank = {}
for t in KOT:
    pool = sorted([x for x in prev_rows if x["type"] == t and x["bt"] >= FLOOR], key=lambda x: -x["wr"])
    for i, x in enumerate(pool, 1):
        prev_rank[x["sid"]] = i

# T10 ships whose earliest-ever ship-pop record falls inside this month: our
# best proxy for "entered the game this patch" (verified against known
# releases; floor-crossing veterans do NOT show up here since their earliest
# record predates the month).
first_seen = (ShipPopDailyAgg.objects.filter(realm=REALM, mode=MODE, ship_id__in=t10)
              .values("ship_id").annotate(fs=Min("date")))
new_ships = sorted([f for f in first_seen if a <= f["fs"] <= b], key=lambda f: f["fs"])

tot = sum(r["bt"] for r in rows)
wtd = sum(r["bt"] * r["wr"] for r in rows) / tot
mix = defaultdict(int)
for r in rows:
    mix[r["type"]] += r["bt"]
played = sorted(rows, key=lambda r: -r["bt"])
top = played[0]
bb = sorted([r for r in rows if r["type"] == "Battleship" and r["bt"] >= FLOOR], key=lambda r: -r["wr"])

# The operator posts by hand (never automated — see the runbook). Turn this
# mention into a hyperlink to the realm URL when pasting into arca.live's
# editor; the plain-text output below can't carry that markup itself. If
# arca.live's filter rejects the hyperlink insertion too (it rejects the raw
# link text — see SITE_URL_DISPLAY above), skip the hyperlink for this post;
# a plain-text mention is fine, the bottom line is what needs to carry the URL.
print(f"### NOTE: hyperlink \"battlestats.online\" in the opening line to "
      f"{SITE_URL} when posting to arca.live.\n")

O = []
w = O.append
w(f"제목: {MONTH}월 아시아 공방 10티어 통계 정리 ({tot/10000:.0f}만 전투)")
w("")
w("안녕하세요! battlestats.online 만든 사람입니다. 사이트에 쌓인 데이터로 지난달 아시아 공방을 정리해봤습니다.")
w("숫자는 전부 사이트에서 직접 확인할 수 있고, 가입이나 로그인 같은 건 없습니다.")
w("")
w(f"{MONTH}월 아시아 공방에서 제일 많이 굴러간 10티어는 {ko(top['name'])}였음. "
  f"{top['bt']:,}전투로 함종 관계없이 전체 1위, 2위({ko(played[1]['name'])} {played[1]['bt']:,})와 차이도 큼.")
w(f"근데 승률은 {top['wr']:.2f}%로, {FLOOR:,}전투 이상 10티어 전함 {len(bb)}척 중 {bb.index(top)+1}위임.")
w("")
w("■ 집계 기준")
w(f"· 아시아 / 공방 / 10티어")
if days == want:
    w(f"· 기간: {a.month}월 {a.day}일 ~ {b.month}월 {b.day}일 ({days}일 전부)")
else:
    _seen = sorted({d for d in ShipPopDailyAgg.objects.filter(
        realm=REALM, mode=MODE, date__gte=a, date__lte=b).values_list("date", flat=True)})
    w(f"· 기간: {_seen[0].month}월 {_seen[0].day}일 ~ {_seen[-1].month}월 {_seen[-1].day}일 "
      f"(※ {a.month}월 {want}일 중 {days}일만 집계됨)")
w(f"· 표본: 10티어 총 {tot:,}전투 (필터 없음)")
w(f"· 모집단 가중 평균 승률 {wtd:.2f}%")
w("")
w("■ 함종별 전투 비중")
w(" · ".join(f"{KOT[t]} {v/tot*100:.1f}%" for t, v in sorted(mix.items(), key=lambda x: -x[1])))
w("")
if new_ships:
    w(f"■ {MONTH}월 신규 함선")
    w("이번 달 데이터에 처음 등장한 10티어 함선입니다.")
    w("")
    for f in new_ships:
        sid = f["ship_id"]
        s = t10[sid]
        r = cur.get(sid)
        if not r:
            continue
        wr = round(r["wn"] / r["bt"] * 100, 2)
        note = f" (※ {FLOOR:,}전투 미만 — 표본이 작아서 승률은 지켜봐야 함)" if r["bt"] < FLOOR else ""
        label = nm(s.name)
        # nm() already opens a "(English name)" paren when a KO mapping
        # exists; fold the ship type into that same paren instead of a
        # second back-to-back "(...)  (...)".
        label = f"{label[:-1]} · {KOT[s.ship_type]})" if label.endswith(")") else f"{label} ({KOT[s.ship_type]})"
        w(f"· {label} — {f['fs'].month}월 {f['fs'].day}일 첫 등장, "
          f"{r['bt']:,}전투, 승률 {wr:.2f}%{note}")
    w("")
exc = None
for r in played[:6]:
    pool = sorted([x for x in rows if x["type"] == r["type"] and x["bt"] >= FLOOR],
                  key=lambda x: -x["wr"])
    if r in pool and pool.index(r) < len(pool) / 2:
        exc = (r, pool.index(r) + 1, len(pool))
        break
w(f"■ {ko(top['name'])}만 그런 게 아님")
w("많이 타는 배들이 대체로 승률 하위권에 몰려 있음.")
w("")
shown = 0
for r in played[1:]:
    if shown >= TOP_N or r["wr"] >= wtd:
        continue
    pool = sorted([x for x in rows if x["type"] == r["type"] and x["bt"] >= FLOOR], key=lambda x: -x["wr"])
    tag = f" ({KOT[r['type']]} 중 최하위)" if pool and pool[-1]["name"] == r["name"] else ""
    w(f"· {ko(r['name'])} {r['wr']:.2f}%{tag}, {r['bt']:,}전투")
    shown += 1
w("")
if exc:
    r, rk, n = exc
    w("")
    w(f"많이 타는 배 중에 예외는 {ko(r['name'])} 정도. {r['bt']:,}전투로 많이 굴리면서 "
      f"{KOT[r['type']]} {n}척 중 {rk}위임.")
else:
    w("")
    w("많이 타는 배 중에 승률 상위권인 예외는 이번 달엔 없었음.")
w("")
w(f"■ 함종별 승률 상위 ({MONTH}월, {FLOOR:,}전투 이상)")
w(f"[  ] 안 숫자는 같은 함종 순위표에서 {pm.month}월 대비 순위 변동임. NEW는 {pm.month}월엔 "
  f"이 함종 순위표({FLOOR:,}전투 이상)에 없었다는 뜻이고, 진짜 신규 함선과는 다름.")
w("")
for t, k in KOT.items():
    pool = sorted([r for r in rows if r["type"] == t and r["bt"] >= FLOOR], key=lambda r: -r["wr"])
    if not pool:
        continue
    w(f"[{k} {len(pool)}척]")
    for i, r in enumerate(pool[:TOP_N], 1):
        d = f"  (전월대비 {r['wr']-r['pwr']:+.2f}p)" if r["pwr"] else ""
        pr = prev_rank.get(r["sid"])
        if pr is None:
            mv = "  [NEW]"
        elif pr == i:
            mv = "  [-]"
        elif pr > i:
            mv = f"  [▲{pr - i}]"
        else:
            mv = f"  [▼{i - pr}]"
        w(f"{i}. {nm(r['name'])}  {r['wr']:.2f}%  {r['bt']:,}전투  평딜 {r['dmg']:,}{d}{mv}")
    if pool[-1] not in pool[:TOP_N]:
        w(f"   최하위: {nm(pool[-1]['name'])}  {pool[-1]['wr']:.2f}%  {pool[-1]['bt']:,}전투")
    w("")
mov = [r for r in rows if r["pwr"] and r["bt"] >= MOVER_FLOOR]
for r in mov:
    r["d"] = round(r["wr"] - r["pwr"], 2)
mov.sort(key=lambda r: -r["d"])
if mov:
    w(f"■ {pm.month}월 대비 변화")
    w(f"양쪽 달 다 {MOVER_FLOOR:,}전투 이상인 배 기준입니다.")
    w("오른 쪽: " + " · ".join(f"{ko(r['name'])} {r['d']:+.2f}p" for r in mov[:3]))
    w("내린 쪽: " + " · ".join(f"{ko(r['name'])} {r['d']:+.2f}p" for r in mov[-3:]))
    w("")
w("■ 한계 (읽으실 때 감안해주세요)")
w(f"· 저희가 추적하는 플레이어 풀 기준이라 서버 전체 인구와 완전히 같지는 않습니다. "
  f"가중 평균 승률이 딱 50%가 아니라 {wtd:.2f}%인 것도 그 때문입니다.")
w("· 사이트 순위표는 최근 60일 롤링 기준이라 이 글 숫자와 소수점 단위로 다를 수 있습니다. "
  "이 글은 달력 기준으로 따로 뽑은 겁니다.")
w("")
w("보고 싶은 지표 있으면 말씀해주세요. 8~9티어나 랭겜도 같은 방식으로 뽑을 수 있습니다. "
  "이상해 보이는 숫자 있으면 지적해주시면 확인해보겠습니다.")
w("")
w("사이트 하단의 '피드백 남기기' 링크로도 의견 남기실 수 있습니다.")
w("")
w(f"원본 데이터: {SITE_URL_DISPLAY} (대괄호 지우고 접속해주세요)")
print("\n".join(O))
