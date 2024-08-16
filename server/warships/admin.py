from django.contrib import admin
from .models import Player, Ship, Clan, Snapshot


class PlayerAdmin(admin.ModelAdmin):
    exclude = ('battles_json', 'tier')  # Exclude the battles_json field


admin.site.register(Player, PlayerAdmin)
admin.site.register(Ship)
admin.site.register(Snapshot)
admin.site.register(Clan)
