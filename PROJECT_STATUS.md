# Sened — Project Status

**Last updated:** 2026-05-17  
**Current position:** Phase 1 complete → Phase 2 next  
**Next task:** Compliance engine (Phase 2)

---

## Phase Summary

| Phase | Description | Status | Notes |
|---|---|---|---|
| Phase 0 | Foundations | ✅ Complete | Minor gaps: no git commits, no pinned requirements.txt, no CI, Sentry not wired |
| Phase 1 | Extraction Core / Validation MVP | ✅ Complete | |
| Phase 2 | Compliance Engine | ❌ Not started | Next up |
| Phase 3 | Renewal Loop + Magic-link | ❌ Not started | |
| Phase 4 | Stripe Billing + Polish | ❌ Not started | |

---

## Phase 0 — Foundations ✅

### Done
- Monorepo structure (`backend/` + `frontend/`), `docker-compose.yml` (Postgres + Redis), `dev.sh` one-command startup
- Django settings split: `base.py` / `development.py` / `production.py` / `local.py` — all secrets via `python-decouple`
- All 6 Django apps scaffolded with models + migrations: `organizations`, `vendors`, `documents`, `compliance`, `renewals`, `billing`
- Full data model: `TenantModel` base, `TenantQuerySet.for_org()`, `TenantManager` — every tenant-scoped model correct
- `TenantAuthMiddleware`: Auth0 JWT validation, JWKS fetch with `lru_cache`, `request.auth_user` + `request.org_id` on every authenticated request
- Tenant isolation test: `apps/common/tests/test_tenant_isolation.py` — two-org cross-scoping assertions
- Health check: `GET /api/health/` with DB connectivity probe
- Celery wiring: `config/celery.py` with Upstash Redis broker; `django-celery-beat` installed
- Fly.io deploy config: `fly.toml` + `Procfile` ready
- Developer docs: `how_to/` folder — setup, local run, Auth0 config, common errors

### Remaining gaps
- [ ] No git commits yet — `main` branch has no history
- [ ] `requirements.txt` not compiled — only `requirements.in` exists (need to run `pip-tools`)
- [ ] No GitHub Actions CI pipeline
- [ ] Sentry not initialized in settings

---

## Phase 1 — Extraction Core / Validation MVP ✅

### Done
- `POST /api/documents/` — file upload: R2 storage + `/tmp` fallback for local dev, PDF validation, org-scoped vendor lookup
- `GET /api/documents/{id}/` — document detail with presigned R2 URL
- `POST /api/documents/{id}/confirm/` — save edits to extracted fields, mark confirmed
- `POST /api/documents/{id}/retry/` — re-trigger extraction for failed documents
- `extract_coi` Celery task — full pipeline: download PDF → convert pages to PNG via `pypdfium2` → call `claude-opus-4-6` → parse JSON → save `ExtractedCoverage` rows → retry on failure
- Detailed ACORD 25 extraction prompt with per-field confidence scoring (0.0–1.0)
- Vendor CRUD: `VendorListView`, `VendorDetailView` (soft-delete), `VendorImportView` (CSV bulk import with header validation + deduplication)
- Requirement profiles CRUD: `RequirementProfileListView` + `RequirementProfileDetailView` with line replacement on PATCH + DELETE
- `GET /api/dashboard/expirations/` — confirmed coverages ordered by expiration date (`apps/compliance/views.py`)
- Frontend pages: Dashboard, Vendors, VendorDetail, Upload (polling + confidence dots + editable coverage cards + confirm flow), Login, MagicUpload (stub)
- `RequirementProfiles.tsx` — full editor: create/edit/delete profiles, inline line table with all fields (coverage type, limits, add. insured, waiver)
- Typed API client: `api/client.ts`, `api/documents.ts`, `api/vendors.ts` (incl. `RequirementLineInput` / `RequirementProfileInput` types), `api/types.ts`
- `useAuthToken` hook keeping Axios `Authorization` header in sync with Auth0

---

## Phase 2 — Compliance Engine ❌

### To build
- [ ] `apps/compliance/engine.py` — pure Python `run_compliance_check(profile_lines, confirmed_coverages) → CheckResult` function (no I/O, fully unit-testable)
- [ ] `run_compliance_check` Celery task — wraps engine, fetches data, writes `ComplianceCheck` row; triggers on: COI confirmed, profile changed, daily job
- [ ] `GET /api/dashboard/` — compliance buckets view (latest check per vendor, one efficient query, no N+1)
- [ ] Default `RequirementProfile` seeded on org creation via `post_save` signal (3 standard lines: GL $1M/$2M, Auto $1M, Workers Comp)
- [ ] Re-run compliance check daily via Celery Beat (also re-checks newly-lapsed policies)

### Exit criterion
Every vendor bucketed by status (`matches_requirements` / `gaps_found` / `expired` / `needs_review`); non-compliant reasons are specific and human-readable.

---

## Phase 3 — Renewal Loop + Magic-link ❌

### To build
- [ ] `run_renewal_scan` Celery Beat task — daily at 08:00 UTC; scans confirmed coverages expiring within `org.reminder_lead_days`, upserts `RenewalRequest` rows, fires `send_renewal_email` per cadence
- [ ] `send_renewal_email` task — Resend API, updates `renewal.status = 'sent'`
- [ ] Resend bounce webhook: `POST /api/webhooks/resend/` → writes to `ActivityLog`
- [ ] Magic-link generation: `secrets.token_urlsafe(32)`, 60-day expiry, single-use (`status='sent'` check)
- [ ] Public magic-link upload endpoint: `GET/POST /upload/{token}/` — unauthenticated, rate-limited 5/h per IP
- [ ] `MagicUpload.tsx` — full vendor-facing upload page (no login required)
- [ ] Wire up `renewals/urls.py`

### Exit criterion
Vendor receives email, clicks magic link, uploads COI, system re-evaluates compliance automatically — zero login required.

---

## Phase 4 — Stripe Billing + Polish ❌

### To build
- [ ] Stripe Checkout session endpoint: `POST /api/billing/checkout/`
- [ ] Stripe Customer Portal endpoint: `POST /api/billing/portal/`
- [ ] Stripe webhook handler: `POST /api/webhooks/stripe/` — handles `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] Subscription enforcement: `canceled` → read-only (uploads blocked, data visible); `past_due` → full access + banner
- [ ] `ActivityLog` entries written atomically alongside the actions they record
- [ ] Onboarding flow and empty states
- [ ] Playwright end-to-end test: sign up → add vendor → upload COI → confirm → see dashboard status
- [ ] Wire up `billing/urls.py`
- [ ] Verify Sentry receives events from both `web` and `worker` processes
- [ ] Verify Celery Beat daily job completes (Sentry cron monitor alert)

### Exit criterion
A stranger can sign up, use the product, and pay for it.

---

## Open Housekeeping Items

These cut across phases and should be addressed as work progresses:

- [ ] Run `pip-compile requirements.in > requirements.txt` and commit pinned deps
- [ ] Initialize git and make first commit
- [ ] Set up GitHub Actions CI: lint (`ruff`) + `pytest` on push
- [ ] Initialize Sentry in `settings/base.py` with `DjangoIntegration()` + `CeleryIntegration()`
- [ ] Seed the Celery Beat `PeriodicTask` for the daily renewal scan (via data migration or Django admin)
- [ ] Add `INTERNAL_JOB_SECRET` guard to any internal trigger endpoints
