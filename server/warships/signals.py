from __future__ import annotations

import json
import os

from django.db.models.signals import post_migrate
from django.dispatch import receiver


def _configured_clan_battle_warm_ids():
    raw_value = os.getenv("CLAN_BATTLE_WARM_CLAN_IDS", "1000055908")
    return [clan_id.strip() for clan_id in raw_value.split(",") if clan_id.strip()]


@receiver(post_migrate)
def ensure_daily_clan_crawl_schedule(sender, **kwargs):
    if getattr(sender, "name", None) != "warships":
        return

    from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask

    hour = os.getenv("CLAN_CRAWL_SCHEDULE_HOUR", "3")
    minute = os.getenv("CLAN_CRAWL_SCHEDULE_MINUTE", "0")

    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute=minute,
        hour=hour,
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="UTC",
    )

    PeriodicTask.objects.update_or_create(
        name="daily-clan-crawl",
        defaults={
            "task": "warships.tasks.crawl_all_clans_task",
            "crontab": schedule,
            "enabled": True,
            "args": json.dumps([]),
            "kwargs": json.dumps({"resume": False}),
            "description": "Daily full crawl of clans and players from the Wargaming API.",
        },
    )

    ranked_hour = os.getenv("RANKED_INCREMENTAL_SCHEDULE_HOUR", "10")
    ranked_minute = os.getenv("RANKED_INCREMENTAL_SCHEDULE_MINUTE", "30")
    ranked_schedule, _ = CrontabSchedule.objects.get_or_create(
        minute=ranked_minute,
        hour=ranked_hour,
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="UTC",
    )

    PeriodicTask.objects.update_or_create(
        name="daily-ranked-incrementals",
        defaults={
            "task": "warships.tasks.incremental_ranked_data_task",
            "crontab": ranked_schedule,
            "enabled": True,
            "args": json.dumps([]),
            "kwargs": json.dumps({}),
            "description": "Daily incremental refresh of ranked history, scheduled away from the clan crawl.",
        },
    )

    watchdog_minutes = int(os.getenv("CLAN_CRAWL_WATCHDOG_MINUTES", "5"))
    watchdog_schedule, _ = IntervalSchedule.objects.get_or_create(
        every=watchdog_minutes,
        period=IntervalSchedule.MINUTES,
    )

    PeriodicTask.objects.update_or_create(
        name="clan-crawl-watchdog",
        defaults={
            "task": "warships.tasks.ensure_crawl_all_clans_running_task",
            "interval": watchdog_schedule,
            "enabled": True,
            "args": json.dumps([]),
            "kwargs": json.dumps({}),
            "description": "Checks every few minutes for a stale clan-crawl lock and resumes interrupted crawls only.",
        },
    )

    warm_clan_ids = _configured_clan_battle_warm_ids()
    if warm_clan_ids:
        warm_minutes = int(os.getenv("CLAN_BATTLE_WARM_MINUTES", "30"))
        warm_schedule, _ = IntervalSchedule.objects.get_or_create(
            every=warm_minutes,
            period=IntervalSchedule.MINUTES,
        )

        PeriodicTask.objects.update_or_create(
            name="clan-battle-summary-warmer",
            defaults={
                "task": "warships.tasks.warm_clan_battle_summaries_task",
                "interval": warm_schedule,
                "enabled": True,
                "args": json.dumps([]),
                "kwargs": json.dumps({"clan_ids": warm_clan_ids}),
                "description": "Keeps configured clan-battle summary fixtures warm in cache for smoke tests and UI validation.",
            },
        )
    else:
        PeriodicTask.objects.filter(
            name="clan-battle-summary-warmer").update(enabled=False)

    landing_warm_minutes = int(os.getenv("LANDING_PAGE_WARM_MINUTES", "55"))
    landing_warm_schedule, _ = IntervalSchedule.objects.get_or_create(
        every=landing_warm_minutes,
        period=IntervalSchedule.MINUTES,
    )

    PeriodicTask.objects.update_or_create(
        name="landing-page-warmer",
        defaults={
            "task": "warships.tasks.warm_landing_page_content_task",
            "interval": landing_warm_schedule,
            "enabled": True,
            "args": json.dumps([]),
            "kwargs": json.dumps({"include_recent": True}),
            "description": "Refreshes landing page caches shortly before the one-hour TTL expires so the first landing request stays hot.",
        },
    )
