from django.db import models


class Player(models.Model):
    name = models.CharField(max_length=200)
    player_id = models.IntegerField(null=True, blank=True)
    total_battles = models.IntegerField(null=True, blank=True)
    pvp_battles = models.IntegerField(null=True, blank=True)
    pvp_wins = models.IntegerField(null=True, blank=True)
    pvp_losses = models.IntegerField(null=True, blank=True)
    pvp_ratio = models.FloatField(null=True, blank=True)
    pvp_survival_rate = models.FloatField(null=True, blank=True)
    wins_survival_rate = models.FloatField(null=True, blank=True)
    creation_date = models.DateTimeField(null=True, blank=True)
    days_since_last_battle = models.IntegerField(null=True, blank=True)
    last_battle_date = models.DateField(null=True, blank=True)
    recent_games = models.JSONField(null=True, blank=True)
    clan = models.ForeignKey(
        'Clan', on_delete=models.CASCADE, null=True, blank=True)
    is_hidden = models.BooleanField(default=False)
    stats_updated_at = models.DateTimeField(
        auto_now=False, null=True, blank=True)
    last_fetch = models.DateTimeField(null=True, blank=True)
    last_lookup = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name + " (" + str(self.player_id) + ")"


class Ship(models.Model):
    name = models.CharField(max_length=200)
    nation = models.CharField(max_length=200)
    ship_id = models.IntegerField(unique=True)
    ship_type = models.CharField(max_length=200)
    tier = models.IntegerField(null=True, blank=True)
    is_premium = models.BooleanField(default=False)

    def __str__(self):
        return str(self.ship_id) + " - " + self.name


class Clan(models.Model):
    clan_id = models.IntegerField(unique=True)
    last_fetch = models.DateTimeField(null=True, blank=True)
    leader_id = models.IntegerField(null=True, blank=True)
    leader_name = models.CharField(max_length=200, null=True, blank=True)
    members_count = models.IntegerField(null=True, blank=True)
    name = models.CharField(max_length=200, null=True, blank=True)
    tag = models.CharField(max_length=200, null=True, blank=True)

    def __str__(self):
        return str(self.clan_id) + '-' + self.name


class Snapshot(models.Model):
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    date = models.DateField(null=True, blank=True)
    battles = models.IntegerField(null=True, blank=True)
    wins = models.IntegerField(null=True, blank=True)
    survived_battles = models.IntegerField(null=True, blank=True)
    battle_type = models.CharField(max_length=200, null=True, blank=True)
    last_fetch = models.DateTimeField(null=True, blank=True)
    interval_battles = models.IntegerField(null=True, blank=True)
    interval_wins = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return self.player.name + " - " + str(self.date) + " - " + str(self.battles)
