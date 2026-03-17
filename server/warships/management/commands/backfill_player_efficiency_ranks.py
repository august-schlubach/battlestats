import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from warships.data import recompute_efficiency_rank_snapshot


DEFAULT_REPORT_FILE = Path(settings.BASE_DIR) / \
    'logs' / 'player_efficiency_rank_report.json'


class Command(BaseCommand):
    help = 'Recompute player efficiency-rank snapshot data and emit a threshold-analysis report.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional maximum number of players to include in this run.',
        )
        parser.add_argument(
            '--skip-refresh',
            action='store_true',
            help='Reuse existing explorer summaries instead of refreshing local summary inputs first.',
        )
        parser.add_argument(
            '--publish-partial',
            action='store_true',
            help='Allow a limited run to publish live tier fields. By default limited runs are analysis-only.',
        )
        parser.add_argument(
            '--report-file',
            default=str(DEFAULT_REPORT_FILE),
            help='Optional path for a JSON analysis report. Use an empty string to skip writing the file.',
        )

    def handle(self, *args, **options):
        player_limit = max(int(options['limit']), 0)
        publish_partial = bool(options['publish_partial'])
        if player_limit <= 0 and publish_partial:
            raise CommandError(
                '--publish-partial is only valid when --limit is set.')

        report = recompute_efficiency_rank_snapshot(
            player_limit=player_limit,
            skip_refresh=bool(options['skip_refresh']),
            publish_partial=publish_partial,
        )

        report_file = str(options['report_file']).strip()
        if report_file:
            report_path = Path(report_file).expanduser().resolve()
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(
                report, indent=2, sort_keys=True) + '\n')

        self.stdout.write(json.dumps(report, indent=2, sort_keys=True))
