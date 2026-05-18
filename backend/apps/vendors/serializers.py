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
