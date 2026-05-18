import uuid
from django.db import models
from apps.common.models import TenantModel


class COIDocument(TenantModel):
    vendor = models.ForeignKey('vendors.Vendor', on_delete=models.CASCADE, related_name='documents')
    file_key = models.TextField()
    status = models.TextField(default='uploaded')
    # uploaded | processing | extracted | confirmed | failed
    source = models.TextField(default='upload')  # upload | magic_link
    uploaded_by = models.ForeignKey(
        'organizations.User', null=True, blank=True, on_delete=models.SET_NULL
    )
    # Top-level COI metadata (populated after extraction)
    insured_name = models.TextField(null=True, blank=True)
    certificate_holder_name = models.TextField(null=True, blank=True)
    producer_name = models.TextField(null=True, blank=True)
    certificate_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'coi_documents'
        ordering = ['-created_at']


class ExtractedCoverage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(COIDocument, on_delete=models.CASCADE, related_name='coverages')
    coverage_type = models.TextField()
    carrier_name = models.TextField(null=True, blank=True)
    policy_number = models.TextField(null=True, blank=True)
    effective_date = models.DateField(null=True, blank=True)
    expiration_date = models.DateField(null=True, blank=True)
    limits = models.JSONField(null=True, blank=True)
    additional_insured = models.TextField(null=True, blank=True)   # yes | no | unclear
    waiver_of_subrogation = models.TextField(null=True, blank=True)
    confidence = models.JSONField(null=True, blank=True)  # per-field 0.0–1.0
    confirmed = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        'organizations.User', null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        db_table = 'extracted_coverages'
