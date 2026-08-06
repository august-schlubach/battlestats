"""QA harness for runbook-health-sweep-remediation-2026-08-06.

Each test asserts one factual claim the runbook makes. This file exists to prove the
runbook's claims are true against real code, not to fix anything. Delete it once the
runbook's findings are closed and their real regression tests exist.
"""
import json
import os
import re
from datetime import timedelta
from io import StringIO

import pytest
from django.db.utils import OperationalError

from warships.api.clans import _fetch_clan_membership_for_player
from warships.models import Player


# ---------------------------------------------------------------------------
# F3: the `{"<id>": null}` idiom. The runbook claims .get(key, {}) returns None,
# not {}, when the key is present with a null value.
# ---------------------------------------------------------------------------

def test_f3_python_semantics_get_default_does_not_fire_on_present_null():
    """The runbook's core F3 claim, in isolation from Django."""
    data = {"123": None}
    assert data.get("123", {}) is None, "default must NOT fire for a present-but-null key"
    assert data.get("999", {}) == {}, "default fires only when the key is absent"


def test_f3_proposed_fix_is_correct():
    """The runbook proposes `(data.get(k) or {})`. Prove it handles all four shapes."""
    def fixed(data, player_id):
        return (data.get(str(player_id)) or {}) if data else {}

    assert fixed({"123": None}, 123) == {}      # present-but-null: the bug case
    assert fixed({}, 123) == {}                 # absent
    assert fixed(None, 123) == {}               # no payload at all
    assert fixed({"123": {"clan_id": 7}}, 123) == {"clan_id": 7}   # happy path preserved


def test_f3_membership_fetch_should_return_empty_dict_for_null_payload(monkeypatch):
    """Target behaviour: a `{"<id>": null}` payload must degrade to {}, not None.

    Today this xfails, which is the live proof F3 is unfixed. See the sibling test
    below for the assertion that the bug is *currently* present.
    """
    monkeypatch.setattr(
        "warships.api.clans._make_api_request",
        lambda *a, **kw: {"123": None},
    )
    assert _fetch_clan_membership_for_player(123) == {}


@pytest.mark.parametrize("payload,expected", [
    ({"123": None}, {}),                            # F3: present-but-null
    ({}, {}),                                       # key absent
    (None, {}),                                     # no payload at all
    ({"123": {"clan_id": 7}}, {"clan_id": 7}),      # happy path
])
def test_f3_membership_fetch_payload_shapes(monkeypatch, payload, expected):
    """Every WG payload shape must yield a dict a caller can safely .get() on."""
    monkeypatch.setattr(
        "warships.api.clans._make_api_request", lambda *a, **kw: payload)
    result = _fetch_clan_membership_for_player(123)
    assert result == expected
    result.get("clan_id")   # must never raise -- the production traceback


# ---------------------------------------------------------------------------
# F2: the runbook claims the reclassify buckets are mutually disjoint, which is
# what makes per-bucket commit safe. Test it against the real ORM rather than
# asserting it from reading the filters.
# ---------------------------------------------------------------------------

def _build_plan(realm=None):
    """The production plan itself -- no transcription.

    An earlier revision of this harness re-declared all seven filters by hand,
    which meant the disjointness proof below only covered *the copy*. F2's fix
    extracted `Command.build_plan()`, so the test can now exercise the real thing
    and that whole class of drift is gone.
    """
    from warships.management.commands import reclassify_enrichment_status as r
    base = Player.objects.all()
    if realm:
        base = base.filter(realm=realm)
    return r.Command().build_plan(base, rotation=0)


EXPECTED_BUCKET_ORDER = [
    'enriched', 'empty', 'skipped_hidden', 'skipped_low_battles',
    'skipped_inactive', 'skipped_low_wr', 'pending',
]


def test_f2_documented_bucket_order_is_unchanged():
    """Pin the documented most-specific-first order.

    `build_plan(rotation=0)` returns it verbatim; every other rotation is a cyclic
    shift of it. If a bucket is added, removed or reordered, this fails and the
    disjointness + rotation guarantees below must be re-derived before trusting them.
    """
    from warships.management.commands import reclassify_enrichment_status as r
    plan = r.Command()._plan_in_documented_order(Player.objects.all())
    assert [name for name, _ in plan] == EXPECTED_BUCKET_ORDER


