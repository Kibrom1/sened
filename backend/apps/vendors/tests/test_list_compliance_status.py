"""
Dual-status fix: the vendor list endpoint must report the compliance-engine
verdict (not a date-derived status), so the Vendors page and Dashboard share
one status vocabulary.
"""
import uuid

import pytest
from rest_framework.test import APIRequestFactory

from apps.compliance.models import ComplianceCheck
from apps.organizations.models import Organization, User
from apps.vendors.models import Vendor
from apps.vendors.views import VendorListView

factory = APIRequestFactory()


def _org(name):
    org = Organization.objects.create(name=name)
    User.objects.create(organization=org, email=f'{uuid.uuid4()}@t.com', name='T')
    return org


def _list(org):
    request = factory.get('/api/vendors/')
    request.org_id = org.id
    resp = VendorListView.as_view()(request)
    assert resp.status_code == 200
    return {row['name']: row for row in resp.data}


@pytest.mark.django_db
class TestVendorListComplianceStatus:
    def test_uses_latest_compliance_check(self):
        org = _org('A')
        v = Vendor.objects.create(organization=org, name='Acme')
        ComplianceCheck.objects.create(
            organization=org, vendor=v, status='gaps_found',
            reasons=['Auto liability below required limit'],
        )
        row = _list(org)['Acme']
        assert row['compliance_status'] == 'gaps_found'
        assert row['compliance_reasons'] == ['Auto liability below required limit']

    def test_no_check_is_no_data(self):
        org = _org('A')
        Vendor.objects.create(organization=org, name='Fresh')
        row = _list(org)['Fresh']
        assert row['compliance_status'] == 'no_data'
        assert row['compliance_reasons'] == []

    def test_latest_check_wins(self):
        org = _org('A')
        v = Vendor.objects.create(organization=org, name='Acme')
        ComplianceCheck.objects.create(organization=org, vendor=v, status='expired')
        ComplianceCheck.objects.create(organization=org, vendor=v, status='matches_requirements')
        assert _list(org)['Acme']['compliance_status'] == 'matches_requirements'

    def test_scoped_to_org(self):
        org_a = _org('A')
        org_b = _org('B')
        Vendor.objects.create(organization=org_a, name='OnlyA')
        Vendor.objects.create(organization=org_b, name='OnlyB')
        rows = _list(org_a)
        assert 'OnlyA' in rows and 'OnlyB' not in rows
