import json
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django.utils import timezone

from warships.data import _ranked_rows_have_top_ship, update_ranked_data
from warships.models import Player


DEFAULT_STATE_FILE = Path(settings.BASE_DIR) / 'logs' / \
    'backfill_ranked_data_state.json'


def _default_state() -> dict:
    return {
        'version': 1,
        'last_player_id': 0,
        'processed_total': 0,
        'succeeded_total': 0,
        'error_total': 0,
        'failed_player_ids': [],
        'last_error': None,
        'updated_at': None,
        'completed_at': None,
    }


def _load_state(state_path: Path, reset_state: bool = False) -> dict:
    if reset_state or not state_path.exists():
        return _default_state()

    try:
        loaded = json.loads(state_path.read_text())
    except json.JSONDecodeError as error:
        raise CommandError(
            f'Unable to parse state file {state_path}: {error}') from error

    state = _default_state()
    if isinstance(loaded, dict):
        state.update(loaded)
    state['failed_player_ids'] = [
        int(player_id) for player_id in state.get('failed_player_ids', [])
        if isinstance(player_id, int) or str(player_id).isdigit()
    ]
    state['last_player_id'] = int(state.get('last_player_id') or 0)
    return state


def _save_state(state_path: Path, state: dict) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {**state, 'updated_at': timezone.now().isoformat()}
    temp_path = state_path.with_suffix(f'{state_path.suffix}.tmp')
    temp_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + '\n')
    temp_path.replace(state_path)


class Command(BaseCommand):
    help = 'Backfill ranked_json for players with a durable checkpoint that can resume after interruption.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional maximum number of player attempts to process in this run.',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=100,
            help='Iterator batch size and progress-report interval.',
        )
        parser.add_argument(
            '--state-file',
            default=str(DEFAULT_STATE_FILE),
            help='Path to the JSON checkpoint file used for resumable progress.',
        )
        parser.add_argument(
            '--reset-state',
            action='store_true',
            help='Ignore any existing checkpoint and start again from the beginning.',
        )
        parser.add_argument(
            '--refresh-older-than-hours',
            type=int,
            default=0,
            help='Also refresh players whose ranked data is older than this many hours.',
        )
        parser.add_argument(
            '--include-hidden',
            action='store_true',
            help='Include hidden players instead of only visible players.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Process all players in scope, even if they already have ranked data.',
        )
        parser.add_argument(
            '--max-errors',
            type=int,
            default=25,
            help='Abort the run after this many errors in a single invocation.',
        )

    def handle(self, *args, **options):
        limit = max(int(options['limit']), 0)
        batch_size = max(int(options['batch_size']), 1)
        refresh_older_than_hours = max(
            int(options['refresh_older_than_hours']), 0)
        max_errors = max(int(options['max_errors']), 1)
        include_hidden = bool(options['include_hidden'])
        force = bool(options['force'])
        state_path = Path(options['state_file']).expanduser().resolve()
        stale_cutoff = None
        if refresh_older_than_hours > 0:
            stale_cutoff = timezone.now() - timedelta(hours=refresh_older_than_hours)

        state = _load_state(
            state_path, reset_state=bool(options['reset_state']))
        attempted_this_run = 0
        succeeded_this_run = 0
        errors_this_run = 0

        def record_success(player: Player, *, advance_checkpoint: bool) -> None:
            nonlocal attempted_this_run, succeeded_this_run
            attempted_this_run += 1
            succeeded_this_run += 1
            state['processed_total'] += 1
            state['succeeded_total'] += 1
            state['last_error'] = None
            if advance_checkpoint:
                state['last_player_id'] = player.id
            failed_ids = [
                player_id for player_id in state['failed_player_ids'] if player_id != player.id]
            state['failed_player_ids'] = failed_ids
            state['completed_at'] = None
            _save_state(state_path, state)

        def record_error(player: Player, error: Exception, *, advance_checkpoint: bool) -> None:
            nonlocal attempted_this_run, errors_this_run
            attempted_this_run += 1
            errors_this_run += 1
            state['processed_total'] += 1
            state['error_total'] += 1
            state['last_error'] = f'{player.id}:{player.player_id}:{error}'
            if advance_checkpoint:
                state['last_player_id'] = player.id
            failed_ids = [
                player_id for player_id in state['failed_player_ids'] if player_id != player.id]
            failed_ids.append(player.id)
            state['failed_player_ids'] = failed_ids
            state['completed_at'] = None
            _save_state(state_path, state)

        def should_stop() -> bool:
            return (limit and attempted_this_run >= limit) or errors_this_run >= max_errors

        def needs_ranked_backfill(player: Player) -> bool:
            if force:
                return True

            if player.ranked_json is None or player.ranked_updated_at is None:
                return True

            if stale_cutoff is not None and player.ranked_updated_at < stale_cutoff:
                return True

            if player.ranked_json and not _ranked_rows_have_top_ship(player.ranked_json):
                return True

            return False

        pending_failures = list(dict.fromkeys(int(player_id)
                                for player_id in state.get('failed_player_ids', [])))
        if pending_failures:
            self.stdout.write(
                f'Retrying {len(pending_failures)} previously failed player(s) from {state_path} before continuing.'
            )

        for player in Player.objects.filter(id__in=pending_failures).order_by('id'):
            if should_stop():
                break
            try:
                update_ranked_data(player.player_id)
                record_success(player, advance_checkpoint=False)
            except Exception as error:
                self.stderr.write(
                    f'Failed retry for {player.name} ({player.player_id}): {error}')
                record_error(player, error, advance_checkpoint=False)

            if attempted_this_run % batch_size == 0:
                self.stdout.write(
                    f'Attempted {attempted_this_run} players in this run...')

        if not should_stop():
            queryset = Player.objects.exclude(
                player_id__isnull=True).order_by('id')
            if not include_hidden:
                queryset = queryset.filter(is_hidden=False)

            queryset = queryset.filter(id__gt=state['last_player_id'])

            for player in queryset.iterator(chunk_size=batch_size):
                if should_stop():
                    break

                if not needs_ranked_backfill(player):
                    continue

                try:
                    update_ranked_data(player.player_id)
                    record_success(player, advance_checkpoint=True)
                except Exception as error:
                    self.stderr.write(
                        f'Failed ranked backfill for {player.name} ({player.player_id}): {error}')
                    record_error(player, error, advance_checkpoint=True)

                if attempted_this_run % batch_size == 0:
                    self.stdout.write(
                        f'Attempted {attempted_this_run} players in this run...')

        if errors_this_run >= max_errors:
            self.stderr.write(self.style.WARNING(
                f'Aborting after {errors_this_run} errors in this run. Resume with the same --state-file.'
            ))

        if not state['failed_player_ids'] and not should_stop():
            state['completed_at'] = timezone.now().isoformat()
            _save_state(state_path, state)

        self.stdout.write(self.style.SUCCESS(
            'Ranked backfill run complete: '
            f'attempted={attempted_this_run}, '
            f'succeeded={succeeded_this_run}, '
            f'errors={errors_this_run}, '
            f'last_player_id={state["last_player_id"]}, '
            f'failed_pending={len(state["failed_player_ids"])}'
        ))
