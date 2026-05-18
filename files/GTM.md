# COI Tracker — Go-to-Market

**Status:** Draft v0.1 · Concept / pre-build
**Owner:** Founder
**Last updated:** May 2026

> Read `PRD.md` for product scope. This document covers *how it sells*:
> positioning, beachhead vertical, pricing, competitors, acquisition, and unit
> economics.

---

## 1. Positioning

**The category:** COI tracking / insurance compliance software.

**The wedge:** Existing tools in this category are mid-market and enterprise
products — sales-led, expensive, and built for risk departments. The small
operator who hires a dozen-to-a-hundred vendors is *not* served by them; that
operator is using a spreadsheet. COI Tracker is the affordable, self-serve,
AI-powered tool for *that* operator.

**Positioning statement:**

> For small businesses that manage subcontractors and vendors and currently
> track insurance certificates in a spreadsheet, COI Tracker is software that
> *reads the certificates for you* — extracting the coverage details, flagging
> gaps and lapses, and chasing renewals automatically — so coverage never
> quietly lapses. Unlike enterprise compliance platforms, it is self-serve,
> affordable, and set up in an afternoon.

**The core promise, in one line:** *Stop tracking your subs' insurance in a
spreadsheet — upload the PDFs and COI Tracker reads them, flags gaps, and
chases renewals before coverage lapses.*

**What COI Tracker is competing against, honestly:** not primarily the
incumbents — it is competing against **the spreadsheet and "we'll get to it."**
The message must make the cost of the status quo (missed expirations, an
uninsured-loss event, a failed audit, hours of admin) feel real.

---

## 2. Beachhead vertical

> **OPEN DECISION 1 — Beachhead vertical: general/trade contractors vs.
> property management.** This is the single most important GTM decision and is
> not yet resolved. Below are the cases and a recommendation framework.

### Why pick one

A solo founder with no funding cannot build two onboarding flows, two sets of
default requirement profiles, two content engines, and two sales motions. The
beachhead choice determines default templates, language, content topics, and
where to show up. **It must be decided before Phase 4 of the build** (`TECH_SPEC
§10`), ideally sooner.

### Option A — General / trade contractors

GCs and trade contractors hire subcontractors whose insurance must satisfy
requirements that flow down from project owners and prime contractors.

- **Pain:** acute and obvious. Subs rotate frequently; insurance requirements
  are contractually mandated; a lapse is a real liability exposure.
- **Volume:** a very large, fragmented universe of small-to-midsize
  contractors.
- **Reachability:** active online communities, trade associations, and a
  content/SEO surface ("how to track subcontractor COIs").
- **Risks:** the tracking is often a part-time duty of an office admin;
  willingness to pay must be validated; some contractors are low-tech.

### Option B — Property management

PM firms collect COIs from their vendors (landscapers, plumbers, contractors,
cleaners). A separate, larger use case exists: tracking **tenant COIs** for
commercial leases.

- **Pain:** real and recurring; a known category.
- **Volume:** large, with recurring vendor relationships (good retention
  signal).
- **Reachability:** established communities and channels for PM operators.
- **Risks:** the tenant-COI sub-segment has a **well-funded incumbent already
  focused there**, so competition is more direct. The vendor-COI side is closer
  to a level field.

### Recommendation framework

Score each on: (1) pain acuity, (2) ease of reaching them cheaply as a solo
founder, (3) willingness to pay ~$79/month, (4) directness of competition, (5)
retention/expansion potential.

A reasonable lean: **general/trade contractors** — the universe is huge and
fragmented, the low end is genuinely underserved, the pain is unambiguous, and
there is a clean content/SEO path. Property management is a strong second and a
natural expansion market, but the tenant-COI niche within it is more directly
contested.

**This is a lean, not a verdict.** Resolve it with cheap evidence: a dozen
discovery conversations in each vertical, and a check on search demand and
community size for each. **Whichever is chosen, the product itself is the same;
only positioning, templates, and channels differ.**

---

## 3. Pricing

> **OPEN DECISION 2 — Pricing model: flat $79/month vs. tiered by tracked-vendor
> count.** Flagged in the project knowledge base. Cases below, with a
> recommendation.

### Option A — Flat $79/month

- **Pros:** dead simple to communicate and to build (no metering or upgrade
  logic). Removes friction from the buying decision. Predictable revenue.
