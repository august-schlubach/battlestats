from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from warships.views import PlayerViewSet, ClanViewSet, ShipViewSet, monthly_activity_data, tier_data
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
    path('api/fetch/monthly_activity_data/<str:player_id>/',
         monthly_activity_data, name='fetch_monthly_battle_data'),
    path('api/fetch/tier_data/<str:player_id>/',
         tier_data, name='fetch_tier_data')
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.STATIC_ROOT)
