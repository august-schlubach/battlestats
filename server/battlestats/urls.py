from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from warships.views import PlayerViewSet, ClanViewSet, ShipViewSet
from warships.views import tier_data, activity_data, type_data, randoms_data, clan_members
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
    path('api/fetch/tier_data/<str:player_id>/',
         tier_data, name='fetch_tier_data'),
    path('api/fetch/activity_data/<str:player_id>/',
         activity_data, name='fetch_activity_data'),
    path('api/fetch/type_data/<str:player_id>/',
         type_data, name='fetch_type_data'),
    path('api/fetch/randoms_data/<str:player_id>/',
         randoms_data, name='fetch_randoms_data'),
    path('api/fetch/clan_members/<str:clan_id>/',
         clan_members, name='fetch_clan_members'),

]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.STATIC_ROOT)
