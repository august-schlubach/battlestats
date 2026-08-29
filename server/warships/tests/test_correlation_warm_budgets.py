"""Tests for the correlation warmers' queue, lock scope and budgets.

`warm_player_ranked_wr_battles_correlation_task` warms ONE correlation and
nothing else, yet carried `TASK_OPTS` (540s soft / 600s hard). Measured on the
production journal over 72h to 2026-08-26 it needs **389-500s** on every realm,
so it soft-limited on roughly two thirds of runs: `eu` 1/8, `asia` 1/3, `na` 2/4.
That is a mis-sized budget for irreducible work, not a packing defect -- the
opposite call from `startup_warm_caches_task`, which was twelve separable
operations and was split instead.

Two defects found in QA ride along:
  * both per-metric tasks locked on the literal string `"population"`, so the
    lock key was identical for every realm and the warms were globally
    serialized -- a bigger budget would have made two of three realms skip;
  * `warm_player_clan_battle_wr_battles_correlation_task` was unrouted, so it
    landed on `default` alongside crawl dispatchers and request-adjacent work,
    while its ranked sibling was correctly on `background`.

Runbook: agents/runbooks/runbook-correlation-warm-budget-and-per-realm-alerting-2026-08-26.md
"""

from django.conf import settings
from django.test import TestCase


class CorrelationWarmRoutingTests(TestCase):
    def test_both_per_metric_correlation_warmers_route_to_background(self):
        # Pinned as a SET so they cannot drift apart again: the ranked one was
        # routed and the clan-battle one was not, which is the same defect class
        # as test_ship_standings_warm_chain_routes_to_background. The wr-survival
        # task joined on 2026-08-28 when the combined warmer was split; a new
        # member of this trio arriving unrouted would reproduce the 2026-08-26
        # defect exactly.
        routes = settings.CELERY_TASK_ROUTES
        for task in (
            "warships.tasks.warm_player_ranked_wr_battles_correlation_task",
            "warships.tasks.warm_player_clan_battle_wr_battles_correlation_task",
            "warships.tasks.warm_player_wr_survival_correlation_task",
        ):
            self.assertEqual(
                routes.get(task, {}).get("queue"), "background",
                f"{task} must warm on the background pool, not `default`")


