import os
import sys
import django
from django.db.models import Count

sys.path.append(os.path.abspath('.'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'battlestats.settings')
django.setup()

if True:
    from warships.models import Ship, Player, Clan, Snapshot

# delete all ships that don't have a name
Ship.objects.filter(name='').delete()
Player.objects.filter(player_id='1').delete()
Player.objects.filter(name='').delete()
Clan.objects.filter(name='').delete()


# set battles_json and tier_json to null for all players
Player.objects.update(activity_updated_at=None)
