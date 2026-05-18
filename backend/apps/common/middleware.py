import jwt
import time
import requests
from django.conf import settings
from django.http import JsonResponse
from apps.organizations.models import User

# Public paths that do not require authentication
PUBLIC_PATHS = {
    '/api/health/',
    '/admin/',
    '/api/register/',
}

def is_public_path(path: str) -> bool:
    if path.startswith('/upload/'):
        return True
    if path.startswith('/api/webhooks/'):
        return True
    if path.startswith('/api/internal/'):
        return True
    return any(path.startswith(p) for p in PUBLIC_PATHS)


# JWKS cache: refreshes after 1 hour or when a key ID is missing (key rotation)
_jwks_cache: dict = {'data': None, 'fetched_at': 0.0}
_JWKS_TTL = 3600  # seconds


def _fetch_jwks_from_auth0() -> dict | None:
    if not settings.AUTH0_DOMAIN:
        return None
    url = f'https://{settings.AUTH0_DOMAIN}/.well-known/jwks.json'
    resp = requests.get(url, timeout=5)
    resp.raise_for_status()
    return resp.json()


def get_jwks(force_refresh: bool = False) -> dict | None:
    """
    Fetch Auth0 JWKS — cached for 1 hour.
    Pass force_refresh=True on a key-not-found error to handle key rotation
    without requiring a process restart.
    """
    now = time.time()
    if (
        force_refresh
        or _jwks_cache['data'] is None
        or (now - _jwks_cache['fetched_at']) > _JWKS_TTL
    ):
        _jwks_cache['data'] = _fetch_jwks_from_auth0()
        _jwks_cache['fetched_at'] = now
    return _jwks_cache['data']


def decode_jwt(token: str) -> dict:
    """Validate and decode an Auth0 JWT. Returns the payload or raises."""
    # A JWT has exactly 3 segments (2 dots). An opaque token does not.
    # We bypass validation in dev-only mode when AUTH0_DOMAIN is not configured.
    if len(token.split('.')) != 3:
        if settings.AUTH0_DOMAIN:
            raise jwt.InvalidTokenError('Opaque token received; ensure VITE_AUTH0_AUDIENCE is set.')
        return {'sub': 'local-dev-bypass'}

    jwks = get_jwks()
    if jwks is None:
        # Dev mode with no Auth0 configured — decode without verification
        return jwt.decode(token, options={'verify_signature': False})

    header = jwt.get_unverified_header(token)
    kid = header.get('kid')
    key = next((k for k in jwks['keys'] if k['kid'] == kid), None)

    if key is None:
        # Key not found — could be a rotation; try a fresh JWKS fetch once
        jwks = get_jwks(force_refresh=True)
        key = next((k for k in (jwks or {}).get('keys', []) if k['kid'] == kid), None)
        if key is None:
            raise jwt.InvalidTokenError('Public key not found — token may be from a different tenant')

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
    return jwt.decode(
        token,
        public_key,
        algorithms=['RS256'],
        audience=settings.AUTH0_AUDIENCE,
        issuer=f'https://{settings.AUTH0_DOMAIN}/',
    )


class TenantAuthMiddleware:
    """
    Validates Auth0 JWT on every authenticated request.
    Attaches request.auth_user and request.org_id.
    All controller code reads organization scope from request.org_id — never from request body.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if is_public_path(request.path):
            return self.get_response(request)

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return JsonResponse({'error': 'Authentication required'}, status=401)

        token = auth_header.split(' ', 1)[1]
        try:
            payload = decode_jwt(token)
        except Exception as e:
            return JsonResponse({'error': 'Invalid or expired token', 'detail': str(e)}, status=401)

        auth0_sub = payload.get('sub')
        try:
            user = User.objects.select_related('organization').get(auth0_sub=auth0_sub)
        except User.DoesNotExist:
            return JsonResponse(
                {'error': 'User not registered', 'detail': 'Complete registration at /api/register/'},
                status=401,
            )

        # Attach to request — all views use these, never trust client-supplied org IDs
        request.auth_user = user
        request.org_id = user.organization_id

        return self.get_response(request)
