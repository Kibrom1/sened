"""
Tests for the bulk batch-confirm endpoint (COIDocumentBatchConfirmView).

Confirms extracted documents as-is, skips ineligible ones with a reason,
and is org-scoped. Celery dispatch is patched out.
"""
import uuid
from unittest.mock import patch

import pytest
from rest_framework.test import APIRequestFactory

from apps.documents.models import COIDocument, ExtractedCoverage
from apps.documents.views import COIDocumentBatchConfirmView
from apps.organizations.models import Organization, User
from apps.vendors.models import Vendor

factory = APIRequestFactory()


def _setup(org_name='Org'):
    org = Organization.objects.create(name=org_name)
    user = User.objects.create(organization=org, email=f'{uuid.uuid4()}@t.com', name='T')
    return org, user


def _doc(org, vendor, status='extracted'):
    doc = COIDocument.objects.create(
        organization=org, vendor=vendor, file_key='k', status=status,
    )
    ExtractedCoverage.objects.create(document=doc, coverage_type='general_liability')
    return doc


def _post(org, user, document_ids):
    request = factory.post('/api/documents/confirm-batch/', {'document_ids': document_ids}, format='json')
    request.org_id = org.id
    request.auth_user = user
    return COIDocumentBatchConfirmView.as_view()(request)


@pytest.mark.django_db
class TestBatchConfirm:
    @patch('apps.compliance.tasks.run_compliance_check_for_vendor.delay')
    def test_confirms_extracted_docs(self, mock_delay):
        org, user = _setup()
        v = Vendor.objects.create(organization=org, name='V')
        d1, d2 = _doc(org, v), _doc(org, v)

        resp = _post(org, user, [str(d1.id), str(d2.id)])

        assert resp.status_code == 200
        assert set(resp.data['confirmed']) == {str(d1.id), str(d2.id)}
        assert resp.data['skipped'] == []
        d1.refresh_from_db(); d2.refresh_from_db()
        assert d1.status == 'confirmed' and d2.status == 'confirmed'
        assert d1.coverages.first().confirmed is True
        # One compliance check for the single shared vendor (deduped)
        mock_delay.assert_called_once_with(str(v.id))

    @patch('apps.compliance.tasks.run_compliance_check_for_vendor.delay')
    def test_skips_non_extracted_and_reports_reason(self, mock_delay):
        org, user = _setup()
        v = Vendor.objects.create(organization=org, name='V')
        good = _doc(org, v, status='extracted')
        processing = _doc(org, v, status='processing')
        done = _doc(org, v, status='confirmed')

        resp = _post(org, user, [str(good.id), str(processing.id), str(done.id)])

        assert resp.data['confirmed'] == [str(good.id)]
        reasons = {s['id']: s['reason'] for s in resp.data['skipped']}
        assert reasons[str(processing.id)] == 'status_processing'
        assert reasons[str(done.id)] == 'already_confirmed'

    @patch('apps.compliance.tasks.run_compliance_check_for_vendor.delay')
    def test_other_org_doc_is_not_found(self, mock_delay):
        org, user = _setup('A')
        other_org, _ = _setup('B')
        v_other = Vendor.objects.create(organization=other_org, name='Other')
        foreign = _doc(other_org, v_other)

        resp = _post(org, user, [str(foreign.id)])

        assert resp.data['confirmed'] == []
        assert resp.data['skipped'] == [{'id': str(foreign.id), 'reason': 'not_found'}]
        foreign.refresh_from_db()
        assert foreign.status == 'extracted'
        mock_delay.assert_not_called()

    def test_empty_payload_is_400(self):
        org, user = _setup()
        resp = _post(org, user, [])
        assert resp.status_code == 400
