"""
End-to-end journey test — drives the real API stack the way the frontend does.

Covers: register → me → add vendor → upload COI → (extraction mocked) → confirm
→ compliance check (eager Celery) → dashboard buckets → unified vendor status →
manual renewal → renewals list → activity feed → magic-link vendor upload →
multi-format (image) upload → bulk batch-confirm.

Only true externals are mocked: AI extraction (no Anthropic key), email (Resend
unset → send is skipped), and storage (no R2 → writes to /tmp). Everything else
— middleware auth, serializers, DB, the compliance engine, renewal logic — runs
for real.
"""
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.documents.models import COIDocument, ExtractedCoverage

PDF_BYTES = b'%PDF-1.4 fake'
PNG_BYTES = b'\x89PNG\r\n\x1a\n fake'


def _fake_extract(document_id: str):
    """Deterministic stand-in for the AI extraction pipeline."""
    doc = COIDocument.objects.get(id=document_id)
    doc.insured_name = 'Acme Subcontracting LLC'
    doc.status = 'extracted'
    doc.save(update_fields=['insured_name', 'status'])
    specs = [
        ('general_liability', {'each_occurrence': 1_000_000, 'general_aggregate': 2_000_000}),
        ('automobile', {'each_occurrence': 1_000_000}),
        ('workers_comp', {}),
    ]
    for ctype, limits in specs:
        ExtractedCoverage.objects.create(
            document=doc, coverage_type=ctype,
            carrier_name='Travelers', policy_number='POL-123',
            effective_date='2026-01-01', expiration_date='2027-01-01',
            limits=limits, additional_insured='yes', waiver_of_subrogation='yes',
            confidence={'carrier_name': 0.95, 'policy_number': 0.95, 'limits': 0.95,
                        'effective_date': 0.95, 'expiration_date': 0.95,
                        'additional_insured': 0.95, 'waiver_of_subrogation': 0.95},
        )


@pytest.mark.django_db
def test_full_user_journey():
    client = APIClient(HTTP_AUTHORIZATION='Bearer dev-opaque-token')

    # 1. Register (public path; dev bypass → sub 'local-dev-bypass')
    r = client.post('/api/register/', {
        'org_name': 'Greenfield Builders', 'email': 'owner@greenfield.test', 'name': 'Pat Owner',
    }, format='json')
    assert r.status_code == 201, r.content

    # 2. /me reflects the new org
    me = client.get('/api/me/')
    assert me.status_code == 200
    assert me.data['organization']['name'] == 'Greenfield Builders'

    # 3. Use the org's default requirement profile
    profiles = client.get('/api/requirement-profiles/').data
    assert len(profiles) >= 1
    profile_id = profiles[0]['id']

    # 4. Add a vendor with a contact email + profile
    r = client.post('/api/vendors/', {
        'name': 'Acme Subcontracting LLC', 'contact_email': 'acme@vendor.test',
        'contact_name': 'Sam Acme', 'requirement_profile': profile_id,
    }, format='json')
    assert r.status_code == 201, r.content
    vendor_id = r.data['id']

    # 5. Upload a COI (extraction mocked deterministically)
    with patch('apps.documents.views._trigger_extraction', side_effect=_fake_extract):
        r = client.post('/api/documents/', {
            'vendor': vendor_id,
            'file': SimpleUploadedFile('cert.pdf', PDF_BYTES, content_type='application/pdf'),
        }, format='multipart')
    assert r.status_code == 201, r.content
    doc_id = r.data['id']

    # 6. Document is extracted with coverages
    doc = client.get(f'/api/documents/{doc_id}/').data
    assert doc['status'] == 'extracted'
    assert len(doc['coverages']) == 3

    # 7. Confirm → triggers compliance check (eager)
    r = client.post(f'/api/documents/{doc_id}/confirm/', {
        'coverages': [{'id': c['id']} for c in doc['coverages']],
    }, format='json')
    assert r.status_code == 200, r.content

    # 8. Dashboard shows the vendor as matching requirements
    buckets = client.get('/api/dashboard/').data
    matched = [v['vendor_id'] for v in buckets['matches_requirements']]
    assert vendor_id in matched, buckets

    # 9. Vendors list reports the SAME compliance status (dual-status unified)
    vendors = client.get('/api/vendors/').data
    v = next(v for v in vendors if v['id'] == vendor_id)
    assert v['compliance_status'] == 'matches_requirements'

    # 10. Trigger a manual renewal (email send skipped — Resend unset)
    r = client.post(f'/api/renewals/send/{vendor_id}/')
    assert r.status_code == 201, r.content

    # 11. Renewals list shows the in-flight request
    renewals = client.get('/api/renewals/').data
    assert any(rr['vendor_id'] == vendor_id for rr in renewals)
    from apps.renewals.models import RenewalRequest
    renewal = RenewalRequest.objects.get(vendor_id=vendor_id)
    token = renewal.magic_link_token

    # 12. Activity feed recorded the journey
    actions = {a['action'] for a in client.get('/api/activity/').data}
    assert {'vendor_created', 'coi_confirmed', 'renewal_reminder_triggered'} <= actions, actions

    # 13. Vendor-facing magic-link upload (public, image file accepted)
    public = APIClient()  # no auth header
    ctx = public.get(f'/api/magic-upload/{token}/')
    assert ctx.status_code == 200
    assert ctx.data['vendor_name'] == 'Acme Subcontracting LLC'
    with patch('apps.documents.tasks.extract_coi.delay'):
        up = public.post(f'/api/magic-upload/{token}/', {
            'file': SimpleUploadedFile('photo.png', PNG_BYTES, content_type='image/png'),
        }, format='multipart')
    assert up.status_code == 201, up.content
    renewal.refresh_from_db()
    assert renewal.status == 'responded'

    # 14. Bulk: upload 2 more docs and batch-confirm them
    with patch('apps.documents.views._trigger_extraction', side_effect=_fake_extract):
        ids = []
        for _ in range(2):
            rr = client.post('/api/documents/', {
                'vendor': vendor_id,
                'file': SimpleUploadedFile('c.pdf', PDF_BYTES, content_type='application/pdf'),
            }, format='multipart')
            ids.append(rr.data['id'])
    r = client.post('/api/documents/confirm-batch/', {'document_ids': ids}, format='json')
    assert r.status_code == 200, r.content
    assert set(r.data['confirmed']) == set(ids)
    assert r.data['skipped'] == []
