# sened — Implementation Plan

**Role:** Senior Software Engineer  
**Date:** May 2026  
**Stack decision:** Python 3.12 + Django 5.x + Django REST Framework · React 18 (Vite)  
**Build path:** Validation MVP → Full MVP  
**Companion docs:** `PRD.md` · `TECH_SPEC.md` · `RISKS_AND_VALIDATION.md` · `GTM.md`

---

## 0. Decisions Locked Before Any Code

| Decision | Resolution | Rationale |
|---|---|---|
| **Backend** | Django 5.x + Django REST Framework | Fast CRUD iteration, Django ORM is excellent for relational models, battle-tested multi-tenancy patterns. |
| **Async tasks** | Celery + Upstash Redis (free tier) | Celery handles both async extraction jobs and the scheduled renewal engine. Upstash Redis is free (10K commands/day, 256 MB) — no extra paid service. |
| **Frontend** | React 18 + Vite + Tailwind | Dashboards, forms, review screen — keep it deliberately simple. |
| **Auth** | Auth0 (free tier) + `mozilla-django-oidc` | Hosted provider eliminates hand-rolled session/password risk. Free up to 7,500 MAU. |
| **Database** | Neon (serverless Postgres, free tier) | 0.5 GB free, scales to zero, excellent Django ORM support. |
| **Object storage** | Cloudflare R2 | S3-compatible, zero egress cost, 10 GB free. Accessed via `boto3`. |
| **Email** | Resend (free tier) | 3,000 emails/month free. Swap to paid ($20/month) when renewal volume grows. |
| **Hosting** | Fly.io (free tier) | Django + Gunicorn fits well inside 256 MB with no JVM overhead. |
| **Payments** | Stripe | No monthly fee; pay-per-transaction. `stripe` Python SDK. |
| **Error tracking** | Sentry (`sentry-sdk[django,celery]`) | Free tier (5K errors/month). Non-negotiable for solo ops. |
| **Async extraction UX** | Polling every 3 s, max 60 s | Simplest for MVP. Move to SSE only if polling feels unacceptable to real users. |
| **"Compliant" language** | Renamed → **"Matches requirements as shown on certificate"** | Mitigates A8 trust/liability risk (RISKS_AND_VALIDATION). |

---

## 1. Repository & Project Structure

```
sened/
├── backend/
│   ├── manage.py
│   ├── requirements.txt            # pinned via pip-tools (requirements.in → requirements.txt)
│   ├── Procfile                    # web: gunicorn · worker: celery worker · beat: celery beat
│   ├── fly.toml
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py             # shared settings
│   │   │   ├── development.py      # DEBUG=True, local Postgres, local Redis
│   │   │   └── production.py       # reads all secrets from env vars
│   │   ├── urls.py                 # root URL conf
│   │   ├── celery.py               # Celery app definition
│   │   └── wsgi.py
│   └── apps/
│       ├── organizations/          # Organization + User models, Auth0 integration
│       ├── vendors/                # Vendor + RequirementProfile models, CSV import
│       ├── documents/              # COIDocument + ExtractedCoverage, extraction pipeline
│       ├── compliance/             # ComplianceCheck engine
│       ├── renewals/               # RenewalRequest, Celery Beat job, magic-link
│       └── billing/                # Stripe webhooks, subscription state
│
├── frontend/                       # React 18 + Vite + Tailwind
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/                  # React Query data hooks
│   │   └── api/                    # Typed fetch client
│   └── vite.config.ts
│
└── docker-compose.yml              # local dev: Postgres + Redis
```

**Key structural rule:** Every queryset on tenant data must filter by `organization_id`. Enforce this in a custom `TenantQuerySet` base class — not by remembering to add `.filter(organization_id=...)` in each view. This is the single most important correctness rule in the codebase.

```python
# apps/common/querysets.py
class TenantQuerySet(models.QuerySet):
    def for_org(self, organization_id):
        return self.filter(organization_id=organization_id)

# Usage in every view:
vendors = Vendor.objects.for_org(request.org_id).all()
```

Write a test that proves cross-tenant data cannot be accessed. Keep it green forever.

---

## 2. Python Dependencies

