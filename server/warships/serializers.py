from rest_framework import serializers
from .models import Player, Clan, Ship


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = '__all__'


class ClanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clan
        fields = '__all__'


class ShipSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ship
        fields = '__all__'


class ActivityDataSerializer(serializers.Serializer):
    date = serializers.DateField()
    battles = serializers.IntegerField()
    wins = serializers.IntegerField()


class TierDataSerializer(serializers.Serializer):
    ship_tier = serializers.IntegerField()
    pvp_battles = serializers.IntegerField()
    wins = serializers.IntegerField()
    win_ratio = serializers.FloatField()


class TypeDataSerializer(serializers.Serializer):
    ship_type = serializers.CharField()
    pvp_battles = serializers.IntegerField()
    wins = serializers.IntegerField()
    win_ratio = serializers.FloatField()


class RandomsDataSerializer(serializers.Serializer):
    pvp_battles = serializers.IntegerField()
    ship_name = serializers.CharField()
    win_ratio = serializers.FloatField()
    wins = serializers.IntegerField()