def test_f2_no_shared_transaction_survives_in_handle():
    """F2's fix: buckets must not share one atomic block again.

    A single `transaction.atomic()` wrapping the loop is precisely the defect --
    one bucket's statement timeout discarded all seven. The per-bucket block lives
    inside the loop; guard against a future refactor hoisting it back out.
    """
    import inspect
    from warships.management.commands import reclassify_enrichment_status as r

    # Comments explain the old approach on purpose; only executable lines count.
    code_lines = [
        line for line in inspect.getsource(r.Command.handle).splitlines()
        if line.strip() and not line.strip().startswith('#')
    ]
    code = '\n'.join(code_lines)

    assert 'transaction.set_rollback(True)' not in code, (
        'dry-run must simply not write; write-then-rollback needs the shared block '
        'that F2 removed')
    for line in code_lines:
        if 'with transaction.atomic():' in line:
            indent = len(line) - len(line.lstrip())
            assert indent > 8, (
                'transaction.atomic() appears at handle() top level -- the shared '
                'block F2 removed has been reintroduced')


def test_f2_recent_hours_scoping_is_still_applied():
    """The scoping that makes F2 'marginal' rather than 'a lost filter'.

    If this ever disappears the reclassify becomes a full-catalog scan (~36 min)
    and F2's diagnosis no longer holds.
    """
    import inspect
    from warships.management.commands import reclassify_enrichment_status as r
    src = inspect.getsource(r.Command.handle)
    assert 'last_fetch__gte=cutoff' in src
    assert 'recent_hours' in src


@pytest.mark.django_db
def test_f2_plan_has_seven_buckets_not_six():
    """The runbook originally said 'six-bucket plan'. Count them."""
    assert len(_build_plan()) == 7
    assert [name for name, _ in _build_plan()] == EXPECTED_BUCKET_ORDER


@pytest.mark.django_db
def test_f2_buckets_are_pairwise_disjoint():
    """Per-bucket commit is only safe if no player can land in two buckets.

    Populate one player per bucket plus the awkward NULL cases, then assert every
    pair of bucket querysets has an empty intersection.
    """
    import warships.management.commands.reclassify_enrichment_status as r
    lo_b = r.MIN_PVP_BATTLES - 1
    hi_b = r.MIN_PVP_BATTLES + 10
    stale = r.MAX_INACTIVE_DAYS + 5
    fresh = max(r.MAX_INACTIVE_DAYS - 1, 0)

    seq = iter(range(9000001, 9000100))
    mk = lambda **kw: Player.objects.create(realm='na', player_id=next(seq), **kw)
    mk(name='p_enriched', battles_json=[{'a': 1}])
    mk(name='p_empty', battles_json=[])
    mk(name='p_hidden', battles_json=None, is_hidden=True)
    mk(name='p_lowbat', battles_json=None, is_hidden=False, pvp_battles=lo_b)
    mk(name='p_inactive', battles_json=None, is_hidden=False,
       pvp_battles=hi_b, days_since_last_battle=stale, pvp_ratio=0.60)
    mk(name='p_lowwr', battles_json=None, is_hidden=False,
       pvp_battles=hi_b, days_since_last_battle=fresh, pvp_ratio=r.MIN_WR - 0.05)
    mk(name='p_pending', battles_json=None, is_hidden=False,
       pvp_battles=hi_b, days_since_last_battle=fresh, pvp_ratio=r.MIN_WR + 0.05)
    # The awkward one: pvp_ratio is the only nullable comparison operand.
    # (days_since_last_battle is IntegerField(default=0) -> cannot be NULL.)
    mk(name='p_null_wr', battles_json=None, is_hidden=False,
       pvp_battles=hi_b, days_since_last_battle=fresh, pvp_ratio=None)

    plan = _build_plan()
    sets = {name: set(qs.values_list('id', flat=True)) for name, qs in plan}

    overlaps = []
    names = list(sets)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            both = sets[a] & sets[b]
            if both:
                overlaps.append((a, b, sorted(both)))
    assert not overlaps, f"buckets are NOT disjoint: {overlaps}"


