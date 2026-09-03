"""Read-only spike: recompute the ship top-player board in memory for two
trailing windows (same anchor = today, live env thresholds) and diff them.

Writes nothing. Run on the droplet via `manage.py shell` (argv is not usable
under `shell < file`, so the windows come from env):

    ssh root@battlestats.online 'cd /opt/battlestats-server/current/server \
      && set -a && . /etc/battlestats-server.env && . /etc/battlestats-server.secrets.env && set +a \
      && SPIKE_WINDOWS=60,90 /opt/battlestats-server/venv/bin/python manage.py shell' \
      < server/scripts/spike_ship_board_window.py 2>&1 | grep --line-buffered -v "Loading environment"

Cost: one BattleEvent group-aggregate per (realm, window), ~1-3.5 min each on
the 2-vCPU managed PG (2026-09-03: na 171s/201s, eu 154s/159s, asia 67s/124s
for 60/75). Realms run sequentially. See
agents/runbooks/runbook-ship-standings-75d-spike-2026-09-03.md for the readout.
"""
import os
import statistics as st
import time
from datetime import timedelta

from django.db import transaction
from django.db.models import Case, IntegerField, Sum, When
from django.utils import timezone as tz

from warships.data import (SHIP_LEADERBOARD_WINDOW_DAYS, _elevated_work_mem,
                           _pool_zscores, _season_window_datetimes,
                           compute_realm_top_ships)
from warships.models import BattleEvent, Ship, ShipTopPlayerSnapshot

WINDOWS = [int(x) for x in os.getenv('SPIKE_WINDOWS', '60,75').split(',')]
REALMS = os.getenv('SPIKE_REALMS', 'na,eu,asia').split(',')
A, B = WINDOWS[0], WINDOWS[1]

min_battles = int(os.getenv('SHIP_BADGE_MIN_BATTLES', '15'))
min_pop = int(os.getenv('SHIP_BADGE_MIN_SHIP_POPULATION', '20'))
min_pop_cv = int(os.getenv('SHIP_BADGE_MIN_SHIP_POPULATION_CV', '10'))
min_pop_sub = int(os.getenv('SHIP_BADGE_MIN_SHIP_POPULATION_SUB', '12'))
list_size = int(os.getenv('SHIP_BADGE_LIST_SIZE', '15'))
prior_b = int(os.getenv('SHIP_BADGE_PRIOR_BATTLES', '50'))
prior_wr = float(os.getenv('SHIP_BADGE_PRIOR_WR', '0.5'))
w_w = float(os.getenv('SHIP_BADGE_WEIGHT_WINS', '0.6'))
w_d = float(os.getenv('SHIP_BADGE_WEIGHT_DAMAGE', '0.25'))
w_k = float(os.getenv('SHIP_BADGE_WEIGHT_KILLS', '0.15'))
min_wr = float(os.getenv('SHIP_BADGE_MIN_WIN_RATE', '50'))
_t = os.getenv('SHIP_BADGE_TIERS') or os.getenv('SHIP_BADGE_TIER', '10')
tiers = sorted({int(x) for x in _t.split(',') if x.strip()})
print(f"ENV live_window={SHIP_LEADERBOARD_WINDOW_DAYS} compare={A}d vs {B}d min_battles={min_battles} "
      f"pop={min_pop}/{min_pop_cv}/{min_pop_sub} tiers={tiers} prior={prior_b}@{prior_wr} "
      f"w={w_w}/{w_d}/{w_k} min_wr={min_wr}", flush=True)

today = tz.now().date()


