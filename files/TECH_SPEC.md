# COI Tracker — Technical Specification

**Status:** Draft v0.1 · Concept / pre-build
**Owner:** Founder
**Last updated:** May 2026

> Read `PRD.md` first for product scope. This document covers *how* the MVP is
> built: stack, the AI extraction pipeline, data model, and infrastructure.

---

## 1. Architecture overview

COI Tracker is a multi-tenant web application. At its core it is a CRUD app
(vendors, requirement profiles, documents) wrapped around two engines:

1. **An extraction pipeline** that turns a COI PDF into structured coverage
   data.
2. **A scheduled renewal engine** that watches expirations and sends emails.

```
                +------------------+
   Browser ---> |  Web app / API   | ---> Postgres (tenant data)
   (user)       |                  | ---> Object storage (COI PDFs)
                +------------------+
                     |        |
        extraction   |        |  daily scheduler
                     v        v
            +----------------+  +----------------------+
            | LLM extraction |  | Renewal job: scan    |
            | (Anthropic API)|  | expirations -> email |
            +----------------+  +----------------------+
                                          |
                                          v
                                 Transactional email
                                  + magic-link upload
```

There are no exotic components. The build risk is concentrated in two places:
**extraction accuracy** (§3) and **multi-tenant data isolation** (§7). Most of
the rest is well-trodden.

---

## 2. Stack

> **OPEN DECISION 3 — Stack: Spring Boot vs. a leaner full-stack.** This is
> flagged in the project knowledge base. The decision is laid out below with a
> recommendation; it is not yet final.

### The two options

**Option A — Spring Boot backend + React frontend.**
The founder's existing strength is Java/Spring Boot. Spring Boot is a strong
fit for the relational data model, has first-class scheduled-job support, and
is robust and well-documented. The cost is a heavier, more boilerplate-laden
codebase for a solo MVP, and the frontend still needs a separate React app and
deploy.

**Option B — A leaner full-stack framework** (e.g., a single-language
full-stack JS/TS framework, or Rails/Django).
One language, one codebase, one deploy; faster CRUD iteration; less ceremony.
The cost is a ramp-up tax — the founder is less expert here, and learning a new
stack *while* building the product adds schedule risk and unknowns.

### Recommendation (for review)

For a **solo founder, no funding, speed-to-MVP** situation, the dominant risk is
not throughput or architectural elegance — it is *time to a working product the
founder can iterate on confidently*. That argues for building on existing
strength.

**Lean toward Option A**, with one constraint: keep the frontend deliberately
simple. The app is dashboards, forms, and a review screen — it does not need a
heavy SPA. A modest React app (or even server-rendered views) is enough. The
"Spring Boot is heavy" objection is mostly an objection to *over-building* it;
a lean Spring Boot service is fine.

**Choose Option B only if** the founder genuinely wants the learning investment
and accepts a slower, less predictable MVP. The framework matters far less than
shipping — do not let this decision block the start of the build.

The rest of this spec is written **stack-agnostic** wherever possible.

### Components common to both options

| Concern | Choice | Notes |
|---------|--------|-------|
| Database | Managed PostgreSQL | Relational model; one managed instance is plenty for MVP. |
| Object storage | S3-compatible (S3 / R2 / Backblaze B2) | Stores COI PDFs; access via short-lived signed URLs only. |
| LLM | Anthropic API (Claude, vision-capable model) | Powers extraction — see §3. |
| Transactional email | Postmark, Resend, or SES | Deliverability matters: renewal emails must land. Postmark is strong for this. |
| Background jobs | Framework scheduler (Spring Scheduler/Quartz, or equivalent) | Daily expiration scan + reminder cadence. |
| Payments | Stripe (Billing / Checkout) | Subscriptions, trials, customer portal. |
| Auth | A hosted auth provider, or a vetted framework library | Do not hand-roll password storage. |
| Hosting | A PaaS (Render / Railway / Fly.io) or simple cloud (Elastic Beanstalk / ECS) | Minimize ops for a solo founder. |
| Error tracking | Sentry (or equivalent) | Non-negotiable for a solo operator. |

