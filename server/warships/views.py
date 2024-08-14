from rest_framework import generics
from warships.models import Player
from warships.serializers import PlayerSerializer
import logging
from rest_framework import viewsets
from rest_framework import permissions
from django.http import Http404

logging.basicConfig(level=logging.INFO)


class PlayerViewSet(viewsets.ModelViewSet):
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    permission_classes = [permissions.AllowAny]

    def get_object(self):
        lookup_field_value = self.kwargs[self.lookup_field]
        try:
            obj = Player.objects.get(name=lookup_field_value)
        except Player.DoesNotExist:
            raise Http404("Player matching query does not exist.")
        self.check_object_permissions(self.request, obj)
        return obj


class PlayerDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer
    lookup_field = 'name'
    permission_classes = [permissions.AllowAny]
