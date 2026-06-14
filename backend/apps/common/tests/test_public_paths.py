"""
Regression tests for middleware public-path routing.

Locks in the 2026-06-10 fixes: the vendor magic-link upload and the Stripe
webhook must be reachable without a JWT; everything tenant-scoped must not be.
"""
from apps.common.middleware import is_public_path


class TestPublicPaths:
    def test_magic_upload_is_public(self):
        assert is_public_path('/api/magic-upload/some-token-123/')

    def test_stripe_webhook_is_public(self):
        assert is_public_path('/api/billing/webhook/')

    def test_health_and_register_are_public(self):
        assert is_public_path('/api/health/')
        assert is_public_path('/api/register/')

    def test_tenant_endpoints_require_auth(self):
        for path in [
            '/api/documents/',
            '/api/vendors/',
            '/api/dashboard/',
            '/api/billing/status/',
            '/api/billing/checkout/',
            '/api/renewals/send/some-id/',
            '/api/requirement-profiles/',
            '/api/me/',
        ]:
            assert not is_public_path(path), f'{path} must NOT be public'
