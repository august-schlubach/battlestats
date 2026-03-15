from unittest import TestCase
from unittest.mock import patch

from battlestats.env import load_env_file, resolve_db_host, resolve_db_user


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

    @patch.dict('os.environ', {'DB_HOST': 'db'}, clear=False)
    @patch('battlestats.env.running_in_container', return_value=False)
    def test_resolve_db_host_maps_docker_service_name_to_localhost_for_host_runs(self, _mock_running):
        self.assertEqual(resolve_db_host(), '127.0.0.1')

    @patch.dict('os.environ', {'DB_HOST': 'db'}, clear=False)
    @patch('battlestats.env.running_in_container', return_value=True)
    def test_resolve_db_host_keeps_docker_service_name_in_container(self, _mock_running):
        self.assertEqual(resolve_db_host(), 'db')

    @patch.dict('os.environ', {'DB_USER': 'compose-user'}, clear=True)
    def test_resolve_db_user_accepts_db_user(self):
        self.assertEqual(resolve_db_user(), 'compose-user')

    @patch.dict('os.environ', {'DB_USERNAME': 'settings-user', 'DB_USER': 'compose-user'}, clear=True)
    def test_resolve_db_user_prefers_db_username_when_present(self):
        self.assertEqual(resolve_db_user(), 'settings-user')
