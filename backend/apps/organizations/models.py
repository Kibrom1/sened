import uuid
from django.db import models


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    stripe_customer_id = models.TextField(null=True, blank=True)
    stripe_subscription_id = models.TextField(null=True, blank=True)
    subscription_status = models.TextField(default='trialing')
    # trialing | active | past_due | canceled
    reminder_lead_days = models.IntegerField(default=30)
    reminder_cadence_days = models.IntegerField(default=7)
    expiring_soon_days = models.IntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'organizations'


class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='users')
    email = models.EmailField(unique=True)
    name = models.TextField()
    role = models.TextField(default='member')  # 'owner' | 'member'
    auth0_sub = models.TextField(unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.email

    class Meta:
        db_table = 'users'
