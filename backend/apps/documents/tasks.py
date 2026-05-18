"""
Phase 1 — COI extraction pipeline.

Flow:
  upload_coi view  →  extract_coi.delay(document_id)
                   →  download PDF from R2 (or local tmp)
                   →  convert pages to PNG via pypdfium2
                   →  send images to Anthropic vision API
                   →  parse structured JSON response
                   →  save ExtractedCoverage rows
                   →  set document.status = 'extracted' (or 'failed')
"""

import io
import json
import base64
import logging
from datetime import date, datetime

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

# ── Anthropic extraction prompt ───────────────────────────────────────────────

EXTRACTION_PROMPT = """
You are an expert at reading ACORD 25 Certificates of Insurance (COI) forms.
Extract ALL coverage information from this COI document and return a single
JSON object (no markdown fences, raw JSON only) with this exact structure:

{
  "insured_name": "<string or null>",
  "certificate_holder_name": "<string or null>",
  "producer_name": "<string or null>",
  "certificate_date": "<YYYY-MM-DD or null>",
  "coverages": [
    {
      "coverage_type": "<general_liability | automobile | workers_compensation | umbrella | other>",
      "carrier_name": "<string or null>",
      "policy_number": "<string or null>",
      "effective_date": "<YYYY-MM-DD or null>",
      "expiration_date": "<YYYY-MM-DD or null>",
      "limits": {
        "each_occurrence": <number or null>,
        "general_aggregate": <number or null>,
        "products_aggregate": <number or null>,
        "personal_advertising_injury": <number or null>,
        "combined_single_limit": <number or null>,
        "bodily_injury_per_person": <number or null>,
        "bodily_injury_per_accident": <number or null>,
        "property_damage": <number or null>,
        "employers_liability_el": <number or null>,
        "el_each_accident": <number or null>,
        "el_disease_policy_limit": <number or null>,
        "el_disease_each_employee": <number or null>
      },
      "additional_insured": "<yes | no | unclear>",
      "waiver_of_subrogation": "<yes | no | unclear>",
      "confidence": {
        "carrier_name": <0.0-1.0>,
        "policy_number": <0.0-1.0>,
        "effective_date": <0.0-1.0>,
        "expiration_date": <0.0-1.0>,
        "limits": <0.0-1.0>,
        "additional_insured": <0.0-1.0>,
        "waiver_of_subrogation": <0.0-1.0>
      }
    }
  ]
}

Rules:
- Return null for fields you cannot find or read clearly.
- Set confidence to 0.0 for any field that is missing, unclear, or smudged.
- Dates must be YYYY-MM-DD format. If only month/year visible, use the first of the month.
- Dollar amounts as plain numbers (no $ or commas). Example: 1000000.
- Do NOT infer or guess values — only extract what is visible on the document.
- Return raw JSON only. No explanation text.
"""


def _pdf_to_images(pdf_bytes: bytes) -> list[bytes]:
    """Convert PDF pages to PNG bytes using pypdfium2."""
    import pypdfium2 as pdfium  # lazy import — not needed at module load

    pdf = pdfium.PdfDocument(pdf_bytes)
    images = []
    for page in pdf:
        bitmap = page.render(scale=2.0)  # 2× scale for better OCR accuracy
        pil_image = bitmap.to_pil()
        buf = io.BytesIO()
        pil_image.save(buf, format='PNG')
        images.append(buf.getvalue())
    return images


def _call_anthropic(image_bytes_list: list[bytes]) -> dict:
    """Send COI images to Anthropic and return parsed JSON."""
    import anthropic  # lazy import

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Build content blocks — one image per PDF page (cap at 4 pages)
    content = []
    for img_bytes in image_bytes_list[:4]:
        b64 = base64.standard_b64encode(img_bytes).decode('utf-8')
        content.append({
            'type': 'image',
            'source': {'type': 'base64', 'media_type': 'image/png', 'data': b64},
        })
    content.append({'type': 'text', 'text': EXTRACTION_PROMPT})

    message = client.messages.create(
        model='claude-opus-4-6',
        max_tokens=4096,
        messages=[{'role': 'user', 'content': content}],
    )

    raw = message.content[0].text.strip()
    # Strip accidental markdown fences if model adds them
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1].rsplit('```', 1)[0]
    return json.loads(raw)


def _parse_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), '%Y-%m-%d').date()
    except ValueError:
        return None


# ── Celery task ───────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def extract_coi(self, document_id: str):
    """
    Main extraction task. Called after a COI file is uploaded.
    Updates document.status through: processing → extracted | failed
    """
    from .models import COIDocument, ExtractedCoverage  # avoid circular import

    try:
        doc = COIDocument.objects.select_related('organization').get(id=document_id)
    except COIDocument.DoesNotExist:
        logger.error('extract_coi: document %s not found', document_id)
        return

    doc.status = 'processing'
    doc.save(update_fields=['status'])

    try:
        # ── 1. Fetch PDF bytes ────────────────────────────────────────────────
        pdf_bytes = _get_pdf_bytes(doc.file_key)

        # ── 2. Convert to images ──────────────────────────────────────────────
        images = _pdf_to_images(pdf_bytes)
        if not images:
            raise ValueError('PDF produced no renderable pages')

        # ── 3. Call Anthropic ─────────────────────────────────────────────────
        extracted = _call_anthropic(images)

        # ── 4. Save top-level COI metadata ───────────────────────────────────
        doc.insured_name = extracted.get('insured_name')
        doc.certificate_holder_name = extracted.get('certificate_holder_name')
        doc.producer_name = extracted.get('producer_name')
        doc.certificate_date = _parse_date(extracted.get('certificate_date'))
        doc.status = 'extracted'
        doc.save(update_fields=[
            'insured_name', 'certificate_holder_name', 'producer_name',
            'certificate_date', 'status',
        ])

        # ── 5. Save coverage rows ─────────────────────────────────────────────
        # Delete any previous extraction (re-run scenario)
        ExtractedCoverage.objects.filter(document=doc).delete()

        for cov in extracted.get('coverages', []):
            ExtractedCoverage.objects.create(
                document=doc,
                coverage_type=cov.get('coverage_type', 'other'),
                carrier_name=cov.get('carrier_name'),
                policy_number=cov.get('policy_number'),
                effective_date=_parse_date(cov.get('effective_date')),
                expiration_date=_parse_date(cov.get('expiration_date')),
                limits=cov.get('limits') or {},
                additional_insured=cov.get('additional_insured', 'unclear'),
                waiver_of_subrogation=cov.get('waiver_of_subrogation', 'unclear'),
                confidence=cov.get('confidence') or {},
            )

        logger.info(
            'extract_coi: document %s extracted — %d coverages',
            document_id, len(extracted.get('coverages', [])),
        )

    except Exception as exc:
        logger.exception('extract_coi: failed for document %s', document_id)
        try:
            doc.status = 'failed'
            doc.save(update_fields=['status'])
        except Exception:
            pass
        raise self.retry(exc=exc)


def _get_pdf_bytes(file_key: str) -> bytes:
    """
    Download PDF from R2 (production) or read from /tmp (local dev when R2 not configured).
    """
    from django.conf import settings

    if settings.R2_ENDPOINT_URL and settings.R2_ACCESS_KEY:
        from apps.common.storage import download_from_r2
        return download_from_r2(file_key)

    # Local dev fallback: file was saved to /tmp directly
    import os
    local_path = f'/tmp/{file_key}'
    if os.path.exists(local_path):
        with open(local_path, 'rb') as f:
            return f.read()

    raise FileNotFoundError(f'PDF not found locally at {local_path} and R2 is not configured')
