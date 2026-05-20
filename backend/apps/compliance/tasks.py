"""
Compliance Celery tasks — Phase 2

Tasks:
  run_compliance_check_for_vendor(vendor_id)
      Triggered after a COI is confirmed, a requirement profile is changed,
      or by the daily sweep.  Writes one ComplianceCheck row per run.

  run_daily_compliance_check()
      Runs every day at 08:00 UTC via Celery Beat.
      Re-checks every active vendor across all organisations.

  send_compliance_digest_all_orgs()
      Runs every day at 09:00 UTC via Celery Beat (one hour after the sweep).
      Dispatches a per-org digest email to every org owner that has
      vendors in expired / gaps_found / needs_review status.

  send_compliance_digest_for_org(org_id)
      Builds and sends a single digest email to the org owner.
      Skipped silently if RESEND_API_KEY is not configured.
"""

import logging
from celery import shared_task

logger = logging.getLogger(__name__)


# ── Compliance check tasks ────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def run_compliance_check_for_vendor(self, vendor_id: str):
    """
    Run a compliance check for a single vendor and persist the result.

    Looks up the vendor's assigned requirement profile and latest confirmed
    document, feeds them into the pure engine, then writes a ComplianceCheck.
    """
    from apps.vendors.models import Vendor, RequirementLine
    from apps.documents.models import COIDocument, ExtractedCoverage
    from .models import ComplianceCheck
    from .engine import run_compliance_check, ProfileLine, CoverageData

    try:
        vendor = (
            Vendor.objects
            .select_related('requirement_profile', 'organization')
            .get(id=vendor_id)
        )
    except Vendor.DoesNotExist:
        logger.warning('compliance: vendor %s not found — skipping', vendor_id)
        return

    org_id = vendor.organization_id

    # ── Case 1: no requirement profile assigned ───────────────────────────────
    if not vendor.requirement_profile_id:
        ComplianceCheck.objects.create(
            organization_id=org_id,
            vendor=vendor,
            document=None,
            status='needs_review',
            reasons=['No requirement profile assigned to this vendor'],
        )
        logger.info('compliance: vendor %s → needs_review (no profile)', vendor_id)
        return

    # ── Case 2: no confirmed document ────────────────────────────────────────
    doc = (
        COIDocument.objects
        .filter(vendor=vendor, status='confirmed')
        .order_by('-created_at')
        .first()
    )
    if not doc:
        ComplianceCheck.objects.create(
            organization_id=org_id,
            vendor=vendor,
            document=None,
            status='needs_review',
            reasons=['No confirmed certificate of insurance on file'],
        )
        logger.info('compliance: vendor %s → needs_review (no confirmed doc)', vendor_id)
        return

    # ── Case 3: run the engine ────────────────────────────────────────────────
    db_lines = RequirementLine.objects.filter(profile=vendor.requirement_profile)
    profile_lines = [
        ProfileLine(
            coverage_type=ln.coverage_type,
            is_required=ln.is_required,
            min_each_occurrence=ln.min_each_occurrence,
            min_aggregate=ln.min_aggregate,
            additional_insured_required=ln.additional_insured_required,
            waiver_required=ln.waiver_required,
        )
        for ln in db_lines
    ]

    db_coverages = ExtractedCoverage.objects.filter(document=doc, confirmed=True)
    confirmed_coverages = [
        CoverageData(
            coverage_type=cov.coverage_type,
            expiration_date=cov.expiration_date,
            limits=cov.limits or {},
            additional_insured=cov.additional_insured or 'unclear',
            waiver_of_subrogation=cov.waiver_of_subrogation or 'unclear',
        )
        for cov in db_coverages
    ]

    result = run_compliance_check(profile_lines, confirmed_coverages)

    ComplianceCheck.objects.create(
        organization_id=org_id,
        vendor=vendor,
        document=doc,
        status=result.status,
        reasons=result.reasons,
    )

    logger.info(
        'compliance: vendor %s → %s  (%d reason(s))',
        vendor_id, result.status, len(result.reasons),
    )


@shared_task
def run_daily_compliance_check():
    """
    Daily sweep — re-checks every active vendor across all organisations.
    Scheduled via Celery Beat at 08:00 UTC (see data migration 0003).
    """
    from apps.vendors.models import Vendor

    vendor_ids = list(
        Vendor.objects
        .filter(status='active')
        .values_list('id', flat=True)
    )

    logger.info('compliance: daily sweep — queuing %d vendor checks', len(vendor_ids))

    for vid in vendor_ids:
        run_compliance_check_for_vendor.delay(str(vid))


# ── Digest email tasks ────────────────────────────────────────────────────────

@shared_task
def send_compliance_digest_all_orgs():
    """
    Dispatch a per-org digest task for every organisation that has at least one
    active vendor.  Scheduled at 09:00 UTC — one hour after the daily sweep —
    so vendor checks are complete when this runs.
    """
    from apps.organizations.models import Organization

    org_ids = list(
        Organization.objects
        .filter(users__isnull=False)
        .values_list('id', flat=True)
        .distinct()
    )

    logger.info('compliance digest: dispatching for %d orgs', len(org_ids))

    for oid in org_ids:
        send_compliance_digest_for_org.delay(str(oid))


