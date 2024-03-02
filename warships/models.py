from typing import Any
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

    def __str__(self):
        return self.name + " (" + self.player_id + ")"


class Ship(models.Model):
    ship_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=200)
    nation = models.CharField(max_length=200)
    is_premium = models.BooleanField(default=False)
    ship_type = models.CharField(max_length=200)

    def __str__(self):
        return self.name
