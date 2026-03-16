import json

from django.core.management.base import BaseCommand

from warships.landing import warm_landing_page_content


class Command(BaseCommand):
    help = 'Warm landing page cache entries used on first load.'

    def handle(self, *args, **options):
        result = warm_landing_page_content()
        self.stdout.write(json.dumps(result, sort_keys=True))