- **Cons:** a 10-vendor shop and a 150-vendor shop pay the same. Leaves money on
  the table from larger users, and may feel steep to the smallest ones — with
  no cheaper entry point and no expansion revenue as a customer grows.

### Option B — Tiered by tracked-vendor count

- **Pros:** captures more value from larger accounts; creates natural expansion
  revenue as customers grow; a lower entry tier widens the top of the funnel.
- **Cons:** more to build (metering, tier enforcement, upgrade prompts), more to
  explain, and it introduces a perverse incentive — customers may *under-add*
  vendors to stay in a tier, which undermines the product's job of tracking
  *everyone*.

### Recommendation

**Launch flat for MVP simplicity, designed so tiering can be added later
without repricing existing customers.** Concretely:

- One plan at ~$79/month with a **generous included vendor allowance** (e.g.,
  up to ~50 tracked vendors) that comfortably covers the target small operator.
- A free trial (~14 days) so the value is felt before payment.
- Leave clear room for a future higher tier for larger accounts — but do not
  build metering for MVP.

Rationale: at MVP the priority is shipping and learning, not pricing
optimization. Marginal cost per customer is only a few dollars/month
(`TECH_SPEC §9`), so a flat price is not a margin risk. Pricing should be
revisited with real usage data — tier the model once there is evidence of how
vendor counts actually distribute and where larger accounts cluster.

> **Note — validate the $79 number itself.** $79/month is a working assumption,
> not a researched price. Test willingness to pay in discovery conversations
> and in the design-partner phase (§7). The recommendation above holds whatever
> the exact number lands at.

---

## 4. Competitive landscape

The category has several established players, mostly serving mid-market and
enterprise through a sales-led motion at price points well above $79/month.
Representative incumbents include **myCOI**, **TrustLayer**, **SmartCompliance**,
and **Jones** (notably focused on the real-estate / tenant-COI space), among
others; some larger construction platforms also include a COI-management module.

**The structural gap COI Tracker targets:**

| Incumbent norm | COI Tracker |
|----------------|-------------|
| Sales-led; demos and contracts | Self-serve sign-up |
| Mid-market / enterprise pricing | ~$79/month |
| Built for risk/compliance teams | Built for an office manager |
| Often a service layer doing manual review | AI extraction; user reviews |
| Onboarding measured in weeks | Set up in an afternoon |

**Honest competitive risks:**

- An incumbent could launch a cheaper self-serve tier and compress the wedge.
- AI document extraction is increasingly commoditized — it is an enabler, not a
  durable moat. The defensibility comes from being the **system of record** with
  the renewal loop embedded in a customer's weekly workflow, plus a sharp focus
  on one underserved vertical.
- "Good enough" inertia: the spreadsheet is free and familiar. The hardest
  competitor is doing nothing.

**Where COI Tracker should not play (at MVP):** head-to-head against enterprise
incumbents on enterprise features. Win the small operator they ignore.

---

## 5. Messaging

**Lead with the cost of the status quo, not the feature list.** The buyer does
not want "an AI extraction pipeline" — they want to stop worrying about a lapse
and stop losing hours to admin.

**Primary message (risk + relief):**
"One of your subs' policies expires this month. Do you know which one? COI
Tracker does — and it already emailed them for the renewal."

**Secondary message (time saved):**
"Stop re-typing certificates into a spreadsheet. Upload the PDF; COI Tracker
reads it in seconds."

**Proof points to build toward:** extraction speed and accuracy demonstrated
live; "set up in an afternoon"; design-partner testimonials.

**Tone:** plain, practical, non-jargon. The reader is a busy office manager, not
a risk officer. Avoid insurance jargon except the terms they already use (COI,
ACORD, additional insured).

A free **"COI reader" tool** — upload one certificate, see it parsed instantly,
no signup — doubles as the single most persuasive piece of marketing: it *shows*
the magic instead of describing it. See §7.

---

## 6. Unit economics

Illustrative, at the working assumptions of ~$79/month and the cost model in
`TECH_SPEC §9`.

| Metric | Value | Notes |
|--------|-------|-------|
| Price | ~$79 / month (~$948 / year) | Working assumption; validate (§3). |
| Marginal cost per customer | ~$3–10 / month | LLM extraction + email + storage. |
| Gross margin | ~88–95% | Software economics; healthy. |
| Fixed infra baseline | ~$50–120 / month | Covered after a handful of customers. |

