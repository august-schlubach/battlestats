from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase


class WarmLandingPageContentCommandTests(TestCase):
    @patch('warships.management.commands.warm_landing_page_content.warm_landing_page_content')
    def test_command_outputs_warm_summary(self, mock_warm_landing_page_content):
        mock_warm_landing_page_content.return_value = {
            'status': 'completed',
            'warmed': {'clans': 4, 'recent_clans': 3, 'players_best': 1, 'players_random': 40, 'recent_players': 12},
        }
        stdout = StringIO()

        call_command('warm_landing_page_content', stdout=stdout)

        self.assertIn('"status": "completed"', stdout.getvalue())
        self.assertIn('"players_random": 40', stdout.getvalue())
