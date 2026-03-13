import dotenv


def load_env_file(path: str) -> None:
    if hasattr(dotenv, 'read_dotenv'):
        dotenv.read_dotenv(path)
        return

    if hasattr(dotenv, 'load_dotenv'):
        dotenv.load_dotenv(path)