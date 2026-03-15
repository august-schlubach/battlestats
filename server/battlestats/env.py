import os
from pathlib import Path

import dotenv


def load_env_file(path: str) -> None:
    if hasattr(dotenv, 'read_dotenv'):
        dotenv.read_dotenv(path)
        return

    if hasattr(dotenv, 'load_dotenv'):
        dotenv.load_dotenv(path)


def running_in_container() -> bool:
    return Path('/.dockerenv').exists()


def resolve_db_user() -> str:
    return (os.getenv('DB_USERNAME') or os.getenv('DB_USER') or 'django').strip()


def resolve_db_host() -> str:
    host = (os.getenv('DB_HOST') or '127.0.0.1').strip()
    if host != 'db' or running_in_container():
        return host
    return '127.0.0.1'
