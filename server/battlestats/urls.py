from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from warships.views import PlayerViewSet

router = routers.DefaultRouter()
router.register(r'player', PlayerViewSet, basename='player')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),  # Include the router URLs
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
]
