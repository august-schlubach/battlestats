from __future__ import absolute_import, unicode_literals
import logging
import os
import time

from django.core.cache import cache

from battlestats.celery import app


logger = logging.getLogger(__name__)
TASK_OPTS = {
    "time_limit": 600,
    "soft_time_limit": 540,
    "ignore_result": True,
}
CRAWL_TASK_OPTS = {
    "time_limit": 6 * 60 * 60,
    "soft_time_limit": 5 * 60 * 60 + 45 * 60,
    "ignore_result": True,
}
CLAN_CRAWL_LOCK_KEY = "warships:tasks:crawl_all_clans:lock"
CLAN_CRAWL_LOCK_TIMEOUT = 8 * 60 * 60
CLAN_CRAWL_HEARTBEAT_KEY = "warships:tasks:crawl_all_clans:heartbeat"
CLAN_CRAWL_HEARTBEAT_STALE_AFTER = 15 * 60
RESOURCE_TASK_LOCK_TIMEOUT = 15 * 60


def _configured_clan_battle_warm_ids(raw_value=None):
    value = os.getenv("CLAN_BATTLE_WARM_CLAN_IDS",
                      "1000055908") if raw_value is None else raw_value
    return [clan_id.strip() for clan_id in str(value).split(",") if clan_id.strip()]


def _task_lock_key(task_name: str, resource_id: object) -> str:
    return f"warships:tasks:{task_name}:{resource_id}:lock"


def _run_locked_task(task_name: str, resource_id: object, request_id: str, callback):
    lock_key = _task_lock_key(task_name, resource_id)
    if not cache.add(lock_key, request_id, timeout=RESOURCE_TASK_LOCK_TIMEOUT):
        logger.info(
            "Skipping %s for resource=%s because another refresh is already running",
            task_name,
            resource_id,
        )
        return {"status": "skipped", "reason": "already-running"}

    try:
        callback()
        return {"status": "completed"}
    finally:
        cache.delete(lock_key)


@app.task(bind=True, **TASK_OPTS)
def update_clan_data_task(self, clan_id):
    from warships.data import update_clan_data

    logger.info("Starting update_clan_data_task for clan_id=%s", clan_id)
    return _run_locked_task(
        "update_clan_data",
        clan_id,
        self.request.id,
        lambda: update_clan_data(clan_id=clan_id),
    )


@app.task(bind=True, **TASK_OPTS)
def update_clan_members_task(self, clan_id):
    from warships.data import update_clan_members

    logger.info("Starting update_clan_members_task for clan_id=%s", clan_id)
    return _run_locked_task(
        "update_clan_members",
        clan_id,
        self.request.id,
        lambda: update_clan_members(clan_id=clan_id),
    )


@app.task(bind=True, **TASK_OPTS)
def update_player_data_task(self, player_id, force_refresh=False):
    from warships.data import update_player_data
    from warships.models import Player

    logger.info(
        "Starting update_player_data_task for player_id=%s force_refresh=%s",
        player_id,
        force_refresh,
    )

    def _refresh_player():
        player = Player.objects.get(player_id=player_id)
        update_player_data(player=player, force_refresh=force_refresh)

    return _run_locked_task(
        "update_player_data",
        player_id,
        self.request.id,
        _refresh_player,
    )


@app.task(**TASK_OPTS)
def preload_battles_json_task():
    from warships.data import preload_battles_json
    logger.info("Starting preload_battles_json_task")
    preload_battles_json()


@app.task(**TASK_OPTS)
def preload_activity_data_task():
    from warships.data import preload_activity_data
    logger.info("Starting preload_activity_data_task")
    preload_activity_data()


@app.task(**TASK_OPTS)
def update_randoms_data_task(player_id):
    from warships.data import update_randoms_data
    logger.info("Starting update_randoms_data_task for player_id=%s", player_id)
    update_randoms_data(player_id=player_id)


@app.task(**TASK_OPTS)
def update_tiers_data_task(player_id):
    from warships.data import update_tiers_data
    logger.info("Starting update_tiers_data_task for player_id=%s", player_id)
    update_tiers_data(player_id=player_id)


