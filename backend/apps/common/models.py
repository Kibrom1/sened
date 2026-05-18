import uuid
from django.db import models
from .querysets import TenantManager


class TenantModel(models.Model):
    """
    Abstract base for every model scoped to an organization (tenant).
    Enforces that all tenant data carries organization_id and is
    queried exclusively through TenantQuerySet.for_org().
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'organizations.Organization',
        on_delete=models.CASCADE,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = TenantManager()

    class Meta:
        abstract = True
        indexes = [
            models.Index(fields=['organization']),
        ]