```
# requirements.in  (compile to requirements.txt with pip-tools)

# Framework
django==5.1.*
djangorestframework==3.15.*
django-cors-headers

# Database
psycopg[binary]           # Postgres driver (psycopg3)
dj-database-url           # parse DATABASE_URL env var

# Auth
mozilla-django-oidc       # Auth0 JWT validation

# Async / scheduling
celery[redis]==5.4.*
django-celery-beat        # stores schedule in Postgres (no Redis needed for beat storage)

# Object storage
boto3                     # R2 via S3-compatible API

# AI extraction
anthropic                 # Anthropic Python SDK (official)
PyMuPDF                   # PDF → page images (import as fitz)

# Email
resend                    # or requests — Resend API is simple REST

# Payments
stripe

# Rate limiting
django-ratelimit

# Error tracking
sentry-sdk[django,celery]

# Utilities
python-decouple           # read .env in dev, env vars in prod
pillow                    # image handling
python-csv-detective       # CSV validation for bulk import
```

---

## 3. Data Model (Django ORM)

Each app owns its models. Every tenant-scoped model inherits from a `TenantModel` base.

```python
# apps/common/models.py
import uuid
from django.db import models

class TenantModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'organizations.Organization', on_delete=models.CASCADE,
        db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        indexes = [models.Index(fields=['organization'])]
```

### apps/organizations/models.py
```python
class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    stripe_customer_id = models.TextField(null=True)
    stripe_subscription_id = models.TextField(null=True)
    subscription_status = models.TextField(default='trialing')
    reminder_lead_days = models.IntegerField(default=30)
    reminder_cadence_days = models.IntegerField(default=7)
    expiring_soon_days = models.IntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True)

class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    email = models.EmailField(unique=True)
    name = models.TextField()
    role = models.TextField(default='member')   # 'owner' | 'member'
    auth0_sub = models.TextField(unique=True, null=True)  # Auth0 subject claim
    created_at = models.DateTimeField(auto_now_add=True)
```

### apps/vendors/models.py
```python
class RequirementProfile(TenantModel):
    name = models.TextField()

class RequirementLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(RequirementProfile, on_delete=models.CASCADE,
                                related_name='lines')
    coverage_type = models.TextField()
    is_required = models.BooleanField(default=True)
    min_each_occurrence = models.BigIntegerField(null=True)
    min_aggregate = models.BigIntegerField(null=True)
    additional_insured_required = models.BooleanField(default=False)
    waiver_required = models.BooleanField(default=False)

class Vendor(TenantModel):
    name = models.TextField()
    contact_name = models.TextField(null=True)
    contact_email = models.EmailField(null=True)
    contact_phone = models.TextField(null=True)
    notes = models.TextField(null=True)
    requirement_profile = models.ForeignKey(RequirementProfile, null=True,
                                            on_delete=models.SET_NULL)
    status = models.TextField(default='active')
```

### apps/documents/models.py
```python
class COIDocument(TenantModel):
    vendor = models.ForeignKey('vendors.Vendor', on_delete=models.CASCADE)
    file_key = models.TextField()               # R2 object key
    status = models.TextField(default='uploaded')
    # uploaded | processing | extracted | confirmed | failed
    source = models.TextField(default='upload') # upload | magic_link
    uploaded_by = models.ForeignKey('organizations.User', null=True,
                                    on_delete=models.SET_NULL)
    # Top-level COI metadata (populated after extraction)
    insured_name = models.TextField(null=True)
    certificate_holder_name = models.TextField(null=True)
    producer_name = models.TextField(null=True)
    certificate_date = models.DateField(null=True)

class ExtractedCoverage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(COIDocument, on_delete=models.CASCADE,
                                 related_name='coverages')
    coverage_type = models.TextField()
    carrier_name = models.TextField(null=True)
    policy_number = models.TextField(null=True)
    effective_date = models.DateField(null=True)
    expiration_date = models.DateField(null=True)
    limits = models.JSONField(null=True)
    additional_insured = models.TextField(null=True)   # 'yes'|'no'|'unclear'
    waiver_of_subrogation = models.TextField(null=True)
    confidence = models.JSONField(null=True)            # per-field 0.0–1.0
    confirmed = models.BooleanField(default=False)
    confirmed_at = models.DateTimeField(null=True)
    confirmed_by = models.ForeignKey('organizations.User', null=True,
                                     on_delete=models.SET_NULL)
```