---

## 3. AI extraction pipeline

This is the core of the product. A COI is almost always an **ACORD 25**
("Certificate of Liability Insurance") — a semi-standardized one-page form — but
real-world COIs vary: different agency-management systems produce slightly
different layouts, some are scanned/photographed rather than digital, and some
include extra coverages or non-standard descriptions.

### Approach: vision-capable LLM, structured output

Rather than building a classic OCR + layout-parser + rules pipeline, the MVP
sends the COI document directly to a **vision-capable LLM** and asks for
structured JSON. This single approach handles both digital and scanned COIs and
absorbs layout variation, which is exactly where a brittle template parser would
fail. For a solo founder it removes a large amount of build and maintenance.

### Pipeline stages

1. **Ingest.** User uploads a PDF (F2). Validate type and size. Store the
   original in object storage. Create a `coi_document` row with status
   `uploaded`.
2. **Pre-process.** Normalize to a form the model accepts (e.g., per-page
   images at sufficient resolution). Reject obviously unusable input early
   (corrupt file, not a PDF, far too many pages).
3. **Extract.** Call the LLM with the document and a strict prompt instructing
   it to return **only JSON** matching a fixed schema (see below). Request a
   per-field confidence indicator.
4. **Validate.** Parse the JSON. Validate against the schema: dates are real
   dates, limits are numbers, coverage types are from a known set. Anything
   that fails validation or comes back low-confidence is marked **needs
   review**.
5. **Persist.** Write `extracted_coverage` rows linked to the document. Set
   document status to `extracted`.
6. **Review (human-in-the-loop).** Surface the extracted fields next to the
   source document (F4). The user confirms or corrects. Confirmed values become
   the source of truth (status `confirmed`).
7. **Compliance check.** Once confirmed, run the comparison against the
   vendor's requirement profile (§ data model) and store a `compliance_check`.

### Extraction schema (per COI)

Top-level: `insured_name`, `certificate_holder_name`, `producer_name`,
`certificate_date`, and a list of `coverages`. Each coverage:

| Field | Notes |
|-------|-------|
| `coverage_type` | One of a known enum: general liability, automobile, workers' comp / employers' liability, umbrella/excess, professional liability, other. |
| `carrier_name` | The insurer for this line. |
| `policy_number` | As printed. |
| `effective_date` / `expiration_date` | Normalized to ISO dates. |
| `limits` | Type-specific (e.g., each-occurrence, general aggregate, combined single limit). |
| `additional_insured` | Indicator from the ACORD face (yes / no / unclear). |
| `waiver_of_subrogation` | Indicator from the ACORD face (yes / no / unclear). |
| `field_confidence` | Model's confidence per field, used to drive the review queue. |

### Why human-in-the-loop is mandatory at MVP

Extraction will not be perfect — scans are noisy, handwriting and stamps appear,
limits are formatted inconsistently. The product's credibility depends on never
presenting a wrong value as confirmed fact. The review step (F4) converts an
imperfect model into a trustworthy product: the user *verifies* instead of
*types*, which is still a large time saving over the spreadsheet.

> **OPEN ITEM — Extraction accuracy target.** Set a concrete, measurable bar
> before build (e.g., field-level accuracy on a held-out set of real COIs, and
> a target for "% of COIs needing zero corrections"). To do this, **collect a
> test set of 30–50 real, varied COIs early** — different carriers, agency
> systems, and scan quality. This test set is the single most valuable
> derisking artifact for the project and should exist before the build commits
> to the extraction approach.

---

## 4. Data model

Core entities (Postgres). Every tenant-scoped table carries an
`organization_id`.

