"""Recompute Player.enrichment_status from current row state.

Run periodically to absorb players whose hidden / activity / battle-count /
win-rate state changed since their last enrichment classification. Idempotent
and safe to re-run.

Reclassification rules (most specific wins, ordered to match the
``_candidates()`` gate in ``warships.management.commands.enrich_player_data``
so reclassified rows stay consistent with what the live crawler will pick up):

  battles_json non-empty list           -> enriched
  battles_json == []                    -> empty
  is_hidden=True                        -> skipped_hidden
  pvp_battles < MIN_PVP_BATTLES         -> skipped_low_battles
  days_since_last_battle > MAX_INACTIVE -> skipped_inactive
  pvp_ratio < MIN_WR                    -> skipped_low_wr
  otherwise                             -> pending

``MIN_PVP_BATTLES``, ``MIN_WR`` and ``MAX_INACTIVE_DAYS`` read the same env
vars (``ENRICH_MIN_PVP_BATTLES`` / ``ENRICH_MIN_WR`` / ``ENRICH_MAX_INACTIVE_DAYS``)
as the live crawler so the eligibility gate stays in lockstep.
"""
import os
import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from warships.models import Player


MIN_PVP_BATTLES = int(os.getenv("ENRICH_MIN_PVP_BATTLES", "500"))
MIN_WR = float(os.getenv("ENRICH_MIN_WR", "48.0"))
MAX_INACTIVE_DAYS = int(os.getenv("ENRICH_MAX_INACTIVE_DAYS", "365"))


