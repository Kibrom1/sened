"""
Test settings — fast, no external services required.
Uses SQLite in-memory so tests run without Docker or a live Postgres instance.
"""
from .base import *

DEBUG = False

# In-memory SQLite — no Docker required for tests
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Disable Celery task execution during tests — tasks can be tested with CELERY_TASK_ALWAYS_EAGER
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'

# Speed up password hashing in tests
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# Silence most logging during tests
LOGGING = {}

# No Sentry noise during tests
SENTRY_DSN = ''
