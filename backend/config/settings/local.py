"""
Local development settings using SQLite — no Docker/Postgres needed.
Use: DJANGO_SETTINGS_MODULE=config.settings.local python manage.py runserver
"""
from .base import *

DEBUG = True
ALLOWED_HOSTS = ['*']

# SQLite — zero setup required
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': '/tmp/sened.sqlite3',
    }
}

# Stub Redis with an in-memory backend so Celery imports don't error
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'

CORS_ALLOW_ALL_ORIGINS = True

# Disable Sentry locally
SENTRY_DSN = ''

# Skip Auth0 JWKS fetch (no real Auth0 tenant needed for local UI preview)
AUTH0_DOMAIN = ''
AUTH0_AUDIENCE = ''
