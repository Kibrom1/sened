"""
Tests for the Renewal Activity UI endpoints (RenewalListView, ActivityListView).

Verifies org-scoping, status/vendor filtering, serializer shape, and ordering.
Views read tenant scope from request.org_id (set by TenantAuthMiddleware in
production); here we set it directly on the request, mirroring the existing
view-level conventions.
"""
import uuid

import pytest
from rest_framework.test import APIRequestFactory

from apps.organizations.models import Organization, User
from apps.renewals.models import ActivityLog, RenewalRequest
from apps.renewals.views import ActivityListView, RenewalListView
from apps.vendors.models import Vendor

factory = APIRequestFactory()


def _org(name):
    org = Organization.objects.create(name=name)
    user = User.objects.create(
        organization=org, email=f'{uuid.uuid4()}@test.com', name='T',
    )
    return org, user


@pytest.mark.django_db
class TestRenewalListView:
    def test_lists_only_callers_org(self):
        org_a, _ = _org('A')
        org_b, _ = _org('B')
        va = Vendor.objects.create(organization=org_a, name='Vendor A', contact_email='a@x.com')
        vb = Vendor.objects.create(organization=org_b, name='Vendor B', contact_email='b@x.com')
        RenewalRequest.objects.create(organization=org_a, vendor=va, status='sent')
        RenewalRequest.objects.create(organization=org_b, vendor=vb, status='sent')

        request = factory.get('/api/renewals/')
        request.org_id = org_a.id
        resp = RenewalListView.as_view()(request)

        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]['vendor_name'] == 'Vendor A'
        assert resp.data[0]['contact_email'] == 'a@x.com'

    def test_status_filter(self):
        org, _ = _org('A')
        v = Vendor.objects.create(organization=org, name='V')
        RenewalRequest.objects.create(organization=org, vendor=v, status='sent')
        RenewalRequest.objects.create(organization=org, vendor=v, status='responded')

        request = factory.get('/api/renewals/', {'status': 'responded'})
        request.org_id = org.id
        resp = RenewalListView.as_view()(request)

        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]['status'] == 'responded'

    def test_newest_first(self):
        org, _ = _org('A')
        v = Vendor.objects.create(organization=org, name='V')
        old = RenewalRequest.objects.create(organization=org, vendor=v, status='sent')
        new = RenewalRequest.objects.create(organization=org, vendor=v, status='scheduled')

        request = factory.get('/api/renewals/')
        request.org_id = org.id
        resp = RenewalListView.as_view()(request)

        assert [str(new.id), str(old.id)] == [r['id'] for r in resp.data]


@pytest.mark.django_db
class TestActivityListView:
    def test_lists_only_callers_org(self):
        org_a, _ = _org('A')
        org_b, _ = _org('B')
        ActivityLog.objects.create(organization=org_a, actor='system', action='vendor_created')
        ActivityLog.objects.create(organization=org_b, actor='system', action='vendor_created')

        request = factory.get('/api/activity/')
        request.org_id = org_a.id
        resp = ActivityListView.as_view()(request)

        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_vendor_filter_and_shape(self):
        org, _ = _org('A')
        v = Vendor.objects.create(organization=org, name='Acme')
        ActivityLog.objects.create(
            organization=org, vendor=v, actor='vendor',
            action='coi_uploaded_via_magic_link', detail={'k': 'v'},
        )
        ActivityLog.objects.create(organization=org, actor='system', action='renewal_sent')

        request = factory.get('/api/activity/', {'vendor': str(v.id)})
        request.org_id = org.id
        resp = ActivityListView.as_view()(request)

        assert resp.status_code == 200
        assert len(resp.data) == 1
        entry = resp.data[0]
        assert entry['vendor_name'] == 'Acme'
        assert entry['action'] == 'coi_uploaded_via_magic_link'
        assert entry['detail'] == {'k': 'v'}
