from rest_framework import serializers
from .models import COIDocument, ExtractedCoverage


class ExtractedCoverageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExtractedCoverage
        fields = [
            'id', 'coverage_type', 'carrier_name', 'policy_number',
            'effective_date', 'expiration_date', 'limits',
            'additional_insured', 'waiver_of_subrogation',
            'confidence', 'confirmed', 'confirmed_at',
        ]
        read_only_fields = ['id', 'confirmed_at']


class COIDocumentSerializer(serializers.ModelSerializer):
    coverages = ExtractedCoverageSerializer(many=True, read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model = COIDocument
        fields = [
            'id', 'vendor', 'vendor_name', 'file_key', 'status', 'source',
            'insured_name', 'certificate_holder_name', 'producer_name',
            'certificate_date', 'created_at', 'coverages',
        ]
        read_only_fields = [
            'id', 'file_key', 'status', 'insured_name',
            'certificate_holder_name', 'producer_name',
            'certificate_date', 'created_at', 'coverages',
        ]


class COIDocumentListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views — no coverages nested."""
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    earliest_expiration = serializers.SerializerMethodField()

    class Meta:
        model = COIDocument
        fields = [
            'id', 'vendor', 'vendor_name', 'status', 'source',
            'insured_name', 'certificate_date', 'created_at', 'earliest_expiration',
        ]

    def get_earliest_expiration(self, obj):
        dates = obj.coverages.filter(
            expiration_date__isnull=False
        ).values_list('expiration_date', flat=True)
        return min(dates) if dates else None
