import uuid
from django.db import models
from apps.common.models import TenantModel


class RequirementProfile(TenantModel):
    name = models.TextField()

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'requirement_profiles'


class RequirementLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(RequirementProfile, on_delete=models.CASCADE, related_name='lines')
    coverage_type = models.TextField()
    # general_liability | automobile | workers_comp | umbrella | professional_liability | other
    is_required = models.BooleanField(default=True)
    min_each_occurrence = models.BigIntegerField(null=True, blank=True)
    min_aggregate = models.BigIntegerField(null=True, blank=True)
    additional_insured_required = models.BooleanField(default=False)
    waiver_required = models.BooleanField(default=False)

    class Meta:
        db_table = 'requirement_lines'


class Vendor(TenantModel):
    name = models.TextField()
    contact_name = models.TextField(null=True, blank=True)
    contact_email = models.EmailField(null=True, blank=True)
    contact_phone = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    requirement_profile = models.ForeignKey(
        RequirementProfile, null=True, blank=True, on_delete=models.SET_NULL
    )
    status = models.TextField(default='active')  # active | inactive

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'vendors'
        ordering = ['name']