**What actually determines whether this works:**

- **CAC must stay very low.** With no funding, paid acquisition is not viable at
  the start. The model only works if customers come from content/SEO, community
  presence, word of mouth, and partnerships (§7) — i.e., near-zero marginal CAC.
- **Churn is the real risk, not margin.** A tool used intensively during
  onboarding and then rarely is a cancellation candidate. The renewal loop
  (`PRD F8`) is the antidote: it keeps the product doing visible work every
  month. Target low-single-digit monthly logo churn; treat anything higher as a
  product-stickiness problem, not a marketing one.
- **Break-even is modest.** Covering ~$50–120/month of infra plus the founder's
  target income defines a concrete, reachable customer count — a useful North
  Star metric for the first year.

**Rules of thumb to operate by:** keep blended CAC well below one year of
revenue (~$948); watch the ratio of lifetime value to CAC; and track payback
period in months. These are guidelines for a bootstrapped solo business, not
financial advice.

---

## 7. Customer acquisition

Channels suited to a solo, unfunded founder. Marginal CAC must be near zero.

**1. Content / SEO.** Target the search intent of spreadsheet users:
"how to track subcontractor COIs," "COI tracking spreadsheet template," "what is
an ACORD 25," "additional insured explained." Capture them with genuinely useful
content and convert to the free tool and trial. This compounds and is the
primary long-term channel.

**2. Free "COI reader" tool.** A no-signup page that parses one uploaded
certificate and shows the structured result. It demonstrates the core value
instantly, is inherently shareable, and is a strong SEO and link-building asset.

**3. Communities.** Be genuinely present where the chosen vertical gathers —
contractor and property-management forums, subreddits, Facebook groups,
trade-association spaces. Help first; sell rarely.

**4. Direct outreach.** Targeted, personalized outreach to small firms in the
beachhead vertical — especially during the design-partner phase.

**5. Partnerships / referrals.** Bookkeepers and accountants who serve
contractors, and insurance agents, all sit adjacent to this pain and can refer.
Build a small referral path once the product is proven.

**Sequencing:** start with design partners and direct outreach (fast feedback),
launch the free tool early (it is also a build artifact), and let content/SEO
compound over the first 6–12 months.

---

## 8. Launch plan

**Stage 1 — Design partners (pre-launch).** Recruit ~5–10 small firms in the
beachhead vertical to use the product free or discounted in exchange for honest
feedback and, eventually, testimonials. Goal: validate extraction quality on
their real COIs, confirm the workflow fits, and pressure-test pricing.

**Stage 2 — Soft launch.** Open self-serve sign-up with the trial. Publish the
free COI reader tool and the first batch of content. Convert design partners to
paid.

**Stage 3 — Public launch.** Broader announcement through communities and any
relevant launch channels. Continue content cadence. Begin partnership
conversations.

**Stage 4 — Iterate.** Use churn signals and feature requests to drive the
roadmap (`PRD §10`). Revisit pricing and tiering with real usage data (§3).

---

## 9. Metrics that matter

- **Acquisition:** trial sign-ups; free-tool usage; sign-up source mix.
- **Activation:** % of trials that upload ≥ 5 COIs and reach a populated
  dashboard (mirrors `PRD §9`).
- **Conversion:** trial-to-paid rate.
- **Retention:** monthly logo churn; % of tracked vendors kept compliant over
  time (a leading indicator of delivered value).
- **Economics:** blended CAC; LTV : CAC; payback period; months to break-even.

---

## 10. GTM risks

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Beachhead chosen wrong | Wasted positioning and content effort | Decide with cheap discovery evidence before Phase 4 (§2) |
| $79 mis-priced | Too high stalls the funnel; too low strands revenue | Validate in discovery and the design-partner phase (§3) |
| Spreadsheet inertia | The status quo is free and familiar | Messaging leads with risk and time cost (§5); the free tool makes value tangible |
| High churn | "Set up once" tools get cancelled | The renewal loop creates recurring value; track churn as a product metric (§6) |
| Incumbent moves down-market | Compresses the wedge | Move fast; own one vertical deeply; embed in the weekly workflow |
| Solo bandwidth | One person cannot do build + content + sales at once | Sequence channels (§7); lean on compounding (SEO) and low-touch (self-serve) motions |

---

*Companion documents: `PRD.md` (what is being built) · `TECH_SPEC.md` (how it
is built).*
