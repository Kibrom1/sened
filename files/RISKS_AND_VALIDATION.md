# COI Tracker — Risks & Validation

**Status:** Draft v0.1 · Concept / pre-build
**Owner:** Founder
**Last updated:** May 2026

> This document captures the principal-PM review of `PRD.md`, `TECH_SPEC.md`,
> and `GTM.md`. It exists because those three documents plan the product
> confidently — but the project has **no customer validation yet**. This is the
> single place where the project's assumptions, risks, and the cheapest way to
> test each are tracked.
>
> **Read this before committing to the full build.**

---

## 1. The core finding

The three planning documents are well-structured and internally consistent.
Their shared weakness is that they **plan as if the problem and the solution
are validated, when nothing has been**. The problem statement, personas,
positioning, and pricing are all reasoned from first principles, not heard from
a customer.

The largest risk to COI Tracker is therefore not in any single document. It is
that the founder could **execute all three plans well and still build the wrong
thing** — or build the right thing for a customer who won't pay, or won't stay.

The purpose of the validation phase (§4) is to convert the biggest assumptions
into evidence *before* significant build effort is spent.

---

## 2. How to use this document

- §3 is the **assumptions register** — every load-bearing assumption, ranked by
  risk, each with a falsification signal and the cheapest test.
- §4 is the **validation plan** — a sequenced set of cheap experiments, most
  requiring no code.
- §5 is the **kill / pivot criteria** — the evidence that should stop or
  redirect the project.
- §6 lists **concrete fixes** the review surfaced for the other three documents.
- §7 proposes a **scope cut**: a Validation MVP vs. the Full MVP.

Every assumption below is **UNVALIDATED** until evidence is recorded against it.
Update the status field as evidence comes in.

---

## 3. Assumptions register (ranked by risk)

Ranked by *(impact if wrong) × (likelihood of being wrong) × (how cheaply
testable)*. Highest-priority first.

### A1 — The problem is painful enough to pay for

**Assumption:** Small operators feel COI tracking as a real, recurring pain and
will pay ~$79/month to solve it — not merely agree that it's annoying.
**If wrong:** There is no business. A spreadsheet is free; "annoying but
tolerable" does not convert.
**Falsification signal:** In discovery, operators describe the pain as minor,
already solved, or not worth a paid tool; or pre-sell attempts get no
commitment.
**Cheapest test:** 10–15 discovery interviews per candidate vertical, plus a
pre-sell / letter-of-intent ask (§4, Steps 1 and 5). No code.
**Gates:** The entire project.
**Status:** UNVALIDATED.

### A2 — Vendors will respond to automated renewal requests

**Assumption:** When the product emails a vendor (or their insurance agent) for
an updated COI, a usable share of them actually respond.
**If wrong:** The renewal loop fails. COI Tracker becomes a one-time cleanup
tool, retention collapses, and the GTM churn story (`GTM §6`) is invalid.
**Falsification signal:** Manual renewal chasing produces a low response rate
even with a frictionless upload path.
**Cheapest test:** Have 1–2 friendly operators forward renewal requests manually
for ~4 weeks; measure the response rate. **This does not require building F8/F9**
(§4, Step 4).
**Gates:** Whether the renewal engine is worth building; the retention thesis.
**Status:** UNVALIDATED. *(The review re-prioritized this above extraction
accuracy — it is the biggest **business** risk.)*

### A3 — Extraction is accurate enough to be trusted

**Assumption:** A vision-LLM can read real-world COIs (varied carriers, agency
systems, scan quality) accurately enough that users *verify* rather than
*re-key*.
**If wrong:** The core promise fails; users do as much work as the spreadsheet.
**Falsification signal:** On a held-out set of real COIs, field accuracy is low
or the correction rate is high enough to erase the time saving.
**Cheapest test:** Assemble 30–50 real, varied COIs and run them through the
model before Phase 1 commits (`TECH_SPEC §3`, §10). A spike, not a product.
**Gates:** The extraction approach; the whole product's credibility.
**Status:** UNVALIDATED. Biggest **technical** risk.

### A4 — Incumbents leave a real gap at the low end

**Assumption:** Existing tools (myCOI, TrustLayer, SmartCompliance, Jones, etc.)
are enterprise/sales-led and leave the small self-serve operator unserved.
**If wrong:** A cheap self-serve competitor already exists and the wedge
collapses; or an incumbent launches one mid-build.
**Falsification signal:** A competitor teardown finds an existing affordable,
self-serve product targeting the same operator.
**Cheapest test:** Competitive teardown — trial each product, capture pricing
and onboarding, read public reviews/complaints (§4, Step 2). No code.
**Gates:** Positioning and pricing (`GTM §1`, §3, §4).
**Status:** UNVALIDATED — currently a hypothesis stated as fact in `GTM §4`.

### A5 — The beachhead vertical is reachable cheaply

