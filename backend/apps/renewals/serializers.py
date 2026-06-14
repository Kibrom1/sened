from rest_framework import serializers

from .models import ActivityLog, RenewalRequest


class RenewalRequestSerializer(serializers.ModelSerializer):
    """Renewal request for the Renewal Activity UI — read-only list view."""

    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_id = serializers.UUIDField(source='vendor.id', read_only=True)
    contact_email = serializers.CharField(source='vendor.contact_email', read_only=True)

    class Meta:
        model = RenewalRequest
        fields = [
            'id', 'vendor_id', 'vendor_name', 'contact_email',
            'status', 'sent_at', 'responded_at',
            'magic_link_expires_at', 'created_at',
        ]
        read_only_fields = fields


class ActivityLogSerializer(serializers.ModelSerializer):
    """Activity log entry — read-only audit feed."""

    vendor_name = serializers.CharField(source='vendor.name', read_only=True, default=None)

    class Meta:
        model = ActivityLog
        fields = ['id', 'vendor', 'vendor_name', 'actor', 'action', 'detail', 'created_at']
        read_only_fields = fields
