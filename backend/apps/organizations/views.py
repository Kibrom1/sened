from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Organization, User
from .serializers import UserSerializer, RegisterSerializer
from apps.vendors.signals import create_default_requirement_profile


class MeView(APIView):
    def get(self, request):
        serializer = UserSerializer(request.auth_user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserSerializer(request.auth_user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)


class RegisterView(APIView):
    """
    Called after Auth0 sign-up to create the Organization + User in one transaction.
    The JWT is already validated by TenantAuthMiddleware, EXCEPT on this endpoint
    which is listed in PUBLIC_PATHS since the user doesn't exist yet.
    We validate the auth0_sub from the token server-side.
    """

    def post(self, request):
        # Parse the Auth0 JWT to get the sub (since user doesn't exist yet, middleware skips)
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return Response({'error': 'Authentication required'}, status=401)

        from apps.common.middleware import decode_jwt
        try:
            payload = decode_jwt(auth_header.split(' ', 1)[1])
        except Exception as e:
            return Response({'error': str(e)}, status=401)

        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        data = serializer.validated_data
        auth0_sub = payload.get('sub')

        if User.objects.filter(auth0_sub=auth0_sub).exists():
            return Response({'error': 'User already registered'}, status=409)

        with transaction.atomic():
            org = Organization.objects.create(name=data['org_name'])
            user = User.objects.create(
                organization=org,
                email=data['email'],
                name=data['name'],
                auth0_sub=auth0_sub,
                role='owner',
            )
            create_default_requirement_profile(org)

        return Response(UserSerializer(user).data, status=201)


class OrganizationSettingsView(APIView):
    def get(self, request):
        from .serializers import OrganizationSerializer
        return Response(OrganizationSerializer(request.auth_user.organization).data)

    def patch(self, request):
        from .serializers import OrganizationSerializer
        allowed_fields = ['reminder_lead_days', 'reminder_cadence_days', 'expiring_soon_days']
        data = {k: v for k, v in request.data.items() if k in allowed_fields}
        serializer = OrganizationSerializer(request.auth_user.organization, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
