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
        # Pinned as a PAIR so the two cannot drift apart again: the ranked one
        # was routed and the clan-battle one was not, which is the same defect
        # class as test_ship_standings_warm_chain_routes_to_background.
        routes = settings.CELERY_TASK_ROUTES
        for task in (
            "warships.tasks.warm_player_ranked_wr_battles_correlation_task",
            "warships.tasks.warm_player_clan_battle_wr_battles_correlation_task",
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
        from warships.tasks import (
            CORRELATION_METRIC_WARM_TASK_OPTS, RESOURCE_TASK_LOCK_TIMEOUT,
        )
        soft = CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"]
        hard = CORRELATION_METRIC_WARM_TASK_OPTS["time_limit"]
        self.assertLess(soft, hard)
        self.assertLessEqual(hard, RESOURCE_TASK_LOCK_TIMEOUT)

    def test_combined_budget_fits_under_its_lock_ttl(self):
        from warships.tasks import (
            CORRELATION_WARM_LOCK_TIMEOUT, PLAYER_CORRELATIONS_WARM_TASK_OPTS,
        )
        soft = PLAYER_CORRELATIONS_WARM_TASK_OPTS["soft_time_limit"]
        hard = PLAYER_CORRELATIONS_WARM_TASK_OPTS["time_limit"]
        self.assertLess(soft, hard)
        self.assertLessEqual(hard, CORRELATION_WARM_LOCK_TIMEOUT)

    def test_per_metric_budget_clears_the_measured_worst_case(self):
        # 500s is the slowest SUCCESSFUL run observed (na, 2026-08-26). Every
        # killed run is censored at 540s, so the true tail is unknown and the
        # budget needs real headroom over the measurement, not a hair.
        from warships.tasks import CORRELATION_METRIC_WARM_TASK_OPTS
        self.assertGreaterEqual(
            CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"], 750,
            "measured 389-500s on every realm; 540s was not enough")

    def test_combined_budget_exceeds_the_per_metric_budget(self):
        # The combined task runs all three correlations serially, so it cannot
        # have a smaller budget than one of them.
        from warships.tasks import (
            CORRELATION_METRIC_WARM_TASK_OPTS, PLAYER_CORRELATIONS_WARM_TASK_OPTS,
        )
        self.assertGreater(
            PLAYER_CORRELATIONS_WARM_TASK_OPTS["soft_time_limit"],
            CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"])

    def test_correlation_tasks_carry_the_new_budgets(self):
        from warships import tasks
        self.assertEqual(
            tasks.warm_player_ranked_wr_battles_correlation_task.soft_time_limit,
            tasks.CORRELATION_METRIC_WARM_TASK_OPTS["soft_time_limit"])
        self.assertEqual(
            tasks.warm_player_clan_battle_wr_battles_correlation_task.soft_time_limit,
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
