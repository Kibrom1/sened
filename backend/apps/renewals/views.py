"""
Magic-link upload views — Phase 3

Public endpoints (no auth required) used by vendor contacts who receive
renewal reminder emails.  The magic_link_token is the sole authentication
mechanism; requests with expired or unknown tokens are rejected.

GET  /api/magic-upload/<token>/
    Verify the token is valid, return vendor + org context for the upload
    page.  Returns {'already_responded': True} if the vendor already uploaded.

POST /api/magic-upload/<token>/
    Accept a PDF upload, store it (R2 / /tmp fallback), create a COIDocument,
    mark the RenewalRequest as 'responded', and queue AI extraction.
"""

import logging
import os
import uuid

from django.conf import settings
from django.utils import timezone
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import RenewalRequest

logger = logging.getLogger(__name__)


class MagicUploadView(APIView):
    """
    Public magic-link COI upload endpoint — no authentication required.
    The token embedded in the URL is the only access control.
    """

    # Disable DRF's default auth/permission classes so unauthenticated
    # (vendor) requests are not rejected before they reach the view.
    authentication_classes = []
    permission_classes = []
    parser_classes = [MultiPartParser]

    # ── helpers ──────────────────────────────────────────────────────────────

    def _resolve_renewal(self, token: str):
        """
        Return (renewal, error_string_or_None).
        'already_responded' is a special sentinel — callers handle it
        separately to return a friendly message rather than a 404.
        """
        try:
            renewal = (
                RenewalRequest.objects
                .select_related('vendor', 'organization')
                .get(magic_link_token=token)
            )
        except RenewalRequest.DoesNotExist:
            return None, 'invalid'

        if renewal.magic_link_expires_at and timezone.now() > renewal.magic_link_expires_at:
            return renewal, 'expired'

        if renewal.status == 'responded':
            return renewal, 'already_responded'

        return renewal, None

    # ── GET — fetch context for the upload page ───────────────────────────────

    def get(self, request, token: str):
        renewal, error = self._resolve_renewal(token)

        if error == 'invalid':
            return Response(
                {'error': 'This link is not valid. Please contact the requester.'},
                status=404,
            )
        if error == 'expired':
            return Response(
                {'error': 'This link has expired. Please contact the requester for a new one.'},
                status=410,
            )
        if error == 'already_responded':
            # Friendly 200 so the frontend can show a "thank you" state
            return Response({
                'already_responded': True,
                'vendor_name': renewal.vendor.name,
                'org_name': renewal.organization.name,
            })

        return Response({
            'already_responded': False,
            'vendor_name': renewal.vendor.name,
            'contact_name': renewal.vendor.contact_name,
            'org_name': renewal.organization.name,
        })

    # ── POST — accept PDF, create document, queue extraction ─────────────────

    def post(self, request, token: str):
        renewal, error = self._resolve_renewal(token)

        if error == 'invalid':
            return Response({'error': 'Invalid link.'}, status=404)
        if error == 'expired':
            return Response({'error': 'This link has expired.'}, status=410)
        if error == 'already_responded':
            return Response(
                {'error': 'A certificate has already been uploaded for this request.'},
                status=409,
            )

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided.'}, status=400)

        content_type = file.content_type or ''
        if content_type != 'application/pdf' and not file.name.lower().endswith('.pdf'):
            return Response({'error': 'Only PDF files are accepted.'}, status=400)

        vendor = renewal.vendor
        org = renewal.organization

        file_key = f'coi/{org.id}/{vendor.id}/magic-{uuid.uuid4()}.pdf'

        # Store: R2 in production, /tmp fallback in local dev
        _store_file(file, file_key)

        from apps.documents.models import COIDocument
        from apps.documents.tasks import extract_coi

        doc = COIDocument.objects.create(
            organization=org,
            vendor=vendor,
            status='uploaded',
            source='magic_link',
            file_key=file_key,
        )

        # Mark renewal as responded before queuing extraction so that any
        # duplicate POST (e.g. accidental double-submit) is rejected cleanly.
        renewal.status = 'responded'
        renewal.responded_at = timezone.now()
        renewal.document = doc
        renewal.save(update_fields=['status', 'responded_at', 'document'])

        # Queue AI extraction
        extract_coi.delay(str(doc.id))

        logger.info(
            'magic upload: doc %s created for vendor %s (org %s)',
            doc.id, vendor.id, org.id,
        )

        return Response({'document_id': str(doc.id)}, status=201)


# ── Private helpers ───────────────────────────────────────────────────────────

def _store_file(file_obj, file_key: str) -> None:
    """Upload to R2 if configured, otherwise save to /tmp for local dev."""
    if settings.R2_ENDPOINT_URL and settings.R2_ACCESS_KEY:
        from apps.common.storage import upload_to_r2
        upload_to_r2(file_key, file_obj, content_type='application/pdf')
    else:
        local_path = f'/tmp/{file_key}'
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, 'wb') as f:
            for chunk in file_obj.chunks():
                f.write(chunk)