```
organization        — the customer / tenant
  id, name, billing fields, settings (reminder cadence, expiring-soon window)

user
  id, organization_id, email, name, role, auth fields

vendor              — a subcontractor/vendor being tracked
  id, organization_id, name, contact_name, contact_email, contact_phone,
  requirement_profile_id, notes, status

requirement_profile — a reusable set of insurance requirements
  id, organization_id, name

requirement_line    — one coverage requirement within a profile
  id, requirement_profile_id, coverage_type,
  min_each_occurrence, min_aggregate,
  additional_insured_required (bool), waiver_required (bool), is_required (bool)

coi_document        — an uploaded certificate
  id, organization_id, vendor_id, file_key (object storage),
  status (uploaded | extracted | confirmed | failed),
  uploaded_by, uploaded_at, source (upload | magic_link)

extracted_coverage  — one policy line extracted from a coi_document
  id, coi_document_id, coverage_type, carrier_name, policy_number,
  effective_date, expiration_date, limits (jsonb),
  additional_insured, waiver_of_subrogation,
  confidence (jsonb), confirmed (bool)

compliance_check    — result of evaluating a COI vs a vendor's profile
  id, organization_id, vendor_id, coi_document_id,
  status (compliant | non_compliant | expired | needs_review),
  reasons (jsonb — list of human-readable failure reasons), checked_at

renewal_request     — an outbound reminder for an expiring policy
  id, organization_id, vendor_id, coi_document_id,
  status (scheduled | sent | responded | expired_no_response),
  magic_link_token, sent_at, responded_at

activity_log        — audit trail
  id, organization_id, vendor_id, actor, action, detail (jsonb), created_at
```

Notes:
- A vendor has many COIs over time (versioned history, F10). The "current"
  coverage is derived from the most recent confirmed document per coverage type.
- `compliance_check` is recomputed whenever a COI is confirmed, a requirement
  profile changes, or the daily job runs (to catch newly-lapsed dates).
- `limits` and `reasons` are `jsonb` to avoid over-modeling type-specific fields
  in the MVP; revisit if reporting needs structured queries on limits.

---

## 5. API surface (illustrative)

A pragmatic REST API. Representative endpoints:

- `POST /vendors`, `GET /vendors`, `PATCH /vendors/:id` — roster management.
- `POST /vendors/import` — CSV bulk import.
- `POST /vendors/:id/documents` — upload a COI; triggers the extraction
  pipeline asynchronously.
- `GET /documents/:id` — extraction status and extracted fields.
- `PATCH /documents/:id/coverages` — submit user review/corrections; confirms
  the document.
- `GET /requirement-profiles`, `POST /requirement-profiles` — manage profiles.
- `GET /dashboard` — compliance buckets across all vendors.
- `POST /magic-link/:token` — unauthenticated COI upload from a renewal email.

Extraction is asynchronous: upload returns immediately with a `processing`
status; the client polls or is notified when extraction completes.

---

## 6. Renewal engine

A scheduled job runs daily and:

1. Finds confirmed coverages whose `expiration_date` falls inside the
   organization's reminder window.
2. For each, ensures a `renewal_request` exists and sends a reminder email if
   one is due per the configured cadence (e.g., at 30 / 14 / 3 days out).
3. Recomputes `compliance_check` for vendors whose policies have newly lapsed,
   so the dashboard reflects reality each morning.

The renewal email contains a **magic-link** (F9): a tokenized, expiring,
single-purpose URL to an unauthenticated upload page scoped to one vendor. An
upload through that page runs the same extraction pipeline and marks the
`renewal_request` as `responded`.

---

## 7. Security and tenancy

COIs contain business identifiers, policy numbers, and contact details — not
highly regulated PII, but customer data that must not leak across tenants.

- **Tenant isolation is the top correctness requirement.** Every query for
  tenant data must be scoped by `organization_id`. Enforce it at a single choke
  point (a base repository/query layer or row-level security), not by
  remembering to add a `WHERE` clause each time.
- **Documents** are private. Object storage is never public; access is via
  short-lived signed URLs issued only to authorized users.