### apps/compliance/models.py
```python
class ComplianceCheck(TenantModel):
    vendor = models.ForeignKey('vendors.Vendor', on_delete=models.CASCADE)
    document = models.ForeignKey('documents.COIDocument', on_delete=models.CASCADE)
    status = models.TextField()
    # matches_requirements | gaps_found | expired | needs_review
    reasons = models.JSONField(null=True)   # list of human-readable strings
    checked_at = models.DateTimeField(auto_now_add=True)
```

### apps/renewals/models.py  (Full MVP)
```python
class RenewalRequest(TenantModel):
    vendor = models.ForeignKey('vendors.Vendor', on_delete=models.CASCADE)
    document = models.ForeignKey('documents.COIDocument', null=True,
                                 on_delete=models.SET_NULL)
    status = models.TextField(default='scheduled')
    # scheduled | sent | responded | expired_no_response
    magic_link_token = models.TextField(unique=True, null=True)
    magic_link_expires_at = models.DateTimeField(null=True)
    sent_at = models.DateTimeField(null=True)
    responded_at = models.DateTimeField(null=True)

class ActivityLog(TenantModel):
    vendor = models.ForeignKey('vendors.Vendor', null=True, on_delete=models.SET_NULL)
    actor = models.TextField()       # user email or 'system'
    action = models.TextField()
    detail = models.JSONField(null=True)
```

Run `python manage.py makemigrations` after each model change. Never edit a committed migration file.

---

## 4. Build Phases

### PHASE 0 — Foundations (Est. ~1 week)

**Goal:** A deployed, authenticated, multi-tenant shell. All dangerous decisions behind you.

**Tasks:**

1. **Repo & tooling.** Initialize monorepo. `pip-tools` for pinned deps. `ruff` for linting (fast, replaces flake8 + isort). `pytest-django` for tests. GitHub Actions CI (lint + test on push).

2. **Local dev environment.**
   ```yaml
   # docker-compose.yml
   services:
     db:
       image: postgres:16
       environment: { POSTGRES_DB: sened, POSTGRES_PASSWORD: dev }
       ports: ["5432:5432"]
     redis:
       image: redis:7-alpine
       ports: ["6379:6379"]
   ```

3. **Django settings split.** `base.py` → `development.py` → `production.py`. All secrets via `python-decouple` (reads `.env` in dev, environment variables in prod). Zero secrets in the repo.

4. **Database.** Run initial migrations for `organizations` app. Add `organization_id` indexes from day one.

5. **Auth — Auth0 integration.** Use `mozilla-django-oidc` to validate Auth0 JWTs. Write a `TenantAuthMiddleware` that resolves `request.org_id` and `request.user_obj` from the token on every request.
   ```python
   # The one rule: no view touches the DB without going through request.org_id
   # Never trust a client-supplied organization_id in a request body
   ```

6. **Tenant isolation choke point.** Implement `TenantQuerySet` base class (see §3). Write a pytest test that creates two organizations, asserts org A cannot retrieve org B's data through any queryset. This test runs in CI on every push.

7. **Organization + user CRUD.** Sign-up creates org + user in one `transaction.atomic()` block. Auth0 `sub` claim stored on `User` for lookup.

8. **Error tracking.** `sentry_sdk.init()` in `settings/base.py` with `integrations=[DjangoIntegration(), CeleryIntegration()]`. Instrument before any real feature code.

9. **Celery wiring.** `config/celery.py` with Upstash Redis as broker. `django-celery-beat` stores the periodic task schedule in Postgres (no separate Redis-backed beat store needed).

10. **Deploy pipeline.** `fly.toml` + `Procfile`:
    ```
    web:    gunicorn config.wsgi --workers 2 --bind 0.0.0.0:8080
    worker: celery -A config worker --loglevel=info --concurrency 2
    beat:   celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
    ```
    On Fly.io free tier, the web process and the Celery worker run as separate Fly machines (both within the free VM allowance). Celery beat runs as a third lightweight process or is folded into the worker with `--beat` flag for MVP simplicity.

11. **Health check.** `GET /api/health/` returns `{"status": "ok", "db": "ok"}` — checks DB with `connection.ensure_connection()`.