@pytest.mark.django_db
def test_f2_plan_is_disjoint_but_NOT_exhaustive():
    """The gap the runbook did not mention: a NULL pvp_ratio matches no bucket.

    `pvp_ratio` is the plan's only nullable comparison operand (FloatField(null=True));
    `days_since_last_battle` is IntegerField(default=0) and cannot be NULL, so only the
    win-rate split can strand a row. Neither `pvp_ratio__lt` nor `pvp_ratio__gte` is true
    for NULL, so such a player falls into NO bucket and reclassify never corrects them --
    independent of the F2 timeout.
    """
    import warships.management.commands.reclassify_enrichment_status as r
    hi_b = r.MIN_PVP_BATTLES + 10

    orphan_wr = Player.objects.create(
        realm='na', player_id=9100002, name='p_null_wr', battles_json=None, is_hidden=False,
        pvp_battles=hi_b, days_since_last_battle=1, pvp_ratio=None)

    covered = set()
    for _name, qs in _build_plan():
        covered |= set(qs.values_list('id', flat=True))

    assert orphan_wr.id not in covered, "a NULL pvp_ratio should match no bucket"


# ---------------------------------------------------------------------------
# F1: the runbook claims the WG client has no response cache, so every
# _fetch_ship_info miss is a real network call.
# ---------------------------------------------------------------------------

def test_f1_client_has_no_response_cache():
    """Assert by source inspection that _request_api_payload never consults a cache."""
    import inspect
    from warships.api import client
    src = inspect.getsource(client._request_api_payload)
    assert 'cache.get' not in src, "runbook claims there is no response cache"
    assert 'cache.set' not in src, "runbook claims nothing is cached on the way out"
    assert 'session.get' in src or '.get(' in src, "should perform a real HTTP GET"


def _count_upstream_calls_for_null_ship(monkeypatch, attempts=3):
    """Drive _fetch_ship_info N times against a `{"<id>": null}` payload."""
    from django.core.cache import cache
    from warships.api import ships

    calls = {'n': 0}

    def fake_request(endpoint, params, realm=ships.DEFAULT_REALM):
        calls['n'] += 1
        return {str(params['ship_id']): None}

    monkeypatch.setattr(ships, '_make_api_request', fake_request)
    cache.clear()

    ship_id = 4183209776
    for _ in range(attempts):
        assert ships._fetch_ship_info(str(ship_id)) is None, (
            "callers must keep seeing None regardless of caching"
        )
    return calls['n'], ship_id


@pytest.mark.django_db
def test_f1_null_ship_should_hit_upstream_only_once(monkeypatch):
    """Target behaviour: 3 lookups of an unresolvable ship => 1 upstream call."""
    n_calls, _ = _count_upstream_calls_for_null_ship(monkeypatch)
    assert n_calls == 1


@pytest.mark.django_db
def test_f1_negative_cache_uses_a_key_the_positive_path_cannot_delete(monkeypatch):
    """The sentinel must NOT live under `ship:<id>`.

    That key holds a Ship instance and is fed to `_ship_cache_is_complete()`, which
    would reject a sentinel and then `cache.delete()` it -- destroying the negative
    cache on the very next call and restoring the loop.
    """
    from django.core.cache import cache
    from warships.api import ships

    _, ship_id = _count_upstream_calls_for_null_ship(monkeypatch, attempts=1)

    assert cache.get(ships._unresolvable_cache_key(ship_id)), (
        "the unresolvable sentinel should be set")
    assert cache.get(f'ship:{ship_id}') is None, (
        "the sentinel must not occupy the positive Ship cache key")


@pytest.mark.django_db
def test_f1_negative_cache_expires_so_a_later_wows_patch_can_heal(monkeypatch):
    """A ship WG starts publishing later must resolve once the sentinel expires."""
    from django.core.cache import cache
    from warships.api import ships

    assert ships.SHIP_UNRESOLVABLE_CACHE_SECONDS > 0, "must not cache forever"

    _, ship_id = _count_upstream_calls_for_null_ship(monkeypatch, attempts=1)
    cache.delete(ships._unresolvable_cache_key(ship_id))   # simulate expiry

    monkeypatch.setattr(ships, '_make_api_request', lambda endpoint, params, realm=None: {
        str(params['ship_id']): {
            'name': 'Test Ship', 'type': 'Cruiser', 'tier': 10, 'nation': 'usa',
        },
    })
    resolved = ships._fetch_ship_info(str(ship_id))
    assert resolved is not None and resolved.name == 'Test Ship'


