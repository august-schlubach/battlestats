import json
from datetime import date

from django.core.management.base import BaseCommand, CommandError

from warships.visit_analytics import rebuild_entity_visit_daily


def _parse_optional_date(raw_value: str | None, label: str):
    if not raw_value:
        return None
    try:
        return date.fromisoformat(raw_value)
    except ValueError as error:
        raise CommandError(f'{label} must be YYYY-MM-DD.') from error


class Command(BaseCommand):
    help = 'Rebuild EntityVisitDaily rows from raw EntityVisitEvent data.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--start-date', help='Optional inclusive start date in YYYY-MM-DD format.')
        parser.add_argument(
            '--end-date', help='Optional inclusive end date in YYYY-MM-DD format.')
        parser.add_argument(
            '--entity-type', choices=['player', 'clan'], help='Optional entity type scope.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Preview the rebuild scope without writing rows.')

    def handle(self, *args, **options):
        start_date = _parse_optional_date(
            options.get('start_date'), 'start-date')
        end_date = _parse_optional_date(options.get('end_date'), 'end-date')
        if start_date and end_date and start_date > end_date:
            raise CommandError('start-date cannot be after end-date.')

        result = rebuild_entity_visit_daily(
            start_date=start_date,
            end_date=end_date,
            entity_type=options.get('entity_type'),
            dry_run=bool(options.get('dry_run')),
        )
        self.stdout.write(json.dumps(result, indent=2, sort_keys=True))
