from django.contrib import admin
from .models import Player, Ship, RecentLookup, Clan, Snapshot

admin.site.register(Player)
admin.site.register(Ship)
admin.site.register(Snapshot)
admin.site.register(Clan)
admin.site.register(RecentLookup)
