from __future__ import absolute_import, unicode_literals
from battlestats.celery import app
from warships.data import update_clan_data, update_player_data, update_clan_members
from warships.models import Player


@app.task
def hello_world():
    print('Hello World!')


@app.task(time_limit=600)
def update_clan_data_task(clan_id):
    print(
        f'\n\nStarting async task: update_clan_data_task for clan_id: {clan_id}\n\n')

    update_clan_data(clan_id=clan_id)


@app.task(time_limit=600)
def update_clan_members_task(clan_id):
    print(
        f'\n\nStarting async task: update_clan_members_task for clan_id: {clan_id}\n\n')

    update_clan_members(clan_id=clan_id)


@app.task(time_limit=600)
def update_player_data_task(player_id):
    print(
        f'\n\nStarting async task: update_player_data_task for player_id: {player_id}\n\n')
    player = Player.objects.get(player_id=player_id)
    update_player_data(player=player)