**Assumption:** A solo, unfunded founder can acquire customers in the chosen
vertical at near-zero marginal CAC (content, community, word of mouth).
**If wrong:** The unit economics (`GTM §6`) break — there is no viable path to
customers without ad spend the founder cannot afford.
**Falsification signal:** Search demand is thin, communities are small or hostile
to vendors, and outreach gets no traction.
**Cheapest test:** Check search-term demand and community size per vertical; run
a small outreach/content probe during discovery (§4, Steps 1 and 6).
**Gates:** The acquisition plan; whether the bootstrapped model works at all.
**Status:** UNVALIDATED.

### A6 — The product is sticky enough to retain

**Assumption:** Once set up, customers keep paying — the renewal loop creates
enough recurring visible value to beat "set up once and cancel."
**If wrong:** Churn eats the business even with healthy margins.
**Falsification signal:** Design partners stop engaging after onboarding;
cancellation intent appears once the initial cleanup is done.
**Cheapest test:** Largely downstream of A2; also probe in interviews how
customers think about ongoing value. Observe design-partner engagement over
time.
**Gates:** LTV and the GTM economics.
**Status:** UNVALIDATED — dependent on A2.

### A7 — A solo founder can build this MVP in a reasonable time

**Assumption:** The scope in `PRD §6` is buildable solo before runway/patience
runs out.
**If wrong:** The project stalls half-built.
**Falsification signal:** Phase estimates balloon; the extraction spike alone
consumes more time than expected.
**Cheapest test:** Do the §7 scope cut; time-box the extraction spike (A3) first
— it is the highest-uncertainty component.
**Gates:** The build plan and timeline.
**Status:** UNVALIDATED — and unanswerable until founder constraints are written
down (see A9).

### A8 — Marking a COI "Compliant" will not create a trust/liability blowup