**Exit criterion:** A logged-in user can hit `GET /api/me/` and get back their organization and user. Cross-tenant leak test passes.

---

### PHASE 1 — Extraction Core — *Validation MVP* (Est. ~2 weeks)

**Goal:** Upload a COI → get trustworthy structured data → see an expiration list.

#### 1A — File upload

```python
# apps/documents/views.py
class COIUploadView(APIView):
    parser_classes = [MultiPartParser]

    @method_decorator(ratelimit(key='user', rate='10/m', block=True))
    def post(self, request, vendor_id):
        vendor = Vendor.objects.for_org(request.org_id).get(id=vendor_id)
        file = request.FILES['file']
        # Validate: content-type, size (max 20 MB), basic PDF header check
        validate_pdf_upload(file)
        # Store to R2
        file_key = f"{request.org_id}/{vendor_id}/{uuid4()}.pdf"
        upload_to_r2(file_key, file)
        # Create document record
        doc = COIDocument.objects.create(
            organization_id=request.org_id,
            vendor=vendor,
            file_key=file_key,
            source='upload',
            uploaded_by=request.user_obj,
        )
        # Kick off async extraction
        extract_coi.delay(str(doc.id))
        return Response({'documentId': doc.id, 'status': 'processing'}, status=202)
```

Rate limiting via `django-ratelimit`: 10 uploads per org per minute. Apply the same limit to the magic-link upload endpoint.

#### 1B — R2 object storage

```python
# apps/common/storage.py
import boto3
from django.conf import settings

s3 = boto3.client(
    's3',
    endpoint_url=settings.R2_ENDPOINT_URL,       # https://<account>.r2.cloudflarestorage.com
    aws_access_key_id=settings.R2_ACCESS_KEY,
    aws_secret_access_key=settings.R2_SECRET_KEY,
    region_name='auto',
)

def upload_to_r2(key: str, file) -> None:
    s3.upload_fileobj(file, settings.R2_BUCKET, key)

def get_signed_url(key: str, expires_in: int = 900) -> str:
    # 15-minute expiry — never expose raw keys or public URLs
    return s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': settings.R2_BUCKET, 'Key': key},
        ExpiresIn=expires_in,
    )
```

#### 1C — AI extraction pipeline (Celery task)

This is the highest-risk component. Built as an isolated Celery task with a clean interface so it can be tested independently.

```python
# apps/documents/tasks.py
import fitz          # PyMuPDF
import anthropic
import base64, json
from celery import shared_task
from .models import COIDocument

@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def extract_coi(self, document_id: str):
    doc = COIDocument.objects.get(id=document_id)
    doc.status = 'processing'
    doc.save(update_fields=['status'])

    try:
        # 1. Fetch PDF bytes from R2
        pdf_bytes = download_from_r2(doc.file_key)

        # 2. Convert PDF pages to base64 PNG images (PyMuPDF)
        images = pdf_to_images(pdf_bytes, max_pages=5, dpi=150)
        # Reject docs with too many pages early — don't send unbounded content to model

        # 3. Call Anthropic vision API
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=4096,
            system=EXTRACTION_SYSTEM_PROMPT,  # strict JSON-only instruction
            messages=[{
                "role": "user",
                "content": [
                    *[{"type": "image", "source": {"type": "base64",
                       "media_type": "image/png", "data": img}} for img in images],
                    {"type": "text", "text": "Extract the COI data as JSON per the schema."}
                ]
            }]
        )

        # 4. Parse and validate JSON
        raw = response.content[0].text
        data = parse_and_validate_extraction(raw)  # raises on malformed JSON / schema mismatch

        # 5. Persist extracted coverages
        save_extraction(doc, data)
        doc.status = 'extracted'
        doc.save(update_fields=['status', 'insured_name', 'certificate_holder_name',
                                'producer_name', 'certificate_date'])

    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        doc.status = 'failed'
        doc.save(update_fields=['status'])
        raise  # Sentry captures this
```

**`pdf_to_images` using PyMuPDF:**
```python
def pdf_to_images(pdf_bytes: bytes, max_pages: int = 5, dpi: int = 150) -> list[str]:
    pdf = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for i, page in enumerate(pdf):
        if i >= max_pages:
            break
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        images.append(base64.standard_b64encode(png_bytes).decode())
    return images
```

