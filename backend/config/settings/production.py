from .base import *
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from django.core.exceptions import ImproperlyConfigured

DEBUG = False

# ── Fail fast on dangerous misconfiguration ───────────────────────────────────
# Without AUTH0_DOMAIN, decode_jwt() falls back to UNVERIFIED token decoding
# (dev-only behavior) — in production that would be a total auth bypass.
if not AUTH0_DOMAIN:
    raise ImproperlyConfigured('AUTH0_DOMAIN must be set in production')
if not AUTH0_AUDIENCE:
    raise ImproperlyConfigured('AUTH0_AUDIENCE must be set in production')
if SECRET_KEY == 'dev-secret-key-change-in-production':
    raise ImproperlyConfigured('SECRET_KEY must be set in production')
# Stripe webhooks must be signature-verified in production
if STRIPE_SECRET_KEY and not STRIPE_WEBHOOK_SECRET:
    raise ImproperlyConfigured('STRIPE_WEBHOOK_SECRET must be set when Stripe is enabled')

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration(), CeleryIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