@pytest.mark.django_db
def test_f1_catalog_sync_clears_the_negative_cache(monkeypatch):
    """`sync_ship_catalog` already invalidates `ship:<id>`; it must clear the
    unresolvable sentinel too, or a ship the sync just learned about stays
    unresolvable until the TTL lapses."""
    from django.core.cache import cache
    from warships.api import ships

    _, ship_id = _count_upstream_calls_for_null_ship(monkeypatch, attempts=1)
    assert cache.get(ships._unresolvable_cache_key(ship_id))

    page = {
        'status': 'ok',
        'data': {str(ship_id): {
            'ship_id': ship_id, 'name': 'Now Published', 'nation': 'usa',
            'is_premium': False, 'type': 'Cruiser', 'tier': 10,
        }},
        'meta': {'page_total': 1},
    }
    monkeypatch.setattr(ships, 'make_api_request_with_meta',
                        lambda *a, **kw: page)
    ships.sync_ship_catalog()

    assert cache.get(ships._unresolvable_cache_key(ship_id)) is None, (
        "catalog sync must clear the negative cache for ids it just published")


# ---------------------------------------------------------------------------
# F6: the /api/fetch/* routes take <str:player_id> and hand it straight to a
# numeric ORM filter, so a name or the literal "None" escapes as a 500.
# ---------------------------------------------------------------------------

# The 7 endpoints declared with a player-id path segment in battlestats/urls.py.
FETCH_ENDPOINTS = [
    'activity_data',
    'player_clan_battle_seasons',
    'player_summary',
    'randoms_data',
    'ranked_data',
    'tier_data',
    'type_data',
]

# Observed in production: a player name, and a stringified null.
BAD_PLAYER_IDS = ['Detralon', 'None']


@pytest.mark.django_db
@pytest.mark.parametrize('endpoint', FETCH_ENDPOINTS)
@pytest.mark.parametrize('bad_id', BAD_PLAYER_IDS)
def test_f6_fetch_routes_reject_non_numeric_player_id(client, endpoint, bad_id):
    """A non-numeric player id must never produce a 5xx.

    Production saw `ValueError: Field 'player_id' expected a number but got
    'Detralon'` escape as an unhandled 500 across every one of these endpoints at
    once (one bad id breaks the whole player page, not one chart).
    """
    client.raise_request_exception = False
    response = client.get(f'/api/fetch/{endpoint}/{bad_id}/?realm=na')
    assert response.status_code < 500, (
        f'/api/fetch/{endpoint}/{bad_id}/ returned {response.status_code}; '
        'a non-numeric player id must be rejected at the boundary, not 500'
    )


@pytest.mark.django_db
@pytest.mark.parametrize('endpoint', FETCH_ENDPOINTS)
def test_f6_fetch_routes_still_accept_a_numeric_player_id(client, endpoint):
    """The guard must not break the legitimate numeric path."""
    client.raise_request_exception = False
    response = client.get(f'/api/fetch/{endpoint}/1000270433/?realm=na')
    assert response.status_code < 500, (
        f'/api/fetch/{endpoint}/ regressed for a valid numeric id: '
        f'{response.status_code}'
    )


@pytest.mark.django_db
@pytest.mark.parametrize('bad_id', BAD_PLAYER_IDS)
def test_f6_player_correlation_route_rejects_non_numeric_player_id(client, bad_id):
    """player_correlation carries the same <player_id> segment as the other seven.

    It was never observed 500ing in the sampled window, but it is the same defect
    class, so it is fixed and covered alongside them.
    """
    client.raise_request_exception = False
    response = client.get(
        f'/api/fetch/player_correlation/ranked_wr_battles/{bad_id}/?realm=na')
    assert response.status_code < 500, (
        f'player_correlation returned {response.status_code} for {bad_id!r}')


@pytest.mark.django_db
def test_f6_player_correlation_route_still_serves_the_metric_only_form(client):
    """The optional-player_id form must keep working after the converter change."""
    client.raise_request_exception = False
    response = client.get(
        '/api/fetch/player_correlation/win_rate_survival/?realm=na')
    assert response.status_code < 500


# ---------------------------------------------------------------------------
# F2: all seven buckets share one transaction.atomic(), so a statement timeout on
# any single bucket rolls back the whole pass -- eu/asia got zero drift rescue.
# ---------------------------------------------------------------------------