**Assumption:** Telling a customer a certificate is "Compliant" is safe.
**If wrong:** A customer relies on a "Compliant" verdict, a real coverage gap
exists anyway (e.g., the ACORD additional-insured checkbox does not prove the
endorsement exists), an uninsured loss occurs, and trust — or worse — is lost.
**Falsification signal:** This is a known insurance subtlety, not a maybe; the
ACORD 25 face is not proof of endorsement-level coverage.
**Mitigation, not a test:** Reframe product language ("Matches requirements as
shown on the certificate," not "Compliant"); address reliance limits in Terms of
Service; keep endorsement parsing on the roadmap.
**Gates:** Product copy, ToS, `PRD §6/§8`.
**Status:** OPEN — requires a deliberate decision, not an experiment.

### A9 — Founder constraints (the missing inputs)

**Not an assumption — a gap.** The plans float because they never state the
founder's hours/week available, runway, target monthly income, and acceptable
time-to-launch. These determine scope, the break-even customer count, and
whether A7 is even answerable.
**Action:** Write these down explicitly. Then compute a break-even customer
count and sanity-check it against the market size (`GTM §2`, currently unsized).
**Status:** OPEN — required input, owner action.

---

## 4. Validation plan

A sequence of cheap experiments. Most require **no code**. Run Steps 1–3 in
parallel; they are independent.

### Step 1 — Discovery sprint *(tests A1, A5; resolves the beachhead decision)*

10–15 interviews per candidate vertical (general/trade contractors and property
management). Goal: hear the pain in the customer's words, learn the current
workaround, identify the trigger that makes someone look for a tool, and gauge
willingness to pay. **Resolve the beachhead decision** (`GTM §2`) on this
evidence — it is the cheapest of the three open decisions to close and it gates
onboarding copy, default requirement profiles, and content.

### Step 2 — Competitive teardown *(tests A4)*

Trial every relevant incumbent. Capture real pricing, onboarding flow, and
target segment; read public reviews for recurring complaints. Confirm or kill
the "no affordable self-serve competitor" hypothesis in `GTM §4`.

### Step 3 — Extraction spike + test set *(tests A3)*

Assemble 30–50 real, varied COIs. Run them through the vision-LLM approach from
`TECH_SPEC §3`. Measure field-level accuracy and correction rate. Set a concrete
accuracy target. This is the single cheapest insurance against the biggest
technical risk and should happen before Phase 1.

### Step 4 — Manual renewal-loop test *(tests A2, A6)*

Recruit 1–2 friendly operators. For ~4 weeks, manually send their vendors
renewal requests and a simple upload path. Measure the response rate. This
tests the retention thesis **without building F8/F9**.

### Step 5 — Pricing / pre-sell probe *(tests A1 willingness to pay)*

With interviewees who showed strong pain, make a real ask: a pre-order, a
letter of intent, or a deposit for a design-partner slot at the intended price.
Nodding is not validation; commitment is. Use this to pressure-test the ~$79
number (`GTM §3`).

### Step 6 — Founder constraints + sizing *(closes A9)*

Write down hours/week, runway, target income, and deadline. Size the beachhead
market at least roughly and compute the break-even customer count. Confirm the
number is plausible within the founder's timeframe.

### Decision gate

After Steps 1–6, hold an explicit go / pivot / stop decision before committing
to the Full MVP build. Do not let the build start by default.

---

## 5. Kill / pivot criteria

Define the failure conditions in advance so they are not rationalized away later.

- **Stop or rethink** if discovery (Step 1) finds the pain is consistently minor
  or already solved across both verticals.
- **Pivot pricing/segment** if no interviewee will make any pre-sell commitment
  (Step 5).
- **Pivot the wedge** if the teardown (Step 2) finds an established affordable,
  self-serve competitor already serving this operator.
- **Rethink the extraction approach** if the spike (Step 3) cannot reach an
  accuracy bar that leaves a real time saving over the spreadsheet.
- **Rethink the retention model** if the manual renewal test (Step 4) shows
  vendors do not respond at a usable rate — the renewal loop is the retention
  thesis.

None of these is necessarily fatal; each points to a specific pivot. The point
is to detect them cheaply, not after a built product.

---

## 6. Fixes for the existing documents

Concrete corrections the review surfaced, to fold into `PRD.md`,
`TECH_SPEC.md`, and `GTM.md`.

**PRD.md**
- Add a "what we know vs. what we assume" framing; mark unvalidated claims.
- Replace generic personas with specifics from discovery (Step 1).
- Give success metrics real numeric targets (even rough ones, to be revised).
- Acknowledge the onboarding cliff — bulk-uploading and reviewing an existing
  COI pile is real work; the "30 minutes to a populated dashboard" claim is
  optimistic.
- Reframe "Compliant" → "Matches requirements as shown on certificate" (A8).

**TECH_SPEC.md**
- Make the stack call (§2) instead of waffling; note that building an unfamiliar
  React frontend is itself a ramp cost, roughly symmetric with learning a new
  backend.
- Specify the async extraction UX for bulk uploads — partial failures, a review
  queue, progress.
- Address abuse/cost on the **unauthenticated, LLM-triggering endpoints**: the
  magic-link upload and the free COI-reader tool both let an outsider run up the
  LLM bill. Add rate limiting, file validation, and abuse controls.
- Note handling of multi-page COIs, multiple ACORD forms per file, and
  non-ACORD certificates.

**GTM.md**
- Downgrade the competitive section (§4) from stated fact to hypothesis until
  the teardown (Step 2) confirms it.
- Resolve the flat-vs-cap pricing inconsistency: a vendor cap *is* metering —
  pick one model.
- Anchor pricing to value (cost of a lapse, value of admin time saved), not just
  "working assumption."
- Sequence acquisition channels against the revenue clock — content/SEO
  compounds slowly; the first 90 days rely on outreach and design partners.
- Size the market and state a break-even customer count (A9).

---

## 7. Recommended scope cut — Validation MVP vs. Full MVP

`PRD §6` describes an eleven-feature, five-phase MVP. For a solo founder that is
ambitious. Splitting it reduces risk and gets evidence sooner.

**Validation MVP — "will someone pay?"**
The thinnest product that proves the core value: COI **upload → AI extraction →
review/confirm → a simple expiration list**. Plus accounts. This is enough to
put in front of design partners and ask for money. It directly exercises A1 and
A3.

**Full MVP — "will someone stay?"**
Adds requirement profiles, the compliance check, the dashboard, the renewal
engine, and magic-link upload — the features that drive retention and justify
the price. Build this *after* the Validation MVP has paying design partners and
*after* Step 4 has shown the renewal loop is worth building.

This sequencing means the renewal engine — the most build-heavy piece — is only
built once A2 has been tested manually and shown to work.

---

## 8. Open decisions — consolidated

| # | Decision | Where | Resolution path |
|---|----------|-------|-----------------|
| 1 | Beachhead vertical | `GTM §2` | Discovery sprint, Step 1 — resolve first; it gates the most. |
| 2 | Pricing model | `GTM §3` | Pre-sell probe, Step 5; also fix the flat-vs-cap inconsistency. |
| 3 | Stack | `TECH_SPEC §2` | Founder call; do not let it block the build. |
| — | "Compliant" language & ToS | A8 above | Deliberate decision before build. |
| — | Founder constraints & market size | A9 above | Owner action, Step 6. |

---

## 9. Definition of done for the validation phase

The validation phase is complete when:

- The beachhead vertical is chosen on the basis of discovery evidence.
- At least a few operators have made a real commitment at the intended price.
- The extraction spike has hit a defined accuracy target on real COIs.
- The manual renewal test has produced a measured vendor response rate.
- The competitive teardown confirms (or kills) the market gap.
- Founder constraints are written down and a break-even customer count is
  computed and judged plausible.
- A documented go / pivot / stop decision has been made at the §4 gate.

Only then should the Full MVP build commit.

---

*Companion documents: `PRD.md` · `TECH_SPEC.md` · `GTM.md`. Consider adding this
file to the "Documents in this Project" table in the project knowledge base.*
