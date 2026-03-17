import json

from django.core.management.base import BaseCommand, CommandError

from warships.visit_analytics import cleanup_entity_visit_events


class Command(BaseCommand):
    help = 'Delete old EntityVisitEvent rows while keeping EntityVisitDaily aggregates intact.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--older-than-days',
            type=int,
            required=True,
            help='Delete raw event rows older than this many days.',
        )
        parser.add_argument('--dry-run', action='store_true',
                            help='Preview the deletion count without deleting rows.')

    def handle(self, *args, **options):
        older_than_days = int(options['older_than_days'])
        if older_than_days < 1:
            raise CommandError('older-than-days must be at least 1.')

        result = cleanup_entity_visit_events(
            older_than_days=older_than_days,
            dry_run=bool(options.get('dry_run')),
        )
        self.stdout.write(json.dumps(result, indent=2, sort_keys=True))