def board(realm, days, target_ids, meta):
    """Mirror of compute_ship_top_player_snapshot's ranking, minus the writes."""
    since, until = _season_window_datetimes(today - timedelta(days=days), today)
    agg = (BattleEvent.objects
           .filter(ship_id__in=target_ids, mode='random',
                   detected_at__gte=since, detected_at__lt=until,
                   player__realm=realm, player__is_hidden=False)
           .values('ship_id', 'player_id')
           .annotate(battles=Sum('battles_delta'), wins=Sum('wins_delta'),
                     damage=Sum('damage_delta'), frags=Sum('frags_delta'))
           .filter(battles__gte=min_battles))
    t0 = time.time()
    with transaction.atomic(), _elevated_work_mem():
        rows = list(agg)
    elapsed = time.time() - t0
    by = {}
    for r in rows:
        by.setdefault(r['ship_id'], []).append(r)
    out, pools = {}, {}
    for sid, pool in by.items():
        stype = meta.get(sid, (None, None, None))[2]
        floor = min_pop_cv if stype == 'AirCarrier' else (min_pop_sub if stype == 'Submarine' else min_pop)
        pools[sid] = (len(pool), floor)
        if len(pool) < floor:
            continue
        pb = sum(e['battles'] or 0 for e in pool)
        mdpb = sum(e['damage'] or 0 for e in pool) / pb if pb else 0.0
        mkpb = sum(e['frags'] or 0 for e in pool) / pb if pb else 0.0
        for e in pool:
            b = e['battles'] or 0
            w = e['wins'] or 0
            e['wr'] = 100.0 * w / b if b else 0.0
            d = b + prior_b
            e['_wr'] = (w + prior_b * prior_wr) / d
            e['_d'] = ((e['damage'] or 0) + prior_b * mdpb) / d
            e['_k'] = ((e['frags'] or 0) + prior_b * mkpb) / d
        zw = _pool_zscores([e['_wr'] for e in pool])
        zd = _pool_zscores([e['_d'] for e in pool])
        zk = _pool_zscores([e['_k'] for e in pool])
        for e, a, b_, c in zip(pool, zw, zd, zk):
            e['_s'] = w_w * a + w_d * b_ + w_k * c
        pool.sort(key=lambda e: (-e['_s'], -(e['battles'] or 0)))
        ranked = [e for e in pool if e['wr'] >= min_wr] if min_wr > 0 else pool
        out[sid] = [(e['player_id'], e['battles'], round(e['wr'], 1)) for e in ranked[:list_size]]
    return out, pools, elapsed, len(rows)


def med(xs):
    return round(st.median(xs), 1) if xs else None


