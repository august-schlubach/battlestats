from unittest import TestCase
from unittest.mock import patch

from battlestats.env import load_env_file


class EnvBootstrapTests(TestCase):
    @patch('battlestats.env.dotenv')
    def test_load_env_file_prefers_read_dotenv_when_available(self, mock_dotenv):
        mock_dotenv.read_dotenv = object()
        mock_dotenv.load_dotenv = object()

        with patch.object(mock_dotenv, 'read_dotenv') as mock_read, patch.object(mock_dotenv, 'load_dotenv') as mock_load:
            load_env_file('.env')

        mock_read.assert_called_once_with('.env')
        mock_load.assert_not_called()

    @patch('battlestats.env.dotenv')
    def test_load_env_file_falls_back_to_load_dotenv(self, mock_dotenv):
        if hasattr(mock_dotenv, 'read_dotenv'):
            del mock_dotenv.read_dotenv
        mock_dotenv.load_dotenv = object()

        with patch.object(mock_dotenv, 'load_dotenv') as mock_load:
            load_env_file('.env')

        mock_load.assert_called_once_with('.env')