- **Magic-link tokens** are high-entropy, expiring, single-purpose, and grant
  only the ability to upload a COI for one specific vendor — never read access.
- **Transport and storage**: TLS everywhere; encryption at rest for the
  database and object storage (managed providers give this by default).
- **Secrets** (LLM key, Stripe key, DB credentials) live in the platform's
  secret store, never in the repo.
- **Backups**: automated daily Postgres backups with a tested restore path.
- **Auth**: use a hosted auth provider or a well-vetted library; do not
  hand-roll password hashing or session handling.

---

## 8. Observability

For a solo operator, knowing silently-broken things is essential:

- **Error tracking** (Sentry or equivalent) on backend and frontend.
- **Extraction monitoring**: track success/failure rate, latency, and
  correction rate per document. A rising correction rate is an early warning
  that extraction quality is drifting.
- **Email monitoring**: track delivery, bounce, and open signals from the email
  provider; a renewal email that bounces is a silent failure of the core loop.
- **Uptime check** on the app and the daily job (alert if the renewal job did
  not run).

---

## 9. Cost model (rough, MVP scale)

| Item | Estimate | Notes |
|------|----------|-------|
| LLM extraction | ~$0.01–0.05 per COI | A 1–2 page document via a vision model. Even a vendor with 100 COIs/year is cents per month. |
| Hosting (app + worker) | ~$25–60 / month | PaaS baseline. |
| Managed Postgres | ~$15–30 / month | Smallest tier is ample for MVP. |
| Object storage | a few $ / month | PDFs are small. |
| Transactional email | ~$0–15 / month | Free/low tier covers MVP volume. |
| Error tracking | free / low tier | |

**Implication:** baseline infrastructure is on the order of **$50–120/month**
total at MVP scale, and **per-customer marginal cost is a few dollars/month**.
At a ~$79/month price point, gross margin is healthy and extraction cost is not
a constraint on the business model. Detailed unit economics live in
`GTM.md §6`.

---

## 10. Build phases

A suggested sequencing for a solo build. Each phase ends with something
demonstrable.

**Phase 0 — Foundations.** Repo, deploy pipeline, Postgres, auth, organization
+ user models, multi-tenant scoping choke point, error tracking. *Outcome: a
deployed, empty, multi-tenant shell.*

**Phase 1 — Extraction core.** COI upload, object storage, the LLM extraction
pipeline, the review/confirm screen. Build and test against the real-COI test
set (§3). *Outcome: upload a COI, get trustworthy structured data.*

**Phase 2 — Compliance.** Requirement profiles, the compliance check, the
dashboard. *Outcome: the product answers "who is a problem right now?"*

**Phase 3 — Renewal loop.** Daily scheduler, renewal emails, magic-link upload.
*Outcome: the product chases renewals hands-off.*

**Phase 4 — Commercialize.** Stripe billing, onboarding/CSV import polish,
empty states, error handling. *Outcome: a stranger can sign up and pay.*

> The **real-COI test set should be assembled during Phase 0**, before Phase 1
> commits to the extraction approach. It is the cheapest possible insurance
> against the project's biggest technical risk.

---

## 11. Open questions

> **OPEN DECISION 3 — Stack** (see §2). Recommendation: build on existing
> Spring Boot strength with a deliberately lean frontend; choose a new stack
> only as a conscious learning investment. Do not let this block the build.

> **OPEN ITEM — Extraction accuracy target and test set** (see §3). Define a
> measurable bar and collect 30–50 varied real COIs before Phase 1.

> **OPEN ITEM — Async UX for extraction.** Poll vs. push for extraction-complete
> notification. Polling is simplest for MVP; revisit if it feels slow.

> **OPEN ITEM — Build vs. buy auth.** A hosted provider speeds the MVP and
> reduces security surface; a framework library avoids a recurring cost.
> Decide based on the chosen stack.

---

*Companion documents: `PRD.md` (what is being built) · `GTM.md` (how it sells).*
