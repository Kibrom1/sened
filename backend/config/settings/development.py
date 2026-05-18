from .base import *

DEBUG = True
ALLOWED_HOSTS = ['*']

# Local Postgres via docker-compose
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'sened',
        'USER': 'postgres',
        'PASSWORD': 'postgres',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

# Local Redis via docker-compose
CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'

CORS_ALLOW_ALL_ORIGINS = True

# Disable Sentry in development
SENTRY_DSN = ''

# Log SQL queries
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {
        'django.db.backends': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
    },
}
