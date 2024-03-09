from django.contrib import admin
from .models import Player, Ship, RecentLookup, Clan

admin.site.register(Player)
admin.site.register(Ship)
admin.site.register(RecentLookup)
admin.site.register(Clan)
