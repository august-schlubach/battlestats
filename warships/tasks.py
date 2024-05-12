from warships.models import Clan, Player
from warships.utils.data import _fetch_clan_member_ids, _fetch_player_data_from_list, populate_new_player
import datetime
from celery import task
import logging

logging.basicConfig(level=logging.INFO)

@task
def populate_clan(clan_id: str) -> None:
    logging.info(f'Delayed task: Populating clan {clan_id}')
    clan = Clan.objects.get(clan_id=clan_id)
    if clan.last_fetch is None or (datetime.datetime.now() - clan.last_fetch).days > 1:
        clan_members = _fetch_clan_member_ids(str(clan_id))
        local_members = Player.objects.filter(clan__clan_id=clan_id).count()
        if local_members < len(clan_members):
            logging.info(
                'Clan contains more members than database: fetching new data')
            player_data = _fetch_player_data_from_list(clan_members)
            for p in player_data:
                player, created = Player.objects.get_or_create(
                    player_id=int(p))
                if created:
                    player.player_id = p
                    player = populate_new_player(
                        player, player_data[p], clan_id)
        else:
            logging.info('Clan data updated: no changes needed')

        clan.last_fetch = datetime.datetime.now()
        clan.save()