import logging
from django.http import Http404, JsonResponse
from rest_framework import generics, permissions, viewsets
from warships.models import Player, Clan, Ship
from warships.serializers import PlayerSerializer, ClanSerializer, ShipSerializer, ActivityDataSerializer, TierDataSerializer, TypeDataSerializer, RandomsDataSerializer, ClanDataSerializer
from warships.data import fetch_tier_data, fetch_activity_data, fetch_type_data, fetch_randoms_data, fetch_clan_data
from .tasks import update_clan_data_task, update_player_data_task, update_clan_members_task

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

        update_player_data_task.delay(player_id=obj.player_id)

        if obj.clan:
            clan = obj.clan
            logging.info(
                f'Updating clan data: {obj.name} : {clan.name} {obj.player_id}')
            update_clan_data_task.delay(clan_id=clan.clan_id)
            update_clan_members_task.delay(clan_id=clan.clan_id)
        return obj


class PlayerDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    lookup_field = 'name'
    permission_classes = [permissions.AllowAny]


class ClanViewSet(viewsets.ModelViewSet):
    queryset = Clan.objects.all()
    serializer_class = ClanSerializer
    lookup_field = 'clan_id'
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


def tier_data(request, player_id: str) -> JsonResponse:
    data = fetch_tier_data(player_id)
    serializer = TierDataSerializer(data=data, many=True)
    if serializer.is_valid():
        return JsonResponse(serializer.data, safe=False)
    return JsonResponse(serializer.errors, status=400)


def activity_data(request, player_id: str) -> JsonResponse:
    data = fetch_activity_data(player_id)
    serializer = ActivityDataSerializer(data=data, many=True)
    if serializer.is_valid():
        return JsonResponse(serializer.data, safe=False)
    return JsonResponse(serializer.errors, status=400)


def type_data(request, player_id: str) -> JsonResponse:
    data = fetch_type_data(player_id)
    serializer = TypeDataSerializer(data=data, many=True)
    if serializer.is_valid():
        return JsonResponse(serializer.data, safe=False)
    return JsonResponse(serializer.errors, status=400)


def randoms_data(request, player_id: str) -> JsonResponse:
    data = fetch_randoms_data(player_id)
    serializer = RandomsDataSerializer(data=data, many=True)
    if serializer.is_valid():
        return JsonResponse(serializer.data, safe=False)
    return JsonResponse(serializer.errors, safe=False, status=400)


def clan_data(request, clan_id: str) -> JsonResponse:
    data = fetch_clan_data(clan_id)
    serializer = ClanDataSerializer(data=data, many=True)
    if serializer.is_valid():
        return JsonResponse(serializer.data, safe=False)
    return JsonResponse(serializer.errors, safe=False, status=400)
