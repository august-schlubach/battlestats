from __future__ import absolute_import, unicode_literals
from battlestats.celery import app
from warships.models import Player


@app.task(time_limit=600)
def update_clan_data_task(clan_id):
    from warships.data import update_clan_data
    print(
        f'\n\nStarting async task: update_clan_data_task for clan_id: {clan_id}\n\n')
    update_clan_data(clan_id=clan_id)


@app.task(time_limit=600)
def update_clan_members_task(clan_id):
    from warships.data import update_clan_members
    print(
        f'\n\nStarting async task: update_clan_members_task for clan_id: {clan_id}\n\n')
    update_clan_members(clan_id=clan_id)


@app.task(time_limit=600)
def update_player_data_task(player_id):
    from warships.data import update_player_data
    print(
        f'\n\nStarting async task: update_player_data_task for player_id: {player_id}\n\n')
    player = Player.objects.get(player_id=player_id)
    update_player_data(player=player)


@app.task(time_limit=600)
def preload_battles_json_task():
    from warships.data import preload_battles_json
    print('\n\nPreloading battles JSON\n\n')
    preload_battles_json()


@app.task(time_limit=600)
def preload_activity_data_task():
    from warships.data import preload_activity_data
    print('\n\nPreloading activity JSON\n\n')
    preload_activity_data()


@app.task(time_limit=600)
def update_randoms_data_task(player_id):
    from warships.data import update_randoms_data
    print(
        f'\n\nUpdating randoms JSON for player_id: {player_id}\n\n')
    update_randoms_data(player_id=player_id)


@app.task(time_limit=600)
def update_tiers_data_task(player_id):
    from warships.data import update_tiers_data
    print('\n\nUpdating tiers JSON\n\n')
    update_tiers_data(player_id=player_id)


@app.task(time_limit=600)
def update_snapshot_data_task(player_id):
    from warships.data import update_snapshot_data
    print(f'\n\nUpdating snapshot JSON for {player_id} \n\n')
    update_snapshot_data(player_id=player_id)


@app.task(time_limit=600)
def update_activity_data_task(chain_rv, player_id):
    from warships.data import update_activity_data
    print(f'\n\nUpdating activity JSON for {player_id} \n\n')
    update_activity_data(player_id=player_id)


@app.task(time_limit=600)
def update_type_data_task(player_id):
    from warships.data import update_type_data
    print('\n\nUpdating type JSON\n\n')
    update_type_data(player_id=player_id)
