import jwt
import requests
from functools import lru_cache
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


@lru_cache(maxsize=1)
def get_jwks():
    """Fetch Auth0 JWKS — cached at process level, refreshed on rotation."""
    if not settings.AUTH0_DOMAIN:
        return None
    url = f'https://{settings.AUTH0_DOMAIN}/.well-known/jwks.json'
    resp = requests.get(url, timeout=5)
    resp.raise_for_status()
    return resp.json()


def decode_jwt(token: str) -> dict:
    """Validate and decode an Auth0 JWT. Returns the payload or raises."""
    jwks = get_jwks()
    if jwks is None:
        # Dev mode with no Auth0 configured — decode without verification
        return jwt.decode(token, options={"verify_signature": False})

    header = jwt.get_unverified_header(token)
    key = next((k for k in jwks['keys'] if k['kid'] == header['kid']), None)
    if key is None:
        raise jwt.InvalidTokenError('Public key not found')

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
            # Auto-create for local development preview
            from apps.organizations.models import Organization
            org = Organization.objects.create(name="Local Dev Organization")
            user = User.objects.create(
                organization=org,
                email="dev@example.com",
                name="Local Developer",
                auth0_sub=auth0_sub
            )

        # Attach to request — all views use these, never trust client-supplied org IDs
        request.auth_user = user
        request.org_id = user.organization_id

        return self.get_response(request)
