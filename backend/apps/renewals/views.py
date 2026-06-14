"""
Renewal views — Phase 3

MagicUploadView  — public, token-authenticated upload endpoint (vendor-facing)
ManualRenewalView — authenticated endpoint for staff to manually trigger a reminder
"""

import logging
import os
import secrets
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
        # Rate limit: 5 uploads per hour per client IP (public endpoint)
        if not _allow_upload(_client_ip(request)):
            return Response(
                {'error': 'Too many upload attempts. Please try again in an hour.'},
                status=429,
            )

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

        from apps.common.activity import log_activity
        log_activity(
            org.id, actor='vendor', action='coi_uploaded_via_magic_link',
            vendor=vendor, detail={'document_id': str(doc.id), 'renewal_id': str(renewal.id)},
        )

        logger.info(
            'magic upload: doc %s created for vendor %s (org %s)',
            doc.id, vendor.id, org.id,
        )

        return Response({'document_id': str(doc.id)}, status=201)


# ── Private helpers ───────────────────────────────────────────────────────────

def _client_ip(request) -> str:
    """Client IP, honouring the first X-Forwarded-For hop (Fly.io proxy)."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', 'unknown')


def _allow_upload(ip: str, limit: int = 5, window_seconds: int = 3600) -> bool:
    """
    Sliding-window-ish rate limiter: max `limit` uploads per `window_seconds`
    per IP. Backed by Django's cache (Redis in production — shared across
    workers; LocMem in tests).
    """
    from django.core.cache import cache

    key = f'magic-upload-rate:{ip}'
    # add() is atomic: sets to 0 with TTL only if the key doesn't exist
    cache.add(key, 0, timeout=window_seconds)
    try:
        count = cache.incr(key)
    except ValueError:
        # Key expired between add() and incr() — extremely rare; start over
        cache.set(key, 1, timeout=window_seconds)
        count = 1
    return count <= limit


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


class ManualRenewalView(APIView):
    """
    POST /api/renewals/send/<vendor_id>/
    Authenticated staff endpoint — immediately creates a RenewalRequest and
    fires the reminder email, bypassing the normal cadence-days guard.
    """

    def post(self, request, vendor_id):
        from apps.vendors.models import Vendor
        from apps.documents.models import COIDocument
        from .tasks import send_renewal_reminder_for_vendor

        # Scope to the caller's org
        try:
            vendor = Vendor.objects.for_org(request.org_id).get(id=vendor_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Vendor not found.'}, status=404)

        contact_email = getattr(vendor, 'contact_email', None)
        if not contact_email:
            return Response(
                {'error': 'Vendor has no contact email — add one before sending a reminder.'},
                status=400,
            )

        # Find the latest confirmed COI for this vendor / org
        doc = (
            COIDocument.objects
            .filter(
                vendor=vendor,
                organization_id=request.org_id,
                status='confirmed',
            )
            .order_by('-created_at')
            .first()
        )

        token = secrets.token_urlsafe(32)
        expires_at = timezone.now() + timezone.timedelta(days=14)

        renewal = RenewalRequest.objects.create(
            organization_id=request.org_id,
            vendor=vendor,
            document=doc,
            magic_link_token=token,
            magic_link_expires_at=expires_at,
            status='scheduled',
        )

        send_renewal_reminder_for_vendor.delay(str(renewal.id))

        from apps.common.activity import log_activity
        log_activity(
            request.org_id, actor=request.auth_user.email, action='renewal_reminder_triggered',
            vendor=vendor, detail={'renewal_id': str(renewal.id), 'manual': True},
        )

        logger.info(
            'manual renewal triggered: renewal %s for vendor %s (org %s) by user %s',
            renewal.id, vendor.id, request.org_id, request.auth_user.email,
        )

        return Response(
            {
                'renewal_id': str(renewal.id),
                'message': f'Renewal reminder queued for {vendor.name}.',
            },
            status=201,
        )