**Extraction system prompt** (iterate heavily against your real COI test set):
```
You are a COI data extractor. Given one or more images of a Certificate of Insurance 
(typically ACORD 25), return ONLY valid JSON matching this exact schema — no prose, 
no explanation, just JSON.

Schema: { insured_name, certificate_holder_name, producer_name, certificate_date,
          coverages: [{ coverage_type, carrier_name, policy_number, effective_date, 
          expiration_date, limits, additional_insured, waiver_of_subrogation, confidence }] }

coverage_type must be one of: general_liability, automobile, workers_comp, umbrella, 
professional_liability, other.

For each field, include a confidence value (0.0–1.0). Return null (not a guess) for 
fields you cannot read with confidence >= 0.6. Dates must be ISO format (YYYY-MM-DD).
```

> **Critical gate:** Run the extraction spike on your 30–50 real COI test set **before** building any Phase 1 UI. Measure per-field accuracy. If accuracy is not good enough, adjust the prompt or model — before product code is committed.

#### 1D — Review & confirm screen (F4)

- `GET /api/documents/{id}/` — returns extraction status and all extracted fields.
- Frontend: split-pane layout — PDF viewer (`react-pdf`) left, editable fields right.
- Fields with `confidence < 0.7` are highlighted amber: *"Low confidence — please verify."*
- `PATCH /api/documents/{id}/confirm/` — accepts corrected field values, marks `confirmed=True`, fires `run_compliance_check.delay(vendor_id, document_id)`.

#### 1E — Vendor roster & expiration list

- Standard DRF `ModelViewSet` for vendors with `for_org()` queryset scoping.
- `POST /api/vendors/import/` — parse CSV with `csv.DictReader`, validate headers, bulk-create in `transaction.atomic()`, return summary `{created, skipped, errors}`.
- Expiration list view: `GET /api/dashboard/expirations/` — returns all confirmed coverages across vendors, ordered by `expiration_date ASC`. Color logic lives in the frontend (expired / expiring ≤ 30 days / active).

**Exit criterion (Validation MVP):** Sign up → add vendors → upload COIs → review extracted fields → confirm → see expiration list. Show to design partners. Ask for money.

---

### PHASE 2 — Compliance Engine (Est. ~1 week)

**Goal:** The product answers "who is a problem right now?"

#### 2A — Requirement profiles (F5)

Standard CRUD. Seed a default profile on org creation inside a post-save signal:
```python
@receiver(post_save, sender=Organization)
def create_default_profile(sender, instance, created, **kwargs):
    if created:
        profile = RequirementProfile.objects.create(
            organization=instance, name="Standard (edit to match your contracts)")
        RequirementLine.objects.bulk_create([
            RequirementLine(profile=profile, coverage_type='general_liability',
                            min_each_occurrence=1_000_000, min_aggregate=2_000_000),
            RequirementLine(profile=profile, coverage_type='automobile',
                            min_each_occurrence=1_000_000),
            RequirementLine(profile=profile, coverage_type='workers_comp', is_required=True),
        ])
```

#### 2B — Compliance check engine (F6)

Pure Python function — no I/O, no Django ORM. Trivially unit-testable.

```python
# apps/compliance/engine.py
from dataclasses import dataclass
from datetime import date

@dataclass
class CheckResult:
    status: str   # matches_requirements | gaps_found | expired | needs_review
    reasons: list[str]

def run_compliance_check(profile_lines, confirmed_coverages) -> CheckResult:
    reasons = []
    has_expired = False
    has_gap = False
    needs_review = False

    for line in profile_lines:
        if not line.is_required:
            continue
        coverage = next((c for c in confirmed_coverages
                         if c.coverage_type == line.coverage_type), None)
        if coverage is None:
            reasons.append(f"No {line.coverage_type} coverage found on certificate")
            has_gap = True
            continue
        if coverage.expiration_date and coverage.expiration_date < date.today():
            reasons.append(f"{line.coverage_type} policy expired {coverage.expiration_date}")
            has_expired = True
        if coverage.confidence and any(v < 0.6 for v in coverage.confidence.values()):
            needs_review = True
        limits = coverage.limits or {}
        if line.min_each_occurrence and limits.get('each_occurrence', 0) < line.min_each_occurrence:
            reasons.append(
                f"{line.coverage_type} each occurrence ${limits.get('each_occurrence', 0):,} "
                f"below required ${line.min_each_occurrence:,}")
            has_gap = True
        if line.min_aggregate and limits.get('aggregate', 0) < line.min_aggregate:
            reasons.append(f"{line.coverage_type} aggregate below required ${line.min_aggregate:,}")
            has_gap = True
        if line.additional_insured_required and coverage.additional_insured != 'yes':
            reasons.append(f"{line.coverage_type} — additional insured not indicated")
            has_gap = True
        if line.waiver_required and coverage.waiver_of_subrogation != 'yes':
            reasons.append(f"{line.coverage_type} — waiver of subrogation not indicated")
            has_gap = True

    if needs_review and not reasons:
        status = 'needs_review'
    elif has_expired:
        status = 'expired'
    elif has_gap:
        status = 'gaps_found'
    else:
        status = 'matches_requirements'

    return CheckResult(status=status, reasons=reasons)
```

