"""
URL configuration for battlestats project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from warships import views


urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.splash, name='splash'),
    path('warships/player/<str:name>', views.player, name='player'),
    path('warships/player/load_activity_data/<str:player_id>:<str:ship_type>:<str:ship_tier>',
         views.load_activity_data, name='load_activity_data'),
    path('warships/clan/plot/<str:clan_id>',
         views.load_clan_plot_data, name='load_clan_plot_data'),
    path('warships/clan/<str:clan_id>', views.clan, name='clan'),
]
