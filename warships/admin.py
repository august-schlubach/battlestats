from django.contrib import admin
from .models import Player, Ship, RecentLookup

admin.site.register(Player)
admin.site.register(Ship)
admin.site.register(RecentLookup)
