# COI Tracker — Product Requirements Document

**Status:** Draft v0.1 · Concept / pre-build
**Owner:** Founder
**Last updated:** May 2026

---

## 1. Summary

COI Tracker is a SaaS tool that automates collecting, reading, and
expiration-tracking of Certificates of Insurance (COIs) for businesses that
manage subcontractors and vendors.

A user uploads COI PDFs. The product reads them, extracts the coverage details,
checks them against the user's own insurance requirements, flags gaps and
lapses, and automatically chases vendors for renewals before coverage expires.

The MVP is a solo-built, self-serve web app aimed at small operators who track
this today in a spreadsheet.

---

## 2. Problem

A business that hires subcontractors or vendors is contractually and legally
exposed when one of those vendors lets their insurance lapse or carries less
coverage than required. If an uninsured sub causes injury or property damage,
liability can flow back to the hiring business and its insurer.

To manage that risk, the hiring business collects a **Certificate of Insurance**
— almost always an **ACORD 25 form** — from each vendor. Doing this correctly
means, for every vendor:

- confirming the COI shows the **required coverage types** (general liability,
  auto, workers' comp, umbrella, etc.)
- confirming the **limits** meet the minimums the business requires
- confirming the business is listed as **additional insured** and/or has a
  **waiver of subrogation** where its contracts require it
- tracking each policy's **expiration date**
- collecting a **fresh COI** every time a policy renews

Today this is a manual job, usually owned by an office manager or project admin
working in a spreadsheet. The spreadsheet does not read the PDF, does not know
when a policy expires, and does not chase anyone.

**The failure modes that result:**

1. **Missed expirations.** A policy lapses, nobody notices, and the business is
   unknowingly working with an uninsured vendor.
2. **Non-compliant COIs accepted.** The certificate is filed without anyone
   actually checking the limits or endorsements against requirements.
3. **Ad hoc renewal chasing.** Reminders go out late, inconsistently, or not at
   all — and the back-and-forth eats admin time.
4. **No audit trail.** When the business's own insurer audits it, or a general
   contractor up the chain asks for proof, reconstructing who was covered when
   is painful.

The cost of getting this wrong is asymmetric: hours of tedious admin work most
weeks, and a potentially uninsured-loss-sized event in the worst case.

---

## 3. Users

COI Tracker has a distinct **buyer** and **primary user**, though in the
smallest businesses they are the same person.

### Primary user — "the tracker"

An office manager, project administrator, compliance coordinator, or bookkeeper
who is responsible for vendor paperwork. They are not insurance experts. They
are organized, time-pressed, and currently maintaining the spreadsheet. They
feel the pain weekly and will be the day-to-day user.

### Buyer / economic decision-maker

The owner, controller, or operations lead. They feel the *risk* side of the
problem (an uninsured-loss event, a failed audit) more than the daily admin
grind. They approve the ~$79/month spend. In a 5–30 person business this is
often one or two conversations away from the primary user — sometimes the same
person.

### Who this is **not** for (at MVP)

Large GCs and enterprise property managers with dedicated risk teams. They are
served by incumbents (see `GTM.md §4`), buy through sales, and need features
out of MVP scope. COI Tracker's MVP wedge is the operator who is *currently
using a spreadsheet*.

> **OPEN DECISION 1 — Beachhead vertical.** Whether the primary user is at a
> general/trade contractor or a property-management firm changes the persona
> details, onboarding, and language. Tracked in `GTM.md §2`. This PRD is written
> to hold for either; vertical-specific decisions are flagged where they arise.

---

## 4. Jobs to be done

When a user "hires" COI Tracker, these are the jobs they need done:

1. **Collect a COI from a new vendor** without a long email back-and-forth.
2. **Verify a COI meets our requirements** without personally reading every line
   of an ACORD form.
3. **Know, at a glance, which vendors are out of compliance** — expired,
   expiring soon, under-limit, or missing a required coverage.
4. **Get renewed COIs collected automatically** instead of chasing each vendor
   by hand.
5. **Produce proof of coverage on demand** — for an insurer audit, a client, or
   a GC up the chain.

The MVP must do jobs 1–4 well. Job 5 is satisfied at a basic level (documents
and history are stored and exportable) and deepened later.

---

## 5. Goals and non-goals

### Goals (MVP)

- Replace the tracking spreadsheet as the **system of record** for vendor
  insurance.
- Make reading a COI **automatic and trustworthy** — extraction accurate enough
  that the user reviews rather than re-types.
- Make compliance status **unmissable** — the dashboard answers "who is a
  problem right now?" in one screen.
- Make renewal chasing **hands-off** — the system sends reminders on a schedule
  and ingests the new COI when it arrives.
- Be **self-serve**: a user can sign up, upload a roster, and get value the same
  day with no onboarding call.

### Non-goals (MVP — explicitly out of scope)

- **Carrier verification.** The MVP trusts the COI as presented; it does not
  call insurers to confirm a policy is in force.
- **Insurance advice.** The product checks COIs against requirements the *user*
  defines. It does not recommend what coverage or limits a business should
  require.
- **Native mobile app.** Mobile-responsive web only.
- **Multi-tier contractor chains** (GC → sub → sub-sub COI flow-down).
- **Deep endorsement document analysis.** MVP reads the ACORD 25 face, including
  the additional-insured / waiver checkboxes; it does not parse attached
  endorsement forms (e.g., CG 20 10) page-by-page.
- **Accounting / project-management integrations.** No QuickBooks, Procore, etc.
  at MVP.

---

## 6. MVP scope — features

| # | Feature | Description |
|---|---------|-------------|
| F1 | Vendor roster | Create/edit vendor records (name, contact name, email, phone, notes). Bulk-import via CSV. |
| F2 | COI upload | Upload a COI PDF for a vendor — single file or bulk drag-and-drop. Accepts text and scanned PDFs. |
| F3 | AI extraction | The product reads the COI and extracts structured coverage data (see `TECH_SPEC.md §3`). |
| F4 | Review & confirm | Extracted fields are shown next to the source document for the user to confirm or correct. Low-confidence fields are flagged. |
| F5 | Requirement profiles | Define one or more requirement sets: which coverage types are required and the minimum limits, plus whether additional-insured / waiver-of-subrogation is required. Assign a profile to each vendor. |
| F6 | Compliance check | Each COI is automatically compared to the vendor's assigned requirement profile and marked **Compliant / Non-compliant / Expired**, with the specific reasons listed. |
| F7 | Compliance dashboard | One screen showing every vendor bucketed by status: Expired, Expiring soon, Non-compliant, Compliant. Sortable and filterable. |
| F8 | Automated renewal requests | When a policy is approaching expiration, the system emails the vendor on a configurable cadence requesting an updated COI. |
| F9 | Magic-link upload | Renewal emails contain a secure link to a no-login page where the vendor (or their insurance agent) uploads the new COI directly into the right record. |
| F10 | Document store & history | All COIs are stored, versioned per vendor, and downloadable. Each vendor shows a coverage history. |
| F11 | Accounts & billing | Sign-up, single-organization workspace, multiple users per org, Stripe subscription billing. |

### Feature priority within MVP

- **Must-have core (the product does not exist without these):** F1, F2, F3,
  F4, F6, F7, F10, F11.
- **Must-have differentiator (this is *why* someone switches from a
  spreadsheet):** F5, F8, F9.

If the build runs long, F9 (magic-link upload) is the most cuttable — renewal
emails can initially ask the vendor to reply with the attachment, with a
forward-to-ingest address as the fast-follow. F8 should not be cut; automated
chasing is central to the pitch.

---

## 7. Key user flows

### 7.1 Onboarding (first session)

1. User signs up and creates an organization.
2. User defines at least one requirement profile (a guided default is offered,
   e.g., "$1M general liability, $1M auto, workers' comp as required by law").
3. User imports a vendor roster via CSV, or adds vendors one at a time.
4. User bulk-uploads the COI PDFs they already have on file.
5. Extraction runs; the user reviews and confirms the results.
6. The dashboard populates — the user immediately sees who is expired or
   non-compliant.

**Success criterion:** a user with ~30 vendors can reach a populated dashboard
in under 30 minutes on day one.

### 7.2 Adding a new vendor

1. User creates the vendor record and assigns a requirement profile.
2. User either uploads the COI directly, or sends the vendor a request link.
3. COI is extracted, reviewed, and compliance is evaluated.

### 7.3 Renewal cycle (the automated loop)

1. A daily job scans for policies approaching expiration.
2. At the configured lead time (e.g., 30 days out), the system emails the vendor
   a renewal request with a magic-link.
3. Reminders repeat on cadence until a new COI is received or the policy
   expires.
4. The vendor or their agent uploads via the link; the new COI is extracted and
   re-checked against the requirement profile.
5. If now compliant, reminders stop and status updates. If still non-compliant,
   the user is notified.

### 7.4 Handling a non-compliant COI

1. The compliance check lists the specific failures (e.g., "Auto liability limit
   $500K is below required $1M"; "General liability expired 2026-04-30";
   "Additional insured not indicated").
2. The user can email the vendor about the gap (templated) or override with a
   reason note (e.g., a manual approval / known exception), which is logged.

---

## 8. Functional requirements

**Extraction (F3, F4)**
- The product must accept both text-based and scanned/image PDF COIs.
- It must extract, per policy line: coverage type, insurer/carrier name, policy
  number, effective date, expiration date, and the relevant limits.
- It must extract the additional-insured and waiver-of-subrogation indicators
  from the ACORD 25 face.
- It must surface a per-field confidence signal so the user knows what to
  double-check; it must never silently present a low-confidence guess as fact.
- The user must always be able to correct any extracted field, and corrections
  are saved as the source of truth.

**Compliance (F5, F6)**
- A requirement profile must support, per coverage type: required (yes/no),
  minimum each-occurrence limit, minimum aggregate limit, additional-insured
  required (yes/no), waiver-of-subrogation required (yes/no).
- The compliance check must produce a status plus a human-readable list of every
  reason for a non-compliant or expired result.
- "Expiring soon" is a configurable window (default 30 days).

**Renewals (F8, F9)**
- Reminder lead time and cadence must be configurable per organization.
- The magic-link upload page must require no login and must route the upload to
  the correct vendor record.
- Magic links must expire and be single-purpose (scoped to one vendor's COI
  upload).

**Accounts (F11)**
- One organization workspace per customer; multiple users may belong to it.
- All data access is scoped to the user's organization (see `TECH_SPEC.md §7`).
- Subscription billing via Stripe; the app handles trial, active, past-due, and
  cancelled states.

**General**
- All COI documents are retained and downloadable; deletion is explicit and
  logged.
- Key actions (upload, extraction confirm, override, requirement change) are
  recorded in an activity log per vendor.

---

## 9. Success metrics

**Activation (does the product deliver value?)**
- % of new sign-ups that upload ≥ 5 COIs within 7 days.
- Time from sign-up to a populated dashboard.

**Core quality (is the magic believable?)**
- Extraction field accuracy on confirmed COIs (target: high enough that users
  confirm rather than re-key — see `TECH_SPEC.md §3` for the working target).
- % of COIs that pass review with zero user corrections.

**Engagement / value loop**
- Renewal request response rate (vendor uploads a new COI after a reminder).
- % of tracked vendors in **Compliant** status over time per organization.

**Business**
- Trial-to-paid conversion.
- Monthly logo churn (target: low single digits — see `GTM.md §6`).

---

## 10. Out of scope for MVP — candidate roadmap

Not commitments; a backlog to revisit after launch.

- Email-to-ingest address (vendors/agents forward COIs to a unique address).
- Endorsement-document parsing (verify additional-insured at the policy-form
  level, not just the ACORD checkbox).
- W-9 and license/certification tracking alongside insurance.
- Carrier or agent verification of policy status.
- Tenant-COI use case for property managers (commercial lease COIs) — large
  enough to be its own track; see `GTM.md §2`.
- Integrations: QuickBooks, Procore, property-management systems.
- Reporting / exportable audit packets.
- Multi-tier GC → sub flow-down.

---

## 11. Open decisions

> **OPEN DECISION 1 — Beachhead vertical.** General/trade contractors vs.
> property management. Affects persona, onboarding copy, default requirement
> profiles, and acquisition channels. Owned in `GTM.md §2`. **The PRD does not
> need this resolved to begin**, but onboarding copy and default profiles do.

> **OPEN DECISION (product) — Magic-link upload vs. reply-with-attachment for
> MVP.** F9 is the most cuttable feature. Recommendation: keep magic-link in
> MVP if it costs under ~1 week of build; otherwise ship reply-based renewal
> first. Decide once `TECH_SPEC.md` build estimates firm up.

> **OPEN DECISION (product) — How strict is the compliance check by default?**
> Whether an unreadable/missing field counts as non-compliant or as
> "needs review" affects how noisy the dashboard feels on day one. Recommend:
> missing/unreadable → "Needs review," not "Non-compliant," to avoid a wall of
> false alarms during onboarding.

---

## 12. Risks and assumptions

| Risk / assumption | Why it matters | Mitigation |
|-------------------|----------------|------------|
| Extraction accuracy is not good enough to be trusted | If users must re-key everything, the core promise fails | Human-in-the-loop review (F4); confidence flags; measure accuracy from day one (`TECH_SPEC.md §3`) |
| COIs vary too widely to parse reliably | ACORD 25 is standardized but layouts and scans differ | Vision-LLM approach handles layout variation; build a test set of real-world COIs early |
| The product is "set up once and forget" → churn | A tool used heavily at onboarding then rarely may get cancelled | The renewal loop (F8) creates recurring value; position as system of record, not one-time cleanup |
| Vendors ignore renewal request emails | The automated loop only works if vendors respond | Make uploading frictionless (F9 magic-link); measure response rate; let the user escalate |
| Buyer underestimates the risk and won't pay | "$79 to replace a free spreadsheet" needs a reason | GTM messaging leads with risk + time saved, not features (`GTM.md §5`) |

---

*Companion documents: `TECH_SPEC.md` (how it is built) · `GTM.md` (how it sells).*
