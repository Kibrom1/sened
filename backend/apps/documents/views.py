import uuid
import os
from django.conf import settings
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser

from .models import COIDocument, ExtractedCoverage
from .serializers import COIDocumentSerializer, COIDocumentListSerializer, ExtractedCoverageSerializer
from apps.vendors.models import Vendor
from apps.common.storage import upload_to_r2, get_signed_url


class COIDocumentListView(APIView):
    """
    GET  /api/documents/?vendor=<id>   — list documents for a vendor (or all)
    POST /api/documents/               — upload a new COI (multipart/form-data)
    """
    parser_classes = [MultiPartParser]

    def get(self, request):
        qs = COIDocument.objects.for_org(request.org_id).select_related('vendor').prefetch_related('coverages')
        vendor_id = request.query_params.get('vendor')
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        serializer = COIDocumentListSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        file = request.FILES.get('file')
        vendor_id = request.data.get('vendor')

        if not file:
            return Response({'error': 'No file provided'}, status=400)
        if not vendor_id:
            return Response({'error': 'vendor is required'}, status=400)

        # Ensure vendor belongs to this org
        try:
            vendor = Vendor.objects.for_org(request.org_id).get(id=vendor_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Vendor not found'}, status=404)

        # Validate file type — PDF or image (PNG/JPG/WEBP/GIF)
        from apps.common.uploads import validate_coi_upload
        ext, content_type, error = validate_coi_upload(file)
        if error:
            return Response({'error': error}, status=400)

        # Generate a unique storage key (preserve the real extension so the
        # extraction pipeline can pick the right handling).
        file_key = f'coi/{request.org_id}/{vendor.id}/{uuid.uuid4()}.{ext}'

        # Store the file: R2 in production, /tmp in local dev
        _store_file(file, file_key, content_type=content_type)

        # Create the document record
        doc = COIDocument.objects.create(
            organization_id=request.org_id,
            vendor=vendor,
            file_key=file_key,
            status='uploaded',
            source='upload',
            uploaded_by=request.auth_user,
        )

        # Kick off async extraction (fire-and-forget)
        _trigger_extraction(str(doc.id))

        from apps.common.activity import log_activity
        log_activity(request.org_id, actor=request.auth_user.email, action='coi_uploaded',
                     vendor=vendor, detail={'document_id': str(doc.id)})

        return Response(COIDocumentSerializer(doc).data, status=201)


class COIDocumentDetailView(APIView):
    """
    GET   /api/documents/<id>/          — fetch document + extracted coverages + signed URL
    DELETE /api/documents/<id>/         — soft-delete (mark failed/removed)
    """

    def _get_doc(self, request, doc_id):
        return COIDocument.objects.for_org(request.org_id).prefetch_related('coverages').get(id=doc_id)

    def get(self, request, doc_id):
        try:
            doc = self._get_doc(request, doc_id)
        except COIDocument.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        data = COIDocumentSerializer(doc).data

        # Attach a short-lived presigned URL for the PDF viewer
        data['file_url'] = _get_file_url(doc.file_key)

        return Response(data)


class COIDocumentConfirmView(APIView):
    """
    POST /api/documents/<id>/confirm/
    Body: { "coverages": [ { "id": "...", <editable fields> }, ... ] }
    Marks the document as confirmed and saves any edits the user made.
    """

    def post(self, request, doc_id):
        try:
            doc = COIDocument.objects.for_org(request.org_id).get(id=doc_id)
        except COIDocument.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        if doc.status not in ('extracted', 'confirmed'):
            return Response(
                {'error': f'Cannot confirm a document with status "{doc.status}"'},
                status=400,
            )

        coverages_data = request.data.get('coverages', [])
        now = timezone.now()

        # Validate all coverage updates before committing any — fail fast on bad input
        validated = []
        for cov_data in coverages_data:
            cov_id = cov_data.get('id')
            if not cov_id:
                continue
            try:
                cov = ExtractedCoverage.objects.get(id=cov_id, document=doc)
            except ExtractedCoverage.DoesNotExist:
                return Response(
                    {'error': f'Coverage {cov_id} not found on this document'},
                    status=400,
                )
            serializer = ExtractedCoverageSerializer(cov, data=cov_data, partial=True)
            if not serializer.is_valid():
                return Response({'error': 'Invalid coverage data', 'detail': serializer.errors}, status=400)
            validated.append(serializer)

        for serializer in validated:
            serializer.save(
                    confirmed=True,
                    confirmed_at=now,
                    confirmed_by=request.auth_user,
                )

        doc.status = 'confirmed'
        doc.save(update_fields=['status'])

        # Trigger compliance check now that we have a freshly confirmed COI
        from apps.compliance.tasks import run_compliance_check_for_vendor
        run_compliance_check_for_vendor.delay(str(doc.vendor_id))

        from apps.common.activity import log_activity
        log_activity(request.org_id, actor=request.auth_user.email, action='coi_confirmed',
                     vendor=doc.vendor_id, detail={'document_id': str(doc.id)})

        return Response(COIDocumentSerializer(
            COIDocument.objects.prefetch_related('coverages').get(id=doc.id)
        ).data)


class COIDocumentBatchConfirmView(APIView):
    """
    POST /api/documents/confirm-batch/
    Body: { "document_ids": ["...", "..."] }

    Confirms multiple extracted documents in one call, accepting each
    document's extracted coverage values as-is. Intended for the bulk-upload
    workflow where the frontend has already determined which documents are
    high-confidence (no low-confidence fields) and safe to auto-confirm.

    Documents not in 'extracted' status, not in the caller's org, or not found
    are skipped with a reason rather than failing the whole batch.

    Returns: { "confirmed": [ids], "skipped": [{"id": ..., "reason": ...}] }
    """

    def post(self, request, *args, **kwargs):
        document_ids = request.data.get('document_ids', [])
        if not isinstance(document_ids, list) or not document_ids:
            return Response({'error': 'document_ids must be a non-empty list'}, status=400)

        # Single org-scoped query; anything missing is reported as skipped.
        docs = {
            str(d.id): d
            for d in COIDocument.objects.for_org(request.org_id)
            .filter(id__in=document_ids)
            .prefetch_related('coverages')
        }

        now = timezone.now()
        confirmed: list[str] = []
        skipped: list[dict] = []
        vendor_ids: set = set()

        for raw_id in document_ids:
            doc_id = str(raw_id)
            doc = docs.get(doc_id)
            if doc is None:
                skipped.append({'id': doc_id, 'reason': 'not_found'})
                continue
            if doc.status == 'confirmed':
                skipped.append({'id': doc_id, 'reason': 'already_confirmed'})
                continue
            if doc.status != 'extracted':
                skipped.append({'id': doc_id, 'reason': f'status_{doc.status}'})
                continue

            # Confirm extracted values as-is (no edits in batch mode).
            doc.coverages.all().update(
                confirmed=True, confirmed_at=now, confirmed_by=request.auth_user,
            )
            doc.status = 'confirmed'
            doc.save(update_fields=['status'])
            confirmed.append(doc_id)
            vendor_ids.add(str(doc.vendor_id))

            from apps.common.activity import log_activity
            log_activity(
                request.org_id, actor=request.auth_user.email, action='coi_confirmed',
                vendor=doc.vendor_id, detail={'document_id': doc_id, 'batch': True},
            )

        # One compliance check per affected vendor (not per document).
        if vendor_ids:
            from apps.compliance.tasks import run_compliance_check_for_vendor
            for vid in vendor_ids:
                run_compliance_check_for_vendor.delay(vid)

        return Response({'confirmed': confirmed, 'skipped': skipped})


class COIDocumentRetryView(APIView):
    """
    POST /api/documents/<id>/retry/
    Re-triggers extraction for a document in 'failed' status.
    """

    def post(self, request, doc_id):
        try:
            doc = COIDocument.objects.for_org(request.org_id).get(id=doc_id)
        except COIDocument.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        if doc.status != 'failed':
            return Response(
                {'error': 'Only documents with status "failed" can be retried'},
                status=400,
            )

        doc.status = 'uploaded'
        doc.save(update_fields=['status'])
        _trigger_extraction(str(doc.id))

        return Response({'status': 'queued'})


# ── Storage helpers ────────────────────────────────────────────────────────────

def _store_file(file_obj, file_key: str, content_type: str) -> None:
    """Upload to R2 if configured, otherwise save to /tmp for local dev."""
    if settings.R2_ENDPOINT_URL and settings.R2_ACCESS_KEY:
        upload_to_r2(file_key, file_obj, content_type=content_type)
    else:
        # Local dev fallback — save flat to /tmp/<file_key> (dirs stripped to last segment)
        local_path = f'/tmp/{file_key}'
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, 'wb') as f:
            for chunk in file_obj.chunks():
                f.write(chunk)


def _get_file_url(file_key: str) -> str | None:
    """Return a presigned URL (R2) or local file path."""
    if settings.R2_ENDPOINT_URL and settings.R2_ACCESS_KEY:
        return get_signed_url(file_key)
    local_path = f'/tmp/{file_key}'
    return f'file://{local_path}' if os.path.exists(local_path) else None


def _trigger_extraction(document_id: str) -> None:
    """Fire the Celery extraction task. Gracefully skips if Anthropic key is missing."""
    if not settings.ANTHROPIC_API_KEY:
        # In local dev without an Anthropic key, mark as 'failed' immediately
        # so the UI shows an actionable state rather than stuck 'processing'.
        COIDocument.objects.filter(id=document_id).update(status='failed')
        return
    from .tasks import extract_coi
    extract_coi.delay(document_id)
