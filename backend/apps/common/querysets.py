from django.db import models


class TenantQuerySet(models.QuerySet):
    """
    Base queryset that enforces tenant isolation.
    Every queryset on tenant-scoped models MUST call .for_org(organization_id).
    Never query tenant data without this filter.
    """

    def for_org(self, organization_id):
        return self.filter(organization_id=organization_id)


class TenantManager(models.Manager):
    def get_queryset(self):
        return TenantQuerySet(self.model, using=self._db)

    def for_org(self, organization_id):
        return self.get_queryset().for_org(organization_id)
