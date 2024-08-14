from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from warships.views import PlayerViewSet
from django.conf import settings
from django.conf.urls.static import static

router = routers.DefaultRouter()
router.register(r'player', PlayerViewSet, basename='player')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),  # Include the router URLs
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.STATIC_ROOT)
