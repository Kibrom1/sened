"""
Critical test: verifies that TenantQuerySet.for_org() prevents cross-tenant data access.
This test MUST pass in CI on every commit.
"""
import pytest
import uuid
from apps.organizations.models import Organization, User
from apps.vendors.models import Vendor


@pytest.mark.django_db
class TestTenantIsolation:
    def _make_org_with_vendor(self, org_name, vendor_name):
        org = Organization.objects.create(name=org_name)
        user = User.objects.create(
            organization=org,
            email=f'{uuid.uuid4()}@test.com',
            name='Test User',
        )
        vendor = Vendor.objects.create(organization=org, name=vendor_name)
        return org, user, vendor

    def test_vendor_scoped_to_org(self):
        org_a, _, vendor_a = self._make_org_with_vendor('Org A', 'Vendor A')
        org_b, _, vendor_b = self._make_org_with_vendor('Org B', 'Vendor B')

        # Org A can see its own vendor
        assert Vendor.objects.for_org(org_a.id).filter(id=vendor_a.id).exists()

        # Org A cannot see Org B's vendor
        assert not Vendor.objects.for_org(org_a.id).filter(id=vendor_b.id).exists()

        # Org B cannot see Org A's vendor
        assert not Vendor.objects.for_org(org_b.id).filter(id=vendor_a.id).exists()

    def test_cannot_access_other_org_vendor_by_id(self):
        org_a, _, vendor_a = self._make_org_with_vendor('Org A', 'Vendor A')
        org_b, _, _ = self._make_org_with_vendor('Org B', 'Vendor B')

        # Attempting to retrieve org_a's vendor through org_b's scope raises DoesNotExist
        with pytest.raises(Vendor.DoesNotExist):
            Vendor.objects.for_org(org_b.id).get(id=vendor_a.id)