class Command(BaseCommand):
    help = "Recompute Player.enrichment_status across the catalog."

    def add_arguments(self, parser):
        parser.add_argument(
            '--realm', default=None,
            help='Limit to a single realm (na/eu/asia). Default: all.',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Print what would change without writing.',
        )
        parser.add_argument(
            '--recent-hours', type=int, default=0,
            help='Incremental mode: only reclassify rows fetched within this many '
                 'hours (last_fetch >= now - N hours). Drift-relevant fields '
                 '(is_hidden / pvp_battles / pvp_ratio / days_since_last_battle) '
                 'only change on a WG re-fetch, which bumps last_fetch — so the '
                 'recent set holds every row that could have newly drifted, at a '
                 'fraction of the full-catalog scan. Default 0 = full catalog. '
                 'Misses pure-calendar inactivity crossings (no re-fetch) — run a '
                 'periodic full pass for those.',
        )
        parser.add_argument(
            '--rotation', type=int, default=None,
            help='Rotate the bucket order by this index. The buckets are pairwise '
                 'disjoint, so this cannot change the outcome of a complete pass; '
                 'it stops a budget-truncated pass from starving the same tail on '
                 'every run. Default: day of year.',
        )
        parser.add_argument(
            '--budget-seconds', type=int, default=None,
            help='Stop dispatching further buckets once this many seconds have '
                 'elapsed. Buckets commit individually, so there is no longer a '
                 'fail-fast bound on the pass; this keeps a pathological run from '
                 'reaching the caller\'s hard time limit. Default: unbounded.',
        )

    def _plan_in_documented_order(self, base):
        """Buckets in the documented most-specific-first order.

        Kept verbatim from the original single-transaction implementation so the
        classification rules in this module's docstring stay the source of truth;
        only the transaction boundary and the ordering rotation changed.
        """
        return [
                (
                    'enriched',
                    base.filter(battles_json__isnull=False).exclude(battles_json=[]),
                ),
                (
                    'empty',
                    base.filter(battles_json=[]),
                ),
                (
                    'skipped_hidden',
                    base.filter(is_hidden=True, battles_json__isnull=True),
                ),
                (
                    'skipped_low_battles',
                    base.filter(
                        is_hidden=False,
                        battles_json__isnull=True,
                        pvp_battles__lt=MIN_PVP_BATTLES,
                    ),
                ),
                (
                    'skipped_inactive',
                    base.filter(
                        is_hidden=False,
                        battles_json__isnull=True,
                        pvp_battles__gte=MIN_PVP_BATTLES,
                        days_since_last_battle__gt=MAX_INACTIVE_DAYS,
                    ),
                ),
                (
                    'skipped_low_wr',
                    base.filter(
                        is_hidden=False,
                        battles_json__isnull=True,
                        pvp_battles__gte=MIN_PVP_BATTLES,
                        days_since_last_battle__lte=MAX_INACTIVE_DAYS,
                        pvp_ratio__lt=MIN_WR,
                    ),
                ),
                (
                    'pending',
                    base.filter(
                        is_hidden=False,
                        battles_json__isnull=True,
                        pvp_battles__gte=MIN_PVP_BATTLES,
                        days_since_last_battle__lte=MAX_INACTIVE_DAYS,
                        pvp_ratio__gte=MIN_WR,
                    ),
                ),
        ]

    def build_plan(self, base, rotation=None):
        """The ordered ``(status, queryset)`` buckets.

        The listed order is the documented one: most specific first. That ordering
        is defensive rather than load-bearing — the buckets are pairwise disjoint
        (proved by ``test_f2_buckets_are_pairwise_disjoint``), so no row is claimed
        by two and order cannot change the final classification of a complete pass.

        ``rotation`` exploits exactly that. Each bucket now commits on its own, so a
        pass truncated by ``--budget-seconds`` keeps whatever it finished — but with
        a fixed order it would keep finishing the *same* prefix and starve the same
        tail indefinitely. That budget can only be as large as
        ``soft_time_limit - statement_timeout - slack`` (600s), which is below the
        slowest observed pass (~660s), so truncation is expected rather than
        hypothetical. Rotating the start point means every bucket leads once per
        cycle. Defaults to the day of year, so consecutive daily runs rotate with no
        stored state.
        """
        plan = self._plan_in_documented_order(base)
        if rotation is None:
            rotation = timezone.now().timetuple().tm_yday
        offset = rotation % len(plan)
        return plan[offset:] + plan[:offset]

    def handle(self, *args, **opts):
        realm = opts.get('realm')
        dry_run = opts.get('dry_run', False)
        recent_hours = opts.get('recent_hours', 0)

        base = Player.objects.all()
        if realm:
            base = base.filter(realm=realm)
        if recent_hours and recent_hours > 0:
            cutoff = timezone.now() - timedelta(hours=recent_hours)
            base = base.filter(last_fetch__gte=cutoff)

        scope = f"recent<={recent_hours}h" if recent_hours and recent_hours > 0 else "full-catalog"
        self.stdout.write(
            f"Thresholds: MIN_PVP_BATTLES={MIN_PVP_BATTLES} "
            f"MIN_WR={MIN_WR} MAX_INACTIVE_DAYS={MAX_INACTIVE_DAYS} scope={scope}"
        )

        plan = self.build_plan(base, rotation=opts.get('rotation'))


        # Each bucket commits on its own. Previously all seven shared a single
        # `transaction.atomic()`, so a statement timeout on any one of them rolled
        # back the entire pass — observed daily on eu and asia, which meant those
        # realms received *zero* drift rescue rather than partial. The buckets are
        # pairwise disjoint (no row is claimed by two), so splitting the transaction
        # cannot change the final classification; it only changes how much survives
        # a failure. A failing bucket is recorded and the rest still run.
        budget_seconds = opts.get('budget_seconds')
        deadline = (
            time.monotonic() + budget_seconds
            if budget_seconds is not None else None
        )

        results = {}
        failed = {}
        skipped_for_budget = []

        for status, qs in plan:
            if deadline is not None and time.monotonic() >= deadline:
                skipped_for_budget.append(status)
                continue

            # Only touch rows that aren't already in this bucket.
            changing = qs.exclude(enrichment_status=status)

            if dry_run:
                # Simply do not write. The old approach wrote and then called
                # `transaction.set_rollback(True)` on the shared block, which no
                # longer exists.
                results[status] = changing.count()
                continue

            try:
                with transaction.atomic():
                    results[status] = changing.update(enrichment_status=status)
            except Exception as exc:            # noqa: BLE001 - reported, not hidden
                failed[status] = f"{type(exc).__name__}: {exc}"

        verb = 'Would update' if dry_run else 'Updated'
        for status, count in results.items():
            self.stdout.write(f"{verb} {count:>8} rows -> {status}")
        for status, message in failed.items():
            self.stdout.write(f"FAILED bucket -> {status}: {message}")
        if skipped_for_budget:
            self.stdout.write(
                "Skipped (budget exhausted) -> "
                f"{', '.join(skipped_for_budget)}")

        self._last_run = {
            'updated': results,
            'failed': failed,
            'skipped_for_budget': skipped_for_budget,
        }
