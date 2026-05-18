from django.db import models
from apps.common.models import TenantModel


class RenewalRequest(TenantModel):
    vendor = models.ForeignKey('vendors.Vendor', on_delete=models.CASCADE)
    document = models.ForeignKey('documents.COIDocument', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.TextField(default='scheduled')
    # scheduled | sent | responded | expired_no_response
    magic_link_token = models.TextField(unique=True, null=True, blank=True)
    magic_link_expires_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'renewal_requests'


class ActivityLog(TenantModel):
    vendor = models.ForeignKey('vendors.Vendor', null=True, blank=True, on_delete=models.SET_NULL)
    actor = models.TextField()
    action = models.TextField()
    detail = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'activity_logs'
        ordering = ['-created_at']