@shared_task
def send_compliance_digest_for_org(org_id: str):
    """
    Build and send a compliance digest email to the org owner.

    Queries the latest ComplianceCheck per vendor, groups issues by severity,
    and sends a summary via Resend.  Skipped silently when:
      - RESEND_API_KEY is not configured
      - All vendors are fully compliant (no email needed)
      - The org owner has no email address on record
    """
    from django.conf import settings
    from django.db.models import Subquery, OuterRef
    from apps.organizations.models import Organization, User
    from apps.vendors.models import Vendor
    from .models import ComplianceCheck

    if not settings.RESEND_API_KEY:
        logger.debug('compliance digest: RESEND_API_KEY not set — skipping')
        return

    try:
        org = Organization.objects.get(id=org_id)
    except Organization.DoesNotExist:
        return

    # Org owner to notify
    owner = User.objects.filter(organization=org, role='owner').first()
    if not owner or not owner.email:
        logger.warning('compliance digest: no owner email for org %s', org_id)
        return

    # Latest compliance status per vendor (correlated subquery)
    latest_status = (
        ComplianceCheck.objects
        .filter(vendor=OuterRef('pk'), organization_id=org_id)
        .order_by('-checked_at')
        .values('status')[:1]
    )
    latest_reasons = (
        ComplianceCheck.objects
        .filter(vendor=OuterRef('pk'), organization_id=org_id)
        .order_by('-checked_at')
        .values('reasons')[:1]
    )

    vendors = (
        Vendor.objects
        .filter(organization_id=org_id, status='active')
        .annotate(
            latest_status=Subquery(latest_status),
            latest_reasons=Subquery(latest_reasons),
        )
    )

    expired      = [v for v in vendors if v.latest_status == 'expired']
    gaps_found   = [v for v in vendors if v.latest_status == 'gaps_found']
    needs_review = [v for v in vendors if v.latest_status == 'needs_review']

    if not expired and not gaps_found and not needs_review:
        logger.info('compliance digest: org %s — all clear, no email needed', org_id)
        return

    total_issues = len(expired) + len(gaps_found) + len(needs_review)
    subject = (
        f'{total_issues} vendor{"s" if total_issues != 1 else ""} '
        f'need{"" if total_issues != 1 else "s"} attention — {org.name}'
    )

    html = _build_digest_html(
        org_name=org.name,
        owner_name=owner.name or owner.email,
        expired=expired,
        gaps_found=gaps_found,
        needs_review=needs_review,
        dashboard_url=f'{settings.FRONTEND_URL}/dashboard',
    )

    _send_email(
        to=owner.email,
        subject=subject,
        html=html,
        from_address=settings.EMAIL_FROM,
        api_key=settings.RESEND_API_KEY,
    )

    logger.info(
        'compliance digest: sent to %s — %d expired, %d gaps, %d needs_review',
        owner.email, len(expired), len(gaps_found), len(needs_review),
    )


# ── Email helpers ─────────────────────────────────────────────────────────────

def _send_email(to: str, subject: str, html: str, from_address: str, api_key: str):
    import resend
    resend.api_key = api_key
    resend.Emails.send({
        'from': from_address,
        'to': [to],
        'subject': subject,
        'html': html,
    })


def _vendor_rows(vendors: list, color: str) -> str:
    """Render a list of vendor issue rows as HTML table rows."""
    rows = []
    for v in vendors:
        reasons = v.latest_reasons or []
        reason_html = (
            '<ul style="margin:4px 0 0 0;padding-left:18px;color:#6b7280;font-size:13px;">'
            + ''.join(f'<li>{r}</li>' for r in reasons)
            + '</ul>'
            if reasons else ''
        )
        rows.append(f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
                         background:{color};margin-right:8px;margin-bottom:1px;vertical-align:middle;"></span>
            <strong style="font-size:14px;color:#111827;">{v.name}</strong>
            {reason_html}
          </td>
        </tr>""")
    return '\n'.join(rows)


def _section(title: str, color: str, badge_bg: str, vendors: list) -> str:
    if not vendors:
        return ''
    count = len(vendors)
    return f"""
    <tr>
      <td style="padding:20px 0 8px 0;">
        <span style="font-size:13px;font-weight:600;color:{color};
                     background:{badge_bg};padding:3px 10px;border-radius:12px;">
          {title} &nbsp;·&nbsp; {count}
        </span>
      </td>
    </tr>
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          {''.join(_vendor_rows(vendors, color) for _ in [None])}
        </table>
      </td>
    </tr>"""


def _build_digest_html(
    org_name: str,
    owner_name: str,
    expired: list,
    gaps_found: list,
    needs_review: list,
    dashboard_url: str,
) -> str:
    total = len(expired) + len(gaps_found) + len(needs_review)
    headline = (
        f'{total} vendor{"s" if total != 1 else ""} '
        f'{"need" if total != 1 else "needs"} your attention'
    )

    expired_section      = _section('Expired',       '#dc2626', '#fef2f2', expired)
    gaps_section         = _section('Coverage gaps', '#d97706', '#fffbeb', gaps_found)
    needs_review_section = _section('Needs review',  '#2563eb', '#eff6ff', needs_review)

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;
                      border:1px solid #e5e7eb;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #f3f4f6;">
              <span style="font-size:20px;font-weight:700;color:#2563eb;">sened</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <p style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111827;">
                {headline}
              </p>
              <p style="margin:0 0 24px 0;font-size:14px;color:#6b7280;">
                Hi {owner_name}, here's today's compliance summary for <strong>{org_name}</strong>.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                {expired_section}
                {gaps_section}
                {needs_review_section}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <a href="{dashboard_url}"
                 style="display:inline-block;background:#2563eb;color:#ffffff;
                        font-size:14px;font-weight:600;padding:10px 24px;
                        border-radius:8px;text-decoration:none;">
                View dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #f3f4f6;
                       font-size:12px;color:#9ca3af;">
              You're receiving this because you're the owner of {org_name} on sened.
              This digest runs daily at 9 AM UTC.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