def _mk_players():
    """One player per drift-relevant bucket, all misclassified as 'pending'."""
    import warships.management.commands.reclassify_enrichment_status as r
    hi_b = r.MIN_PVP_BATTLES + 10
    seq = iter(range(9200001, 9200099))

    def mk(name, **kw):
        return Player.objects.create(
            realm='na', player_id=next(seq), name=name,
            enrichment_status='pending', **kw)

    return {
        'enriched': mk('b_enriched', battles_json=[{'a': 1}]),
        'empty': mk('b_empty', battles_json=[]),
        'skipped_hidden': mk('b_hidden', battles_json=None, is_hidden=True),
        'skipped_low_battles': mk('b_lowbat', battles_json=None, is_hidden=False,
                                  pvp_battles=r.MIN_PVP_BATTLES - 1),
        'skipped_inactive': mk('b_inactive', battles_json=None, is_hidden=False,
                               pvp_battles=hi_b,
                               days_since_last_battle=r.MAX_INACTIVE_DAYS + 5,
                               pvp_ratio=0.60),
        'skipped_low_wr': mk('b_lowwr', battles_json=None, is_hidden=False,
                             pvp_battles=hi_b, days_since_last_battle=1,
                             pvp_ratio=r.MIN_WR - 0.05),
    }


@pytest.mark.django_db
def test_f2_a_failing_bucket_does_not_roll_back_the_earlier_ones(monkeypatch):
    """The core F2 defect: one slow bucket must not discard the whole pass.

    Production saw a statement timeout on a single bucket abort all seven, so eu and
    asia received zero reclassification every day.
    """
    from django.core.management import call_command
    from django.db.models.query import QuerySet

    players = _mk_players()
    real_update = QuerySet.update

    def exploding_update(self, **kwargs):
        if kwargs.get('enrichment_status') == 'skipped_low_wr':
            raise OperationalError('canceling statement due to statement timeout')
        return real_update(self, **kwargs)

    monkeypatch.setattr(QuerySet, 'update', exploding_update)

    out = StringIO()
    call_command('reclassify_enrichment_status', '--realm', 'na', stdout=out)

    players['enriched'].refresh_from_db()
    players['empty'].refresh_from_db()
    players['skipped_hidden'].refresh_from_db()
    assert players['enriched'].enrichment_status == 'enriched', (
        'buckets that completed before the failure must be retained')
    assert players['empty'].enrichment_status == 'empty'
    assert players['skipped_hidden'].enrichment_status == 'skipped_hidden'


@pytest.mark.django_db
def test_f2_a_failing_bucket_does_not_block_the_later_ones(monkeypatch):
    """A timeout on one bucket must not starve the buckets after it."""
    from django.core.management import call_command
    from django.db.models.query import QuerySet

    players = _mk_players()
    real_update = QuerySet.update

    def exploding_update(self, **kwargs):
        if kwargs.get('enrichment_status') == 'skipped_hidden':
            raise OperationalError('canceling statement due to statement timeout')
        return real_update(self, **kwargs)

    monkeypatch.setattr(QuerySet, 'update', exploding_update)

    call_command('reclassify_enrichment_status', '--realm', 'na', stdout=StringIO())

    players['skipped_low_wr'].refresh_from_db()
    assert players['skipped_low_wr'].enrichment_status == 'skipped_low_wr', (
        'buckets after the failing one must still run')


@pytest.mark.django_db
def test_f2_failed_buckets_are_reported_not_swallowed(monkeypatch):
    """A partial pass must say which buckets failed."""
    from django.core.management import call_command
    from django.db.models.query import QuerySet

    _mk_players()
    real_update = QuerySet.update

    def exploding_update(self, **kwargs):
        if kwargs.get('enrichment_status') == 'skipped_low_wr':
            raise OperationalError('canceling statement due to statement timeout')
        return real_update(self, **kwargs)

    monkeypatch.setattr(QuerySet, 'update', exploding_update)

    out = StringIO()
    call_command('reclassify_enrichment_status', '--realm', 'na', stdout=out)
    assert 'skipped_low_wr' in out.getvalue()
    assert 'FAILED' in out.getvalue().upper()


@pytest.mark.django_db
def test_f2_dry_run_writes_nothing_without_relying_on_rollback():
    """Dry-run must simply not write, rather than write-then-set_rollback.

    Per-bucket commit removes the shared atomic block that made the old
    `transaction.set_rollback(True)` approach work.
    """
    from django.core.management import call_command

    players = _mk_players()
    out = StringIO()
    call_command('reclassify_enrichment_status', '--realm', 'na',
                 '--dry-run', stdout=out)

    for player in players.values():
        player.refresh_from_db()
        assert player.enrichment_status == 'pending', (
            'dry-run must not mutate any row')
    assert 'Would update' in out.getvalue()