@app.task(**TASK_OPTS)
def update_snapshot_data_task(player_id):
    from warships.data import update_snapshot_data
    logger.info("Starting update_snapshot_data_task for player_id=%s", player_id)
    update_snapshot_data(player_id=player_id)


@app.task(**TASK_OPTS)
def update_activity_data_task(player_id):
    from warships.data import update_activity_data
    logger.info("Starting update_activity_data_task for player_id=%s", player_id)
    update_activity_data(player_id=player_id)


@app.task(**TASK_OPTS)
def update_type_data_task(player_id):
    from warships.data import update_type_data
    logger.info("Starting update_type_data_task for player_id=%s", player_id)
    update_type_data(player_id=player_id)


@app.task(bind=True, **TASK_OPTS)
def update_clan_battle_summary_task(self, clan_id):
    from warships.data import refresh_clan_battle_seasons_cache

    logger.info(
        "Starting update_clan_battle_summary_task for clan_id=%s", clan_id)
    return _run_locked_task(
        "update_clan_battle_summary",
        clan_id,
        self.request.id,
        lambda: refresh_clan_battle_seasons_cache(clan_id),
    )


@app.task(bind=True, **TASK_OPTS)
def warm_clan_battle_summaries_task(self, clan_ids=None):
    from warships.data import refresh_clan_battle_seasons_cache

    configured_ids = clan_ids or _configured_clan_battle_warm_ids()
    if not configured_ids:
        logger.info(
            "Skipping warm_clan_battle_summaries_task because no clan ids are configured")
        return {"status": "skipped", "reason": "no-clans-configured"}

    results = []
    for clan_id in configured_ids:
        result = _run_locked_task(
            "update_clan_battle_summary",
            clan_id,
            self.request.id,
            lambda clan_id=clan_id: refresh_clan_battle_seasons_cache(clan_id),
        )
        results.append({"clan_id": str(clan_id), **result})

    logger.info(
        "Finished warm_clan_battle_summaries_task for clan_ids=%s", configured_ids)
    return {"status": "completed", "results": results}


@app.task(bind=True, **CRAWL_TASK_OPTS)
def crawl_all_clans_task(self, resume=True, dry_run=False, limit=None):
    from warships.clan_crawl import run_clan_crawl

    if not cache.add(CLAN_CRAWL_LOCK_KEY, self.request.id, timeout=CLAN_CRAWL_LOCK_TIMEOUT):
        logger.warning(
            "Skipping crawl_all_clans_task because another crawl is already running")
        return {"status": "skipped", "reason": "already-running"}

    try:
        cache.set(CLAN_CRAWL_HEARTBEAT_KEY, time.time(),
                  timeout=CLAN_CRAWL_LOCK_TIMEOUT)
        logger.info(
            "Starting crawl_all_clans_task resume=%s dry_run=%s limit=%s",
            resume,
            dry_run,
            limit,
        )
        summary = run_clan_crawl(resume=resume, dry_run=dry_run, limit=limit)
        logger.info("Finished crawl_all_clans_task: %s", summary)
        return {"status": "completed", **summary}
    finally:
        cache.delete(CLAN_CRAWL_LOCK_KEY)


@app.task(**TASK_OPTS)
def ensure_crawl_all_clans_running_task():
    heartbeat = cache.get(CLAN_CRAWL_HEARTBEAT_KEY)
    lock_value = cache.get(CLAN_CRAWL_LOCK_KEY)
    now_ts = time.time()

    if lock_value is not None:
        if heartbeat is not None and now_ts - float(heartbeat) <= CLAN_CRAWL_HEARTBEAT_STALE_AFTER:
            logger.info(
                "Crawl watchdog found active crawl with fresh heartbeat")
            return {"status": "skipped", "reason": "running"}

        logger.warning(
            "Crawl watchdog found stale crawl lock; clearing it and resuming crawl")
        cache.delete(CLAN_CRAWL_LOCK_KEY)
        cache.delete(CLAN_CRAWL_HEARTBEAT_KEY)
        crawl_all_clans_task.delay(resume=True)
        return {"status": "scheduled", "reason": "stale-lock"}

    logger.info("Crawl watchdog found no active crawl; scheduling resume crawl")
    crawl_all_clans_task.delay(resume=True)
    return {"status": "scheduled", "reason": "not-running"}
