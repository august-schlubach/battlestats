import logging
import math
from django.http import Http404, JsonResponse
from rest_framework import generics, permissions, viewsets
from warships.models import Player, Clan, Ship
from warships.serializers import PlayerSerializer, ClanSerializer, ShipSerializer, BattleDataSerializer, TierDataSerializer
from warships.utils.data import fetch_snapshot_data, fetch_battle_data


logging.basicConfig(level=logging.INFO)


class PlayerViewSet(viewsets.ModelViewSet):
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    permission_classes = [permissions.AllowAny]

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]
        try:
            obj = Player.objects.get(name__iexact=lookup_field_value)
        except Player.DoesNotExist:
            raise Http404("Player matching query does not exist.")
        self.check_object_permissions(self.request, obj)
        return obj


class PlayerDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    lookup_field = 'name'
    permission_classes = [permissions.AllowAny]


class ClanViewSet(viewsets.ModelViewSet):
    queryset = Clan.objects.all()
    serializer_class = ClanSerializer
    permission_classes = [permissions.AllowAny]


class ClanDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Clan.objects.all()
    serializer_class = ClanSerializer
    permission_classes = [permissions.AllowAny]


class ShipViewSet(viewsets.ModelViewSet):
    queryset = Ship.objects.all()
    serializer_class = ShipSerializer
    permission_classes = [permissions.AllowAny]


class ShipDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Ship.objects.all()
    serializer_class = ShipSerializer
    permission_classes = [permissions.AllowAny]


def monthly_activity_data(request, player_id: str) -> JsonResponse:
    # fetch battle data for a given player and prepare it for display
    print(f'Fetching battle data for player_id: {player_id}')

    try:
        # Ensure the player exists
        Player.objects.get(player_id=player_id)
    except Player.DoesNotExist:
        return JsonResponse({'error': 'Player not found'}, status=404)

    df = fetch_snapshot_data(player_id)

    battle_data = []
    for index, row in df.iterrows():
        battles = row['battles']
        if math.isnan(battles):
            battles = 0

        wins = row['wins']
        if math.isnan(wins):
            wins = 0

        battle_data.append({
            'date': row['date'],
            'battles': int(battles),
            'wins': int(wins)
        })

    serializer = BattleDataSerializer(battle_data, many=True)
    return JsonResponse(serializer.data, safe=False)


def tier_data(request, player_id: str) -> JsonResponse:
    # fetch battle data for a given player and prepare it for display
    print(f'Fetching battle data for player_id: {player_id}')

    try:
        # Ensure the player exists
        Player.objects.get(player_id=player_id)
    except Player.DoesNotExist:
        return JsonResponse({'error': 'Player not found'}, status=404)

    df = fetch_battle_data(player_id)
    df = df.filter(['ship_tier', 'pvp_battles', 'wins'])

    data = []
    for i in range(1, 12):
        j = 12 - i  # reverse the tier order
        battles = int(df.loc[df['ship_tier'] == 12 - i, 'pvp_battles'].sum())
        wins = int(df.loc[df['ship_tier'] == 12 - i, 'wins'].sum())
        wr = round(wins / battles if battles > 0 else 0, 2)
        data.append({
            'ship_tier': 12 - i,
            'pvp_battles': battles,
            'wins': wins,
            'win_ratio': wr
        })

    serializer = TierDataSerializer(data, many=True)
    return JsonResponse(serializer.data, safe=False)
