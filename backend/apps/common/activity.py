"""
Activity logging helper.

Writes an ActivityLog row alongside the action it records. Call inside the
same transaction as the action when atomicity matters (e.g. with
transaction.atomic() in the view).

Never raises — an audit-log failure must not break the user-facing action.
"""
import logging

logger = logging.getLogger(__name__)


def log_activity(organization_id, actor: str, action: str, vendor=None, detail: dict | None = None):
    """
    Record an activity entry.

    Args:
        organization_id: org UUID (tenant scope)
        actor:           who did it — user email, 'vendor' (magic link),
                         'system' (celery/webhooks)
        action:          short machine-readable verb, e.g. 'coi_uploaded',
                         'coi_confirmed', 'vendor_created', 'renewal_sent'
        vendor:          optional Vendor instance or id
        detail:          optional JSON-serializable context
    """
    try:
        from apps.renewals.models import ActivityLog

        kwargs = {
            'organization_id': organization_id,
            'actor': actor or 'system',
            'action': action,
            'detail': detail or {},
        }
        if vendor is not None:
            if hasattr(vendor, 'pk'):
                kwargs['vendor'] = vendor
            else:
                kwargs['vendor_id'] = vendor
        ActivityLog.objects.create(**kwargs)
    except Exception:
        logger.exception('activity log write failed: %s / %s', action, organization_id)
