from django.db import models
from apps.common.models import TenantModel


class ComplianceCheck(TenantModel):
    vendor = models.ForeignKey('vendors.Vendor', on_delete=models.CASCADE)
    document = models.ForeignKey('documents.COIDocument', on_delete=models.CASCADE)
    status = models.TextField()
    # matches_requirements | gaps_found | expired | needs_review
    reasons = models.JSONField(null=True, blank=True)
    checked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'compliance_checks'
        ordering = ['-checked_at']
