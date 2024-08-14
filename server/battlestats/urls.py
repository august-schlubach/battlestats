from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from warships.views import PlayerViewSet, ClanViewSet, ShipViewSet, get_monthly_battle_data
from django.conf import settings
from django.conf.urls.static import static

router = routers.DefaultRouter()
router.register(r'player', PlayerViewSet, basename='player')
router.register(r'clan', ClanViewSet, basename='clan')
router.register(r'ship', ShipViewSet, basename='ship')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),  # Include the router URLs
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
    path('api/player/get_monthly_battle_data/<str:player_id>/',
         get_monthly_battle_data, name='get_monthly_battle_data'),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.STATIC_ROOT)
