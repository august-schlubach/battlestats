from django.apps import AppConfig


class WarshipsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'warships'

    def ready(self):
        from . import signals  # noqa: F401
