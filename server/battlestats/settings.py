import re
from pathlib import Path
import os
import logging.config
import socket

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# print the BASE_DIR
print(f"BASE_DIR: {BASE_DIR}")

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() in ('true', '1', 't')

ALLOWED_HOSTS = os.getenv(
    'DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost,battlestats.io,159.89.242.69,138.197.75.47').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.humanize',
    'corsheaders',
    'celery',
    'django_celery_beat',
    'rest_framework',
    'warships',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'battlestats.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': ["templates/"],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'battlestats.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.{}'.format(
            os.getenv('DB_ENGINE', 'sqlite3')
        ),
        'NAME': os.getenv('DB_NAME', BASE_DIR / 'db.sqlite3'),
        'USER': os.getenv('DB_USERNAME', 'django'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'django'),
        'HOST': os.getenv('DB_HOST', '127.0.0.1'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}

# print the db name, user, host, and port
print(f"DB_NAME: {DATABASES['default']['NAME']}")
print(f"DB_USER: {DATABASES['default']['USER']}")
print(f"DB_HOST: {DATABASES['default']['HOST']}")
print(f"DB_PORT: {DATABASES['default']['PORT']}")

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
# https://docs.djangoproject.com/en/5.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True
USE_TZ = False

STATIC_URL = '/static/'

# STATICFILES_DIRS should not include STATIC_ROOT
STATICFILES_DIRS = [
    BASE_DIR / "staticfiles",
]

docker_id_pattern = r'^[a-fA-F0-9]{12}$'
# if re.match(docker_id_pattern, socket.gethostname()):
#     print("---> Using settings for Docker containers")
#     STATIC_ROOT = '/var/www/static/'
# else:
STATIC_ROOT = BASE_DIR / 'static'

STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
CORS_ALLOWED_ORIGINS = [
    'http://localhost:8888',
    'http://localhost:8181',
    'http://localhost:3001',
]

LOGGING_CONFIG = None

# Get loglevel from env
LOGLEVEL = os.getenv('DJANGO_LOGLEVEL', 'INFO').upper()

# Create logs directory if it doesn't exist
BASE_LOG_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = BASE_LOG_DIR / 'logs'
LOG_DIR.mkdir(exist_ok=True)

# Determine if running in Docker
is_docker = re.match(docker_id_pattern, socket.gethostname())

logging.config.dictConfig({
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'console': {
            'format': '%(asctime)s %(levelname)s [%(name)s:%(lineno)s] %(module)s %(process)d %(thread)d %(message)s',
        },
        'file': {
            'format': '%(asctime)s %(levelname)s [%(name)s:%(lineno)s] %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'console',
        },
        'file': {
            'class': 'logging.FileHandler',
            'formatter': 'file',
            'filename': LOG_DIR / 'django.log',
        },
    },
    'loggers': {
        '': {
            'level': LOGLEVEL,
            'handlers': ['console'] if is_docker else ['console', 'file'],
        },
    },
})


# Celery settings
CELERY_BROKER_URL = 'amqp://guest:guest@rabbitmq:5672//'  # Use RabbitMQ
CELERY_RESULT_BACKEND = 'rpc://'  # Use RPC backend for results
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ]
}