@pytest.mark.django_db
def test_f2_elapsed_budget_stops_dispatching_further_buckets():
    """Per-bucket commit removes the fail-fast, so the pass needs its own bound.

    Without one a pathological pass could run 7x the per-statement cap. An
    exhausted budget must stop cleanly and report, not run to the Celery hard limit.
    """
    from django.core.management import call_command

    players = _mk_players()
    out = StringIO()
    # A zero budget means "already expired": nothing should be dispatched.
    call_command('reclassify_enrichment_status', '--realm', 'na',
                 '--budget-seconds', '-1', stdout=out)

    for player in players.values():
        player.refresh_from_db()
        assert player.enrichment_status == 'pending'
    assert 'budget' in out.getvalue().lower()


@pytest.mark.django_db
def test_f2_task_reports_partial_when_a_bucket_fails(monkeypatch):
    """The task must not report a clean pass when buckets were lost.

    It already logged the traceback via `logger.exception`, but it returned a plain
    error dict and Celery recorded the task as *succeeded* -- so nothing surfaced.
    With per-bucket commit the honest outcome is 'partial': some buckets applied.
    """
    from django.db.models.query import QuerySet
    from warships.tasks import enrichment_reclassify_drift_task

    _mk_players()
    real_update = QuerySet.update

    def exploding_update(self, **kwargs):
        if kwargs.get('enrichment_status') == 'skipped_low_wr':
            raise OperationalError('canceling statement due to statement timeout')
        return real_update(self, **kwargs)

    monkeypatch.setattr(QuerySet, 'update', exploding_update)

    result = enrichment_reclassify_drift_task.apply(args=['na']).get()
    assert result['status'] == 'partial', result
    assert 'skipped_low_wr' in result.get('failed_buckets', [])


@pytest.mark.django_db
def test_f2_task_reports_ok_when_every_bucket_lands():
    """A clean pass must still report ok."""
    from warships.tasks import enrichment_reclassify_drift_task

    _mk_players()
    result = enrichment_reclassify_drift_task.apply(args=['na']).get()
    assert result['status'] == 'ok', result
    assert not result.get('failed_buckets')


def test_f2_budget_fits_inside_the_celery_soft_limit():
    """The pass budget must leave room for one in-flight bucket.

    Ordering that has to hold, or the guard is theatre:
      budget + statement_timeout <= soft_time_limit < time_limit < lock TTL
    The budget is checked BEFORE dispatching a bucket, so a bucket started just
    under the wire still gets a full statement_timeout to finish.
    """
    from warships import tasks

    budget = tasks._reclassify_budget_seconds()
    statement_timeout = int(
        os.getenv('ENRICHMENT_RECLASSIFY_STATEMENT_TIMEOUT', '420'))
    soft = tasks.enrichment_reclassify_drift_task.soft_time_limit
    hard = tasks.enrichment_reclassify_drift_task.time_limit

    assert budget > 0
    assert budget + statement_timeout <= soft, (
        f'budget {budget} + statement timeout {statement_timeout} exceeds the '
        f'soft time limit {soft}: a bucket dispatched at the wire would be killed')
    assert soft < hard <= tasks.ENRICHMENT_RECLASSIFY_LOCK_TIMEOUT, (
        'the lock must outlive the task, or a second run can start mid-pass')


@pytest.mark.django_db
def test_f2_bucket_order_rotates_so_the_budget_cannot_starve_the_tail():
    """A fixed order + a wall-clock budget silently starves the last buckets.

    The budget can only be as large as `soft_limit - statement_timeout - slack`
    (600s), which is *below* the slowest observed pass (~660s). With a fixed order
    the same tail buckets would be dropped every single day and never reclassified
    -- the same class of silent, indefinite data loss F2 exists to fix.

    Rotating the start point is safe precisely because the buckets are pairwise
    disjoint (see test_f2_buckets_are_pairwise_disjoint): order cannot change the
    final classification, only which buckets a truncated pass reaches.
    """
    from warships.management.commands import reclassify_enrichment_status as r

    orders = {
        tuple(name for name, _ in r.Command().build_plan(
            Player.objects.all(), rotation=day))
        for day in range(len(EXPECTED_BUCKET_ORDER))
    }
    assert len(orders) == len(EXPECTED_BUCKET_ORDER), (
        'each rotation must yield a distinct order')

    # Every bucket must occupy first position exactly once across a full cycle.
    firsts = {
        r.Command().build_plan(Player.objects.all(), rotation=day)[0][0]
        for day in range(len(EXPECTED_BUCKET_ORDER))
    }
    assert firsts == set(EXPECTED_BUCKET_ORDER), (
        f'over one cycle every bucket should lead once; got {firsts}')


@pytest.mark.django_db
def test_f2_rotation_does_not_change_the_final_classification():
    """Whatever the rotation, a complete pass must classify identically."""
    from django.core.management import call_command

    expected = {}
    for rotation in range(len(EXPECTED_BUCKET_ORDER)):
        Player.objects.all().delete()
        players = _mk_players()
        call_command('reclassify_enrichment_status', '--realm', 'na',
                     '--rotation', str(rotation), stdout=StringIO())
        got = {
            name: Player.objects.get(pk=p.pk).enrichment_status
            for name, p in players.items()
        }
        if not expected:
            expected = got
        assert got == expected, f'rotation {rotation} classified differently'
        # and it must be correct, not merely stable
        for bucket_name in got:
            assert got[bucket_name] == bucket_name


# ---------------------------------------------------------------------------
# F4: SNAPSHOT_DELTA_GATE_ENABLED (2026-07-20) stopped writing a Snapshot row for
# players whose PvP stats did not move -- which is exactly the `non_pvp_active`
# population. The gap_1d classifier needs a today-row to classify, so that bucket
# collapsed (18,380 -> 64 overnight) and everything piled into `no_snapshot_pair`.
# The totals never changed: this is an instrument regression, not a data one.
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_f4_gate_skipped_player_classifies_as_non_pvp_active_not_unclassifiable():
    """A player the snapshot engine checked today, with no today-row, is PvP-flat.

    Under the delta gate "no today-row" has two very different meanings:
      * checked today and found unchanged  -> PvP battles flat -> non_pvp_active
      * never checked                      -> genuinely unclassifiable
    `Player.activity_updated_at` separates them: the gate refreshes activity on
    BOTH the written and skipped-unchanged branches, so a same-day value proves
    the player was checked. It is durable DB state, not a cache, so the 04:30Z
    benchmark can still read it for the day being measured.
    """
    from django.core.management import call_command
    from django.utils import timezone as dj_tz
    from warships.models import Snapshot

    today = dj_tz.now().date()
    yesterday = today - timedelta(days=1)

    # Two players, identical except for having been checked today.
    checked = Player.objects.create(
        realm='na', player_id=9300001, name='gate_skipped', is_hidden=False,
        last_battle_date=dj_tz.now(), pvp_battles=1000,
        activity_updated_at=dj_tz.now())
    unchecked = Player.objects.create(
        realm='na', player_id=9300002, name='never_checked', is_hidden=False,
        last_battle_date=dj_tz.now(), pvp_battles=1000,
        activity_updated_at=dj_tz.now() - timedelta(days=9))

    # Both have a prior row and NO today row (the gate skipped the write).
    for p in (checked, unchecked):
        Snapshot.objects.create(player=p, date=yesterday, battles=1000, wins=500)
    # A third player carries the today-date so the benchmark has a snapshot pair.
    anchor = Player.objects.create(
        realm='na', player_id=9300003, name='anchor', is_hidden=False,
        last_battle_date=dj_tz.now(), pvp_battles=10)
    Snapshot.objects.create(player=anchor, date=yesterday, battles=9, wins=4)
    Snapshot.objects.create(player=anchor, date=today, battles=10, wins=5)

    out = StringIO()
    call_command('benchmark_observation_floor', '--json', stdout=out)
    payload = json.loads(out.getvalue())
    gap = payload['realms']['na']['gap_1d']

    assert gap['non_pvp_active'] >= 1, (
        'a gate-skipped player checked today must be classified non_pvp_active, '
        f'not dumped into no_snapshot_pair; got {gap}')
    assert gap['no_snapshot_pair'] >= 1, (
        'a player never checked today is still genuinely unclassifiable')
