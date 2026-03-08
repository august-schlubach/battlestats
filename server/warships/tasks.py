from __future__ import absolute_import, unicode_literals
import logging

from battlestats.celery import app


logger = logging.getLogger(__name__)
TASK_OPTS = {
    "time_limit": 600,
    "soft_time_limit": 540,
    "ignore_result": True,
}


@app.task(**TASK_OPTS)
def update_clan_data_task(clan_id):
    from warships.data import update_clan_data
    logger.info("Starting update_clan_data_task for clan_id=%s", clan_id)
    update_clan_data(clan_id=clan_id)


@app.task(**TASK_OPTS)
def update_clan_members_task(clan_id):
    from warships.data import update_clan_members
    logger.info("Starting update_clan_members_task for clan_id=%s", clan_id)
    update_clan_members(clan_id=clan_id)


@app.task(**TASK_OPTS)
def update_player_data_task(player_id, force_refresh=False):
    from warships.data import update_player_data
    from warships.models import Player

    logger.info(
        "Starting update_player_data_task for player_id=%s force_refresh=%s",
        player_id,
        force_refresh,
    )
    player = Player.objects.get(player_id=player_id)
    update_player_data(player=player, force_refresh=force_refresh)


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
