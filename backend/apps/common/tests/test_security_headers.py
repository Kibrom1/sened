"""Tests for SecurityHeadersMiddleware (CSP + hardening headers)."""
from django.http import HttpResponse

from apps.common.middleware import (
    CSP_POLICY,
    PERMISSIONS_POLICY,
    SecurityHeadersMiddleware,
)


def _run(initial=None):
    def get_response(request):
        resp = HttpResponse('ok')
        for k, v in (initial or {}).items():
            resp[k] = v
        return resp

    mw = SecurityHeadersMiddleware(get_response)
    return mw(object())  # request is unused by the middleware


class TestSecurityHeadersMiddleware:
    def test_sets_all_headers(self):
        resp = _run()
        assert resp['Content-Security-Policy'] == CSP_POLICY
        assert resp['Permissions-Policy'] == PERMISSIONS_POLICY
        assert resp['X-Content-Type-Options'] == 'nosniff'
        assert resp['Referrer-Policy'] == 'strict-origin-when-cross-origin'

    def test_csp_blocks_framing_and_defaults_none(self):
        resp = _run()
        csp = resp['Content-Security-Policy']
        assert "frame-ancestors 'none'" in csp
        assert csp.startswith("default-src 'none'")

    def test_does_not_override_existing_header(self):
        resp = _run(initial={'Content-Security-Policy': "default-src 'self'"})
        assert resp['Content-Security-Policy'] == "default-src 'self'"