The Celery task wraps this function, fetches the data, and writes the `ComplianceCheck` row. Re-runs on: COI confirmed, requirement profile changed, daily job.

#### 2C — Compliance dashboard (F7)

Single efficient query — no N+1:

```python
# apps/compliance/views.py
def dashboard(request):
    # Latest compliance check per vendor in one query
    latest_checks = ComplianceCheck.objects \
        .filter(organization_id=request.org_id) \
        .order_by('vendor_id', '-checked_at') \
        .distinct('vendor_id') \
        .select_related('vendor')

    buckets = {'expired': [], 'gaps_found': [], 'needs_review': [], 'matches_requirements': []}
    for check in latest_checks:
        buckets[check.status].append(ComplianceCheckSerializer(check).data)
    return Response(buckets)
```

**Exit criterion:** Every vendor bucketed by status; non-compliant reasons are specific and human-readable.

---

### PHASE 3 — Renewal Loop (Est. ~1.5 weeks)

**Goal:** The product chases renewals hands-off.

#### 3A — Celery Beat scheduled job

```python
# In Django admin or via data migration:
PeriodicTask.objects.create(
    name='Daily renewal scan',
    task='apps.renewals.tasks.run_renewal_scan',
    crontab=CrontabSchedule.objects.get_or_create(hour=8, minute=0)[0],
)
```

```python
@shared_task
def run_renewal_scan():
    # Sentry cron check-in: mark start
    for org in Organization.objects.filter(subscription_status__in=['trialing', 'active']):
        scan_org_renewals(org)
    # Sentry cron check-in: mark success
```

`scan_org_renewals(org)` finds confirmed coverages expiring within `org.reminder_lead_days`, upserts `RenewalRequest` rows, and fires `send_renewal_email.delay(renewal_id)` for those due per the configured cadence.

Also recomputes `ComplianceCheck` for vendors whose policies have newly lapsed since the last run.

#### 3B — Renewal emails (F8)

```python
import resend

def send_renewal_email(renewal: RenewalRequest) -> None:
    resend.Emails.send({
        "from": "noreply@yourdomain.com",
        "to": renewal.vendor.contact_email,
        "subject": f"Insurance renewal needed — {renewal.vendor.name}",
        "html": render_renewal_email_html(renewal),  # Django template
    })
    renewal.status = 'sent'
    renewal.sent_at = now()
    renewal.save(update_fields=['status', 'sent_at'])
```

Track bounces via Resend webhook → `POST /api/webhooks/resend/`. Log to `ActivityLog`.

#### 3C — Magic-link upload (F9)

```python
import secrets
from django.utils import timezone
from datetime import timedelta

def create_magic_link(renewal: RenewalRequest) -> str:
    token = secrets.token_urlsafe(32)   # 256-bit entropy
    renewal.magic_link_token = token
    renewal.magic_link_expires_at = timezone.now() + timedelta(days=60)
    renewal.save(update_fields=['magic_link_token', 'magic_link_expires_at'])
    return f"{settings.FRONTEND_URL}/upload/{token}"
```

