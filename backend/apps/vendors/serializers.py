from rest_framework import serializers
from .models import Vendor, RequirementProfile, RequirementLine


class RequirementLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequirementLine
        fields = ['id', 'coverage_type', 'is_required', 'min_each_occurrence',
                  'min_aggregate', 'additional_insured_required', 'waiver_required']


class RequirementProfileSerializer(serializers.ModelSerializer):
    lines = RequirementLineSerializer(many=True, read_only=True)

    class Meta:
        model = RequirementProfile
        fields = ['id', 'name', 'lines', 'created_at']
        read_only_fields = ['id', 'created_at']


class VendorSerializer(serializers.ModelSerializer):
    requirement_profile_name = serializers.CharField(
        source='requirement_profile.name', read_only=True
    )

    class Meta:
        model = Vendor
        fields = ['id', 'name', 'contact_name', 'contact_email', 'contact_phone',
                  'notes', 'requirement_profile', 'requirement_profile_name',
                  'status', 'created_at']
        read_only_fields = ['id', 'created_at']


class VendorListSerializer(VendorSerializer):
    """
    Vendor list view — adds the compliance-engine status so the Vendors page
    and the Dashboard speak one status vocabulary (no date-derived "Active"
    that can contradict the compliance "Gaps found" verdict).

    Reads annotations set by VendorListView (latest_status / latest_reasons /
    next_expiration). When no compliance check exists yet, status is 'no_data'.
    """

    compliance_status = serializers.SerializerMethodField()
    compliance_reasons = serializers.SerializerMethodField()
    next_expiration = serializers.SerializerMethodField()

    class Meta(VendorSerializer.Meta):
        fields = VendorSerializer.Meta.fields + [
            'compliance_status', 'compliance_reasons', 'next_expiration',
        ]

    def get_compliance_status(self, obj):
        return getattr(obj, 'latest_status', None) or 'no_data'

    def get_compliance_reasons(self, obj):
        return getattr(obj, 'latest_reasons', None) or []

    def get_next_expiration(self, obj):
        exp = getattr(obj, 'next_expiration_date', None)
        return str(exp) if exp else None
