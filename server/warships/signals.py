from __future__ import annotations

import json
import os

from django.db.models.signals import post_migrate
from django.dispatch import receiver


@receiver(post_migrate)
def ensure_daily_clan_crawl_schedule(sender, **kwargs):
    if getattr(sender, "name", None) != "warships":
        return

    from django_celery_beat.models import CrontabSchedule, PeriodicTask

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
            "kwargs": json.dumps({"resume": True}),
            "description": "Daily crawl of clans and players from the Wargaming API.",
        },
    )