Public (unauthenticated) endpoint:
```python
# No auth decorator — intentionally public
@ratelimit(key='ip', rate='5/h', block=True)
def magic_link_upload(request, token):
    try:
        renewal = RenewalRequest.objects.select_related('vendor').get(
            magic_link_token=token,
            magic_link_expires_at__gt=timezone.now(),
            status='sent',             # token is single-use
        )
    except RenewalRequest.DoesNotExist:
        return Response({'error': 'This link has expired or is invalid.'}, status=404)

    file = request.FILES['file']
    validate_pdf_upload(file)
    file_key = f"{renewal.vendor.organization_id}/{renewal.vendor_id}/{uuid4()}.pdf"
    upload_to_r2(file_key, file)

    doc = COIDocument.objects.create(
        organization_id=renewal.vendor.organization_id,
        vendor=renewal.vendor,
        file_key=file_key,
        source='magic_link',
    )
    renewal.status = 'responded'
    renewal.responded_at = timezone.now()
    renewal.document = doc
    renewal.save(update_fields=['status', 'responded_at', 'document'])

    extract_coi.delay(str(doc.id))
    return Response({'status': 'received'}, status=202)
```

**Exit criterion:** Vendor receives email, clicks magic link, uploads COI, system re-evaluates compliance automatically — zero login required.

---

### PHASE 4 — Commercialize (Est. ~1 week)

**Goal:** A stranger can sign up, use the product, and pay for it.

#### 4A — Stripe billing (F11)

```python
# Webhook handler
@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig = request.headers.get('Stripe-Signature')
    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        return HttpResponse(status=400)

    handlers = {
        'checkout.session.completed': handle_checkout_completed,
        'invoice.paid': handle_invoice_paid,
        'invoice.payment_failed': handle_payment_failed,
        'customer.subscription.deleted': handle_subscription_deleted,
    }
    handler = handlers.get(event['type'])
    if handler:
        handler(event['data']['object'])
    return HttpResponse(status=200)
```

Subscription states the app enforces:
- **trialing / active** → full access.
- **past_due** → full access + banner warning in frontend.
- **canceled** → read-only (data visible, uploads blocked).

#### 4B — Onboarding, empty states, activity log, document history

Same scope as the original plan. Activity log entries written in `transaction.atomic()` alongside the action they record — never fire-and-forget.

#### 4C — Final hardening

