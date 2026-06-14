"""
Renewal Celery tasks — Phase 3

Tasks:
  scan_renewals_due()
      Runs daily at 07:00 UTC via Celery Beat.
      For every org, finds vendors whose latest confirmed COI has a coverage
      expiring within org.reminder_lead_days days.  Skips vendors that already
      have an open (scheduled/sent) renewal request created within
      org.reminder_cadence_days days.  Creates a RenewalRequest with a
      time-limited magic-link token, then queues send_renewal_reminder_for_vendor.

  send_renewal_reminder_for_vendor(renewal_request_id)
      Sends a branded magic-link email to the vendor contact.
      Sets status='sent'.  Skipped silently when RESEND_API_KEY is unset or
      the vendor has no contact_email.  Retries up to 3 times on transient
      send failures.
"""

import logging
import secrets
from celery import shared_task

logger = logging.getLogger(__name__)


# ── Daily sweep ───────────────────────────────────────────────────────────────

@shared_task
def scan_renewals_due():
    """
    Sweep all orgs for vendors with expiring COIs and queue renewal reminders.
    Safe to run multiple times — duplicate-suppression via cadence_days window.
    """
    from datetime import timedelta

    from django.utils import timezone

    from apps.documents.models import COIDocument, ExtractedCoverage
    from apps.organizations.models import Organization
    from apps.vendors.models import Vendor

    from .models import RenewalRequest

    now = timezone.now()
    total_queued = 0

    for org in Organization.objects.all():
        lead_days = org.reminder_lead_days        # default 30
        cadence_days = org.reminder_cadence_days  # default 7
        expiry_cutoff = now.date() + timedelta(days=lead_days)
        cadence_cutoff = now - timedelta(days=cadence_days)

        # One query per org: candidate vendors annotated with their latest
        # confirmed document, filtered by expiring coverage and no recent
        # pending renewal (previously 3 queries per vendor — N+1).
        from django.db.models import Exists, OuterRef, Subquery

        latest_doc_id = (
            COIDocument.objects
            .filter(vendor=OuterRef('pk'), status='confirmed')
            .order_by('-created_at')
            .values('id')[:1]
        )
        has_pending = RenewalRequest.objects.filter(
            vendor=OuterRef('pk'),
            organization=org,
            status__in=['scheduled', 'sent'],
            created_at__gte=cadence_cutoff,
        )
        has_expiring = ExtractedCoverage.objects.filter(
            document_id=OuterRef('latest_doc_id'),
            expiration_date__isnull=False,
            expiration_date__lte=expiry_cutoff,
            expiration_date__gte=now.date(),
        )

        candidates = (
            Vendor.objects
            .filter(organization=org, status='active')
            .exclude(contact_email__isnull=True)
            .exclude(contact_email='')
            .annotate(latest_doc_id=Subquery(latest_doc_id))
            .filter(latest_doc_id__isnull=False)
            .annotate(has_expiring=Exists(has_expiring), has_pending=Exists(has_pending))
            .filter(has_expiring=True, has_pending=False)
        )

        for vendor in candidates:

            # Create renewal request with a time-limited magic-link token
            token = secrets.token_urlsafe(32)
            renewal = RenewalRequest.objects.create(
                organization=org,
                vendor=vendor,
                document_id=vendor.latest_doc_id,
                status='scheduled',
                magic_link_token=token,
                magic_link_expires_at=now + timedelta(days=14),
            )

            send_renewal_reminder_for_vendor.delay(str(renewal.id))
            total_queued += 1
            logger.info(
                'renewal scan: queued reminder for vendor %s (org %s)',
                vendor.id,
                org.id,
            )

    logger.info('renewal scan complete — %d reminders queued', total_queued)
    return total_queued


# ── Per-vendor reminder email ─────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def send_renewal_reminder_for_vendor(self, renewal_request_id: str):
    """
    Send a magic-link renewal reminder email to the vendor contact.
    Marks the RenewalRequest as 'sent' on success.
    """
    from django.conf import settings
    from django.utils import timezone

    from .models import RenewalRequest

    if not settings.RESEND_API_KEY:
        logger.debug('renewal reminder: RESEND_API_KEY not set — skipping email')
        return

    try:
        renewal = (
            RenewalRequest.objects
            .select_related('vendor', 'organization')
            .get(id=renewal_request_id)
        )
    except RenewalRequest.DoesNotExist:
        logger.warning('renewal reminder: RenewalRequest %s not found', renewal_request_id)
        return

    vendor = renewal.vendor
    org = renewal.organization

    if not vendor.contact_email:
        logger.warning(
            'renewal reminder: vendor %s has no contact_email — skipping', vendor.id
        )
        return

    from django.utils.html import escape

    magic_url = f'{settings.FRONTEND_URL}/magic-upload/{renewal.magic_link_token}'
    greeting = f'Hi {escape(vendor.contact_name)},' if vendor.contact_name else 'Hello,'
    org_name = escape(org.name)
    vendor_name = escape(vendor.name)

    html_body = f"""
    <html>
    <body style="font-family:system-ui,sans-serif;color:#374151;max-width:600px;margin:0 auto;padding:24px;">
      <div style="margin-bottom:24px;">
        <span style="display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:18px;color:#4F46E5;">
          &#128737; sened
        </span>
      </div>

      <h2 style="color:#111827;font-size:22px;margin-bottom:8px;">
        Certificate of Insurance Renewal Required
      </h2>

      <p style="margin-bottom:16px;">{greeting}</p>

      <p style="margin-bottom:16px;">
        <strong>{org_name}</strong> requires an updated Certificate of Insurance
        from <strong>{vendor_name}</strong>. Your current certificate is expiring
        soon, and uploading an updated COI ensures there's no interruption to your
        work relationship.
      </p>

      <p style="margin-bottom:24px;">
        Please upload your updated certificate using the secure link below.
        <strong>No account or login is required.</strong>
      </p>

      <p style="margin:32px 0;">
        <a href="{magic_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
          Upload Certificate of Insurance →
        </a>
      </p>

      <p style="color:#6B7280;font-size:13px;margin-bottom:8px;">
        This secure link expires in 14 days. If you have questions about what's
        required, please contact {org_name} directly.
      </p>

      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;">

      <p style="color:#9CA3AF;font-size:12px;">
        Sent by sened on behalf of {org_name} &middot;
        COI tracking and renewal management
      </p>
    </body>
    </html>
    """

    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            'from': settings.EMAIL_FROM,
            'to': [vendor.contact_email],
            'subject': f'Action required: Upload updated COI for {org_name}',
            'html': html_body,
        })
        renewal.status = 'sent'
        renewal.sent_at = timezone.now()
        renewal.save(update_fields=['status', 'sent_at'])

        from apps.common.activity import log_activity
        log_activity(org.id, actor='system', action='renewal_reminder_sent',
                     vendor=vendor, detail={'renewal_id': str(renewal.id),
                                            'to': vendor.contact_email})
        logger.info(
            'renewal reminder sent → %s (vendor %s, org %s)',
            vendor.contact_email, vendor.id, org.id,
        )
    except Exception as exc:
        logger.error('renewal reminder send failed for vendor %s: %s', vendor.id, exc)
        raise self.retry(exc=exc)