class CorrelationWarmBudgetTests(TestCase):
    """The invariant is the contract; the numbers alone prove nothing."""

    def test_per_metric_budget_fits_under_its_lock_ttl(self):
        # soft < hard <= lock TTL. A budget that outlives its lock lets a second
        # invocation start on top of a live one. Mirrors
        # test_lock_outlives_the_hard_time_limit in the top-ships suite.
        #
        # The comparand is CORRELATION_METRIC_WARM_LOCK_TIMEOUT, not
        # RESOURCE_TASK_LOCK_TIMEOUT: since 2026-08-29 the hard limit (1200s)
        # deliberately exceeds `_run_locked_task`'s 900s DEFAULT, which is why
        # these three tasks pass an explicit longer TTL. The pairing below is the
        # thing that makes that safe.
        from warships.tasks import (
            CORRELATION_METRIC_WARM_LOCK_TIMEOUT,
            CORRELATION_METRIC_WARM_TASK_OPTS,
        )
        soft = CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"]
        hard = CORRELATION_METRIC_WARM_TASK_OPTS["time_limit"]
        self.assertLess(soft, hard)
        self.assertLessEqual(hard, CORRELATION_METRIC_WARM_LOCK_TIMEOUT)

    def test_each_metric_task_passes_the_longer_lock_ttl(self):
        """THE LOAD-BEARING ONE for the 2026-08-29 budget raise.

        `_run_locked_task` defaults to RESOURCE_TASK_LOCK_TIMEOUT (900s). These
        tasks may now run 1200s. A task that forgets the explicit
        `lock_timeout=` releases its gate 300s before it finishes, and the
        on-view dispatch path can start a SECOND 20-minute eu aggregation on the
        3-slot background pool -- the duplicate-warm class the realm-scoped lock
        was introduced to remove on 2026-08-26.
        """
        import inspect
        from warships import tasks

        for name in (
            "warm_player_ranked_wr_battles_correlation_task",
            "warm_player_clan_battle_wr_battles_correlation_task",
            "warm_player_wr_survival_correlation_task",
        ):
            source = inspect.getsource(getattr(tasks, name))
            self.assertIn(
                "lock_timeout=CORRELATION_METRIC_WARM_LOCK_TIMEOUT", source,
                f"{name} runs longer than _run_locked_task's default TTL and "
                "must pass its own")

    def test_run_locked_task_defaults_to_the_resource_ttl(self):
        # The new parameter must not have moved the default for the ~20 other
        # callers that never pass one.
        import inspect
        from warships.tasks import _run_locked_task, RESOURCE_TASK_LOCK_TIMEOUT

        default = inspect.signature(_run_locked_task).parameters["lock_timeout"].default
        self.assertIsNone(default)
        self.assertEqual(RESOURCE_TASK_LOCK_TIMEOUT, 15 * 60)

    def test_on_view_dispatch_dedup_outlives_the_hard_limit(self):
        # The task clears these keys in its `finally`, so the TTL is only the
        # safety net -- but a net shorter than the run it guards lets a second
        # enqueue land mid-aggregation.
        from warships.tasks import (
            CORRELATION_METRIC_WARM_TASK_OPTS,
            PLAYER_CLAN_BATTLE_WR_BATTLES_CORRELATION_REFRESH_DISPATCH_TIMEOUT,
            PLAYER_RANKED_WR_BATTLES_CORRELATION_REFRESH_DISPATCH_TIMEOUT,
        )
        hard = CORRELATION_METRIC_WARM_TASK_OPTS["time_limit"]
        for ttl in (
            PLAYER_RANKED_WR_BATTLES_CORRELATION_REFRESH_DISPATCH_TIMEOUT,
            PLAYER_CLAN_BATTLE_WR_BATTLES_CORRELATION_REFRESH_DISPATCH_TIMEOUT,
        ):
            self.assertGreaterEqual(ttl, hard)

    def test_combined_budget_fits_under_its_lock_ttl(self):
        from warships.tasks import (
            CORRELATION_WARM_LOCK_TIMEOUT, PLAYER_CORRELATIONS_WARM_TASK_OPTS,
        )
        soft = PLAYER_CORRELATIONS_WARM_TASK_OPTS["soft_time_limit"]
        hard = PLAYER_CORRELATIONS_WARM_TASK_OPTS["time_limit"]
        self.assertLess(soft, hard)
        self.assertLessEqual(hard, CORRELATION_WARM_LOCK_TIMEOUT)

    def test_per_metric_budget_clears_the_measured_worst_case(self):
        # 2026-08-26 measured 389-500s per realm, but on a sample where the three
        # metrics still shared one budget, so it understated the heaviest. Split
        # out by the fan-out, eu `ranked_wr_battles` alone ran 708s and 757s on
        # its two SUCCESSFUL passes of 2026-08-29 and soft-limited six times at
        # 780s the same day. Every killed run is censored, so the true tail is
        # still unknown; 1080s is ~1.43x the slowest observed success.
        from warships.tasks import CORRELATION_METRIC_WARM_TASK_OPTS
        self.assertGreaterEqual(
            CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"], 1000,
            "eu ranked_wr_battles succeeds at 708-757s; 780s soft-limited it "
            "six times on 2026-08-29")

    def test_the_dispatcher_budget_is_not_a_bound_on_the_metrics(self):
        # This assertion used to read `combined > per-metric`, on the reasoning
        # that the parent ran all three serially. That reasoning died on
        # 2026-08-28 when `warm_player_correlations_task` became a dispatcher
        # returning in ~5ms, and on 2026-08-29 the ordering became false when the
        # per-metric soft limit passed 900s. Inverting it back would silently
        # re-cap the metrics at the parent's number.
        #
        # What is actually load-bearing now: the parent must have enough budget
        # to enqueue three messages, and nothing more is claimed of it.
        from warships.tasks import PLAYER_CORRELATIONS_WARM_TASK_OPTS
        self.assertGreaterEqual(
            PLAYER_CORRELATIONS_WARM_TASK_OPTS["soft_time_limit"], 60,
            "the dispatcher only enqueues three messages, but it still needs "
            "room for a slow broker")

    def test_correlation_tasks_carry_the_new_budgets(self):
        from warships import tasks
        self.assertEqual(
            tasks.warm_player_ranked_wr_battles_correlation_task.soft_time_limit,
            tasks.CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"])
        self.assertEqual(
            tasks.warm_player_clan_battle_wr_battles_correlation_task.soft_time_limit,
            tasks.CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"])
        self.assertEqual(
            tasks.warm_player_wr_survival_correlation_task.soft_time_limit,
            tasks.CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"])
        self.assertEqual(
            tasks.warm_player_correlations_task.soft_time_limit,
            tasks.PLAYER_CORRELATIONS_WARM_TASK_OPTS["soft_time_limit"])


class CorrelationWarmLockScopeTests(TestCase):
    def test_per_metric_lock_is_realm_scoped(self):
        # THE LOAD-BEARING ONE. The lock keyed on the literal "population", so
        # every realm shared it and the warms serialized globally. With a longer
        # budget that would have made two of three realms skip -- and a skip is
        # logged as `succeeded`, so the digest would have gone QUIETER while
        # coverage got worse.
        from warships.tasks import _task_lock_key

        keys = {
            _task_lock_key("warm_player_ranked_wr_battles_correlation", realm)
            for realm in ("na", "eu", "asia")
        }
        self.assertEqual(len(keys), 3, "each realm needs its own lock")

    def test_no_task_locks_on_the_literal_population_scope(self):
        # Guards the regression directly: `"population"` as a resource_id is the
        # bug, and grep is the only thing that catches it coming back.
        import inspect
        from warships import tasks

        hits = [
            n for n, line in enumerate(inspect.getsource(tasks).splitlines(), 1)
            if line.strip() == '"population",'
        ]
        # Assert on the line numbers, never the module text: a bare assertNotIn
        # dumps all of tasks.py into the failure output.
        self.assertEqual(
            hits, [],
            f"lock scoped to the literal 'population' at tasks.py lines {hits} "
            "is shared across every realm")


class CorrelationFanOutTests(TestCase):
    """`warm_player_correlations_task` is a dispatcher since 2026-08-28.

    It ran three population correlations serially in-process under a 900s budget
    while each of those is separately budgeted at 780s, so EU -- the largest
    realm -- soft-limited on every run from 2026-08-27. Fan-out rather than
    headroom, the same call 55b946f made for `startup_warm_caches_task`.

    Runbook: agents/runbooks/runbook-ops-alert-remediation-2026-08-28.md
    """

    METRICS = (
        "warm_player_wr_survival_correlation_task",
        "warm_player_ranked_wr_battles_correlation_task",
        "warm_player_clan_battle_wr_battles_correlation_task",
    )

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_it_dispatches_all_three_metrics_for_the_realm(self):
        from unittest import mock
        from warships import tasks

        with mock.patch.multiple(
            tasks,
            **{m: mock.DEFAULT for m in self.METRICS},
        ) as patched:
            result = tasks.warm_player_correlations_task(realm="eu")

        for name in self.METRICS:
            patched[name].delay.assert_called_once_with(realm="eu")
        self.assertEqual(result["status"], "dispatched")

    def test_the_lock_outlives_the_dispatch(self):
        """The gate `queue_warm_player_correlations` reads must still be held.

        THE LOAD-BEARING ONE. That function skips a cold-cache user-traffic
        enqueue while this lock is present. A dispatcher that cleared it in a
        `finally` after ~0s would let every player-page load on a cold cache
        enqueue another fan-out -- the 4581-message pileup shape its comment
        cites. The lock must expire on its TTL, not be deleted on success.
        """
        from unittest import mock
        from django.core.cache import cache
        from warships import tasks

        with mock.patch.multiple(
            tasks,
            **{m: mock.DEFAULT for m in self.METRICS},
        ):
            tasks.warm_player_correlations_task(realm="eu")

        # Truthy, not merely present: the gate below reads it with `cache.get`
        # and a truthiness test, so a stored None is a lock that gates nothing.
        self.assertTrue(
            cache.get(tasks._correlation_warm_lock_key("eu")),
            "dispatcher released the lock the cold-cache gate depends on")
        self.assertEqual(
            tasks.queue_warm_player_correlations(realm="eu"),
            {"status": "skipped", "reason": "already-running"})

    def test_a_held_lock_skips_without_dispatching(self):
        from unittest import mock
        from django.core.cache import cache
        from warships import tasks

        cache.add(tasks._correlation_warm_lock_key("eu"), "someone-else", timeout=60)
        with mock.patch.multiple(
            tasks,
            **{m: mock.DEFAULT for m in self.METRICS},
        ) as patched:
            result = tasks.warm_player_correlations_task(realm="eu")

        self.assertEqual(result, {"status": "skipped", "reason": "already-running"})
        for name in self.METRICS:
            patched[name].delay.assert_not_called()

    def test_a_broker_failure_releases_the_lock(self):
        """A dispatch that never happened must not gate the realm for 1200s."""
        from unittest import mock
        from django.core.cache import cache
        from warships import tasks

        with mock.patch.multiple(
            tasks,
            **{m: mock.DEFAULT for m in self.METRICS},
        ) as patched:
            patched[self.METRICS[0]].delay.side_effect = OSError("broker down")
            result = tasks.warm_player_correlations_task(realm="eu")

        self.assertEqual(result["status"], "dispatch-failed")
        self.assertIsNone(cache.get(tasks._correlation_warm_lock_key("eu")))

    def test_the_dispatcher_emits_no_per_realm_success_line(self):
        """`Finished <task> realm=<r>` is the digest's per-realm success axis.

        `snapshot_service_health.sh` greps exactly that string and prefixes the
        captured name with `warships.tasks.`. A dispatcher that logged one would
        be tallied as the realm's success, and `celery_task_realm_failing` would
        read green while all three metrics failed -- the precise blindness the
        per-realm axis was added on 2026-08-26 to remove.
        """
        import inspect
        import re
        from warships import tasks

        source = inspect.getsource(tasks.warm_player_correlations_task)
        hits = [
            line.strip() for line in source.splitlines()
            if re.search(r'"Finished \w+ realm=%s', line)
        ]
        self.assertEqual(
            hits, [],
            "dispatcher emits a per-realm success line the digest will believe")

    def test_each_metric_task_emits_one(self):
        """The counterpart: the signal must have MOVED, not vanished."""
        import inspect
        import re
        from warships import tasks

        for name in self.METRICS:
            source = inspect.getsource(getattr(tasks, name))
            self.assertTrue(
                re.search(r'"Finished %s realm=%%s' % name, source),
                f"{name} must log `Finished {name} realm=<r>` or the digest "
                "cannot see it per realm")
