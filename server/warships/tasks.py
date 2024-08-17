from __future__ import absolute_import, unicode_literals
from battlestats.celery import app
from warships.data import update_clan_data


@app.task
def hello_world():
    print('Hello World!')


@app.task
def update_clan_data_task(clan_id):
    update_clan_data(clan_id=clan_id)
