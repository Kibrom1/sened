"""
Dev-mode authentication endpoints.
These are ONLY registered when AUTH0_DOMAIN is not set (local development).
They must never be reachable in production.
"""
import time
import jwt
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.organizations.models import User
from apps.organizations.serializers import UserSerializer


def _check_dev_mode(func):
    """Decorator: return 404 if AUTH0_DOMAIN is configured (i.e. not in dev mode)."""
    def wrapper(self, request, *args, **kwargs):
        if settings.AUTH0_DOMAIN:
            return Response({'error': 'Not found'}, status=404)
        return func(self, request, *args, **kwargs)
    return wrapper


def _make_dev_token(auth0_sub: str) -> str:
    """Issue a simple HS256 JWT. The middleware decodes it without verification in dev mode."""
    now = int(time.time())
    payload = {
        'sub': auth0_sub,
        'iat': now,
        'exp': now + 86400,  # 24 hours
        'iss': 'sened-dev',
    }
    return jwt.encode(payload, 'dev-secret', algorithm='HS256')


class DevUsersView(APIView):
    """
    GET /api/dev/users/
    Returns the list of seeded test users so the frontend can render a picker.
    Run `python manage.py create_test_users` first.
    """

    @_check_dev_mode
    def get(self, request):
        users = User.objects.filter(
            auth0_sub__startswith='dev-'
        ).select_related('organization').order_by('email')

        return Response([
            {
                'sub': u.auth0_sub,
                'email': u.email,
                'name': u.name,
                'org': u.organization.name,
            }
            for u in users
        ])


class DevLoginView(APIView):
    """
    POST /api/dev/login/
    Body: { "sub": "dev-owner-1" }
    Returns: { "token": "...", "user": {...} }
    """

    @_check_dev_mode
    def post(self, request):
        sub = request.data.get('sub', '').strip()
        if not sub:
            return Response({'error': '"sub" is required'}, status=400)

        try:
            user = User.objects.select_related('organization').get(auth0_sub=sub)
        except User.DoesNotExist:
            return Response(
                {'error': f'No test user with sub "{sub}". Run: python manage.py create_test_users'},
                status=404,
            )

        token = _make_dev_token(sub)
        return Response({
            'token': token,
            'user': UserSerializer(user).data,
        })
