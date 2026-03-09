from __future__ import annotations

from unittest.mock import patch

from django.apps import apps
from django.core.cache import cache
from django.test import TestCase, override_settings

from django_celery_beat.models import CrontabSchedule, PeriodicTask

from warships.signals import ensure_daily_clan_crawl_schedule
from warships.tasks import CLAN_CRAWL_LOCK_KEY, crawl_all_clans_task, update_clan_battle_summary_task, update_clan_data_task, update_clan_members_task, update_player_data_task


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "TIMEOUT": 60,
        }
    }
)
class ClanCrawlSchedulerTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_crawl_task_runs_runner_and_releases_lock(self):
        with patch("warships.clan_crawl.run_clan_crawl", return_value={"clans_found": 12}) as mock_run:
            result = crawl_all_clans_task.run(
                resume=True, dry_run=False, limit=5)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["clans_found"], 12)
        mock_run.assert_called_once_with(resume=True, dry_run=False, limit=5)
        self.assertIsNone(cache.get(CLAN_CRAWL_LOCK_KEY))

    def test_crawl_task_skips_when_lock_exists(self):
        cache.add(CLAN_CRAWL_LOCK_KEY, "existing-run", timeout=60)

        with patch("warships.clan_crawl.run_clan_crawl") as mock_run:
            result = crawl_all_clans_task.run(resume=True)

        self.assertEqual(result, {"status": "skipped",
                         "reason": "already-running"})
        mock_run.assert_not_called()

    def test_post_migrate_creates_daily_periodic_task(self):
        app_config = apps.get_app_config("warships")

        ensure_daily_clan_crawl_schedule(sender=app_config)

        task = PeriodicTask.objects.get(name="daily-clan-crawl")
        self.assertEqual(task.task, "warships.tasks.crawl_all_clans_task")
        self.assertEqual(task.kwargs, '{"resume": true}')
        self.assertTrue(task.enabled)

        schedule = CrontabSchedule.objects.get(id=task.crontab_id)
        self.assertEqual(schedule.hour, "3")
        self.assertEqual(schedule.minute, "0")
        self.assertEqual(str(schedule.timezone), "UTC")


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "TIMEOUT": 60,
        }
    }
)
class RefreshTaskLockTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_player_refresh_task_skips_when_lock_exists(self):
        cache.add("warships:tasks:update_player_data:42:lock",
                  "existing-run", timeout=60)

        with patch("warships.data.update_player_data") as mock_update_player_data:
            result = update_player_data_task.run(
                player_id=42, force_refresh=True)

        self.assertEqual(result, {"status": "skipped",
                         "reason": "already-running"})
        mock_update_player_data.assert_not_called()

    def test_clan_refresh_task_skips_when_lock_exists(self):
        cache.add("warships:tasks:update_clan_data:99:lock",
                  "existing-run", timeout=60)

        with patch("warships.data.update_clan_data") as mock_update_clan_data:
            result = update_clan_data_task.run(clan_id=99)

        self.assertEqual(result, {"status": "skipped",
                         "reason": "already-running"})
        mock_update_clan_data.assert_not_called()

    def test_clan_members_refresh_task_skips_when_lock_exists(self):
        cache.add("warships:tasks:update_clan_members:99:lock",
                  "existing-run", timeout=60)

        with patch("warships.data.update_clan_members") as mock_update_clan_members:
            result = update_clan_members_task.run(clan_id=99)

        self.assertEqual(result, {"status": "skipped",
                         "reason": "already-running"})
        mock_update_clan_members.assert_not_called()

    def test_clan_battle_summary_task_skips_when_lock_exists(self):
        cache.add("warships:tasks:update_clan_battle_summary:99:lock",
                  "existing-run", timeout=60)

        with patch("warships.data.refresh_clan_battle_seasons_cache") as mock_refresh_summary:
            result = update_clan_battle_summary_task.run(clan_id=99)

        self.assertEqual(result, {"status": "skipped",
                         "reason": "already-running"})
        mock_refresh_summary.assert_not_called()

    def test_post_migrate_updates_existing_periodic_task(self):
        schedule = CrontabSchedule.objects.create(
            minute="15",
            hour="8",
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            timezone="UTC",
        )
        task = PeriodicTask.objects.get(name="daily-clan-crawl")
        task.task = "warships.tasks.update_clan_data_task"
        task.crontab = schedule
        task.kwargs = "{}"
        task.save()

        app_config = apps.get_app_config("warships")
        ensure_daily_clan_crawl_schedule(sender=app_config)

        task = PeriodicTask.objects.get(name="daily-clan-crawl")
        self.assertEqual(task.task, "warships.tasks.crawl_all_clans_task")
        self.assertEqual(task.kwargs, '{"resume": true}')