for realm in REALMS:
    # Data-depth probe: indexed exists(), NOT Min(detected_at) (a ~8 min scan).
    covers = BattleEvent.objects.filter(
        detected_at__lt=_season_window_datetimes(today - timedelta(days=B - 1), today)[0]).exists()
    live = (ShipTopPlayerSnapshot.objects.filter(realm=realm)
            .order_by('-captured_on').values_list('captured_on', flat=True).first())
    live_ships = (ShipTopPlayerSnapshot.objects.filter(realm=realm, captured_on=live)
                  .values('ship_id').distinct().count() if live else 0)
    target = set(Ship.objects.filter(tier__in=tiers).values_list('ship_id', flat=True))
    try:
        target |= {s['ship_id'] for s in compute_realm_top_ships(realm, limit=25, mode='random').get('ships', [])}
    except Exception as ex:  # best-effort union, same as the compute path
        print(f"  treemap union failed: {ex!r}")
    meta = {s.ship_id: (s.name, s.tier, s.ship_type) for s in Ship.objects.filter(ship_id__in=target)}
    print(f"\n=== {realm} today={today} events_reach_{B}d={'YES' if covers else 'NO'} "
          f"live_snapshot={live} live_ships_ranked={live_ships} targets={len(target)}", flush=True)
    bA, pA, eA, nA = board(realm, A, list(target), meta)
    bB, pB, eB, nB = board(realm, B, list(target), meta)
    print(f"  agg_cost {A}d={eA:.1f}s ({nA} qualifying player-ship rows)  {B}d={eB:.1f}s ({nB} rows)")
    qA, qB = set(bA), set(bB)
    print(f"  ships_ranked {A}d={len(qA)}  {B}d={len(qB)}  new={len(qB - qA)}  lost={len(qA - qB)}")

    def by_key(ids, idx):
        c = {}
        for s in ids:
            k = meta.get(s, (None, None, '?'))[idx]
            c[k] = c.get(k, 0) + 1
        return dict(sorted(c.items(), key=lambda kv: str(kv[0])))
    print(f"  by_class {A}d={by_key(qA, 2)}  {B}d={by_key(qB, 2)}")
    print(f"  by_tier  {A}d={by_key(qA, 1)}  {B}d={by_key(qB, 1)}")
    new = sorted(qB - qA, key=lambda s: (meta[s][1] or 0, meta[s][0]))
    print(f"  newly_ranked_at_{B}d: " + ", ".join(
        f"{meta[s][0]}(T{meta[s][1]} {meta[s][2][:3]} pool {pA.get(s, (0, 0))[0]}->{pB[s][0]}/{pB[s][1]})" for s in new))
    print(f"  marginal_ships(pool<=floor+3) {A}d={sum(1 for s in qA if pA[s][0] - pA[s][1] <= 3)}  "
          f"{B}d={sum(1 for s in qB if pB[s][0] - pB[s][1] <= 3)}")
    both = qA & qB
    same1 = sum(1 for s in both if bA[s] and bB[s] and bA[s][0][0] == bB[s][0][0])
    same3 = sum(1 for s in both if {x[0] for x in bA[s][:3]} == {x[0] for x in bB[s][:3]})
    jac = [len({x[0] for x in bA[s]} & {x[0] for x in bB[s]}) / max(1, len({x[0] for x in bA[s]} | {x[0] for x in bB[s]}))
           for s in both]
    top3 = [len({x[0] for x in bA[s][:3]} & {x[0] for x in bB[s][:3]}) for s in both]
    print(f"  ships_in_both={len(both)}  same_#1={same1} ({100 * same1 / max(1, len(both)):.0f}%)  "
          f"same_top3_set={same3} ({100 * same3 / max(1, len(both)):.0f}%)  "
          f"top3_overlap_mean={st.mean(top3) if top3 else 0:.2f}/3  top15_jaccard_median={med(jac)}")
    r1A = [bA[s][0][1] for s in both if bA[s]]
    r1B = [bB[s][0][1] for s in both if bB[s]]
    rowsA = [x[1] for s in both for x in bA[s]]
    rowsB = [x[1] for s in both for x in bB[s]]
    print(f"  #1_battles median {A}d={med(r1A)} {B}d={med(r1B)} | min {A}d={min(r1A) if r1A else None} {B}d={min(r1B) if r1B else None}")
    print(f"  ranked_row_battles median {A}d={med(rowsA)} {B}d={med(rowsB)} | rows_within_5_of_floor "
          f"{A}d={sum(1 for b in rowsA if b < min_battles + 5)}/{len(rowsA)} "
          f"{B}d={sum(1 for b in rowsB if b < min_battles + 5)}/{len(rowsB)}")
    print(f"  pool_size median {A}d={med([pA[s][0] for s in both])} {B}d={med([pB[s][0] for s in both])}  "
          f"ranked_rows_total {A}d={sum(len(bA[s]) for s in qA)} {B}d={sum(len(bB[s]) for s in qB)}")
    print(f"  short_boards(<{list_size} rows) {A}d={sum(1 for s in qA if len(bA[s]) < list_size)} "
          f"{B}d={sum(1 for s in qB if len(bB[s]) < list_size)}")
    chg = [s for s in both if bA[s] and bB[s] and bA[s][0][0] != bB[s][0][0] and meta[s][1] in tiers]
    print(f"  #1_changed(badge tiers)={len(chg)}: " + ", ".join(
        f"{meta[s][0]}(T{meta[s][1]}: {bA[s][0][1]}b/{bA[s][0][2]}% -> {bB[s][0][1]}b/{bB[s][0][2]}%)" for s in chg[:40]))
print("\nDONE", flush=True)