- Cross-tenant leak test in CI (must stay green).
- Playwright end-to-end test: sign up → add vendor → upload COI → confirm → see dashboard status.
- Verify Sentry receives events from both `web` and `worker` processes.
- Verify Celery Beat ran and the daily job completed (Sentry cron monitor alert if it doesn't fire within a 30-minute window of schedule).

---

## 5. API Reference Summary

All authenticated endpoints require `Authorization: Bearer {auth0_jwt}`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/me/` | ✓ | Current user + organization |
| POST | `/api/vendors/` | ✓ | Create vendor |
| GET | `/api/vendors/` | ✓ | List vendors |
| PATCH | `/api/vendors/{id}/` | ✓ | Update vendor |
| DELETE | `/api/vendors/{id}/` | ✓ | Soft-delete vendor |
| POST | `/api/vendors/import/` | ✓ | CSV bulk import |
| POST | `/api/vendors/{id}/documents/` | ✓ | Upload COI |
| GET | `/api/documents/{id}/` | ✓ | Extraction status + fields |
| PATCH | `/api/documents/{id}/confirm/` | ✓ | Submit review/confirm |
| GET | `/api/requirement-profiles/` | ✓ | List profiles |
| POST | `/api/requirement-profiles/` | ✓ | Create profile |
| PATCH | `/api/requirement-profiles/{id}/` | ✓ | Update profile |
| GET | `/api/dashboard/` | ✓ | Compliance buckets |
| GET | `/api/dashboard/expirations/` | ✓ | Validation MVP expiration list |
| POST | `/api/billing/checkout/` | ✓ | Create Stripe Checkout session |
| POST | `/api/billing/portal/` | ✓ | Create Stripe Customer Portal session |
| POST | `/api/webhooks/stripe/` | — | Stripe webhook (HMAC-verified) |
| POST | `/api/webhooks/resend/` | — | Resend bounce webhook |
| GET | `/api/health/` | — | Health check |
| GET | `/upload/{token}/` | — | Magic-link upload page |
| POST | `/upload/{token}/` | — | Magic-link COI upload |

---

## 6. Security Checklist

- [ ] Every queryset on tenant data uses `for_org(request.org_id)` — enforced via `TenantQuerySet`.
- [ ] Automated cross-tenant leak test in CI.
- [ ] COI PDFs accessed only via 15-minute presigned R2 URLs. Bucket is private.
- [ ] Magic-link tokens: `secrets.token_urlsafe(32)` (256-bit), expire 60 days, single-use (`status='sent'` check).
- [ ] Rate limiting on all LLM-triggering endpoints (upload + magic-link): `django-ratelimit`.
- [ ] Stripe webhook signature verified via `stripe.Webhook.construct_event`.
- [ ] Resend webhook verified via shared secret header.
- [ ] All secrets in Fly.io environment variables (`fly secrets set ...`). Zero secrets in repo.
- [ ] `PATCH /api/documents/{id}/confirm/` verifies the document belongs to `request.org_id` before accepting edits.
- [ ] `CSRF_COOKIE_SECURE = True`, `SECURE_SSL_REDIRECT = True`, `HSTS` headers in production settings.

---

## 7. Observability

| Signal | Tool | What to watch |
|---|---|---|
| Errors | Sentry (Django + Celery integrations) | Any unhandled exception in web or worker |
| Extraction quality | Custom DB query | `correction_rate` per org per week — rising = model drift |
| Extraction latency | Sentry performance | P95 time from upload to `extracted` status |
| Daily job health | Sentry cron monitor | Alert if job doesn't complete within 30 min of schedule |
| Email delivery | Resend dashboard + webhook | Bounces on renewal emails = silent loop failure |
| Uptime | Fly.io health check + Better Uptime (free) | Alert if `/api/health/` returns non-200 |

---

## 8. Effort Estimate

| Phase | Description | Est. effort |
|---|---|---|
| Phase 0 | Foundations | ~1 week |
| Phase 1 | Extraction core (Validation MVP) | ~2 weeks |
| Phase 2 | Compliance engine + dashboard | ~1 week |
| Phase 3 | Renewal loop + magic-link | ~1.5 weeks |
| Phase 4 | Stripe billing + polish + hardening | ~1 week |
| **Total** | Full MVP | **~6.5 weeks** |

> **Critical path item before Phase 1:** Assemble 30–50 real varied COI PDFs and run them through the Anthropic vision API. Measure field-level accuracy. Adjust the prompt until accuracy is acceptable. This is the cheapest test of the biggest technical risk — do it before any product code is committed.

---

## 9. Free-tier Cost at MVP Scale

| Service | Free tier | Upgrade trigger |
|---|---|---|
| Fly.io (web + worker) | 3 shared VMs, 256 MB each | Traffic growth or memory pressure → $1.94/VM/month |
| Neon (Postgres) | 0.5 GB | Storage approaches limit → $19/month |
| Upstash Redis | 10K commands/day, 256 MB | Celery task volume → $10/month |
| Cloudflare R2 | 10 GB, 1M writes/month | Growth → $0.015/GB/month |
| Auth0 | 7,500 MAU | Customer count → $23/month |
| Resend | 3,000 emails/month | Renewal volume → $20/month |
| Vercel (frontend) | Unlimited | Team features → $20/month |
| Sentry | 5,000 errors/month | Error volume → $26/month |
| Stripe | 0/month | 2.9% + 30¢ per transaction only |
| **Total** | **$0/month** | Upgrade when customers are paying |

---

## 10. Pre-Build Checklist

- [ ] Auth0 account + application + API registered.
- [ ] Anthropic API key obtained; credits loaded.
- [ ] Cloudflare R2 bucket created; API token with R2 permissions generated.
- [ ] Upstash Redis database created; `REDIS_URL` saved.
- [ ] Resend account created; sender domain DNS records added and verified.
- [ ] Stripe account created; test mode keys available.
- [ ] Fly.io account created; `flyctl` installed.
- [ ] Neon Postgres project created; connection string saved.
- [ ] **30–50 real COI PDFs assembled for the extraction spike.** Varied carriers, agency systems, scan quality. This is the single most valuable pre-build artifact.

---

*This plan is the engineering companion to `PRD.md` and `TECH_SPEC.md`. Update it as phases complete and decisions change.*
