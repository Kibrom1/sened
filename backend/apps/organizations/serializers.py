from rest_framework import serializers
from .models import Organization, User


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'subscription_status', 'reminder_lead_days',
                  'reminder_cadence_days', 'expiring_soon_days', 'created_at']
        read_only_fields = ['id', 'subscription_status', 'created_at']


class UserSerializer(serializers.ModelSerializer):
    organization = OrganizationSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'organization', 'created_at']
        read_only_fields = ['id', 'organization', 'created_at']


class RegisterSerializer(serializers.Serializer):
    org_name = serializers.CharField(max_length=255)
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
