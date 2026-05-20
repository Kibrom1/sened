"""
Billing views — Phase 4 (Stripe Billing + Checkout)

Endpoints:
  GET  /api/billing/status/       — current subscription status for the org
  POST /api/billing/checkout/     — create a Stripe Checkout session (new subscription)
  POST /api/billing/portal/       — create a Stripe Customer Portal session (manage/cancel)
  POST /api/billing/webhook/      — receive Stripe webhook events

All endpoints except /webhook/ require a valid JWT (normal TenantAuthMiddleware).
/webhook/ uses Stripe's own signature verification instead.
"""

import logging

from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response

logger = logging.getLogger(__name__)


# ── Status ────────────────────────────────────────────────────────────────────

class BillingStatusView(APIView):
    """
    GET /api/billing/status/
    Returns the org's current subscription status and Stripe IDs.
    """

    def get(self, request):
        from apps.organizations.models import Organization

        try:
            org = Organization.objects.get(id=request.org_id)
        except Organization.DoesNotExist:
            return Response({'error': 'Organization not found'}, status=404)

        return Response({
            'subscription_status': org.subscription_status,
            'has_payment_method': bool(org.stripe_customer_id),
            'stripe_customer_id': org.stripe_customer_id,
        })


# ── Checkout ──────────────────────────────────────────────────────────────────

class CheckoutSessionView(APIView):
    """
    POST /api/billing/checkout/
    Creates a Stripe Checkout session for a new subscription and returns the
    hosted checkout URL.  The frontend redirects the user to this URL.

    After payment, Stripe redirects back to:
      {FRONTEND_URL}/billing?checkout=success   (on completion)
      {FRONTEND_URL}/billing?checkout=canceled  (if user clicks Back)
    """

    def post(self, request):
        if not settings.STRIPE_SECRET_KEY:
            return Response({'error': 'Billing is not configured'}, status=503)
        if not settings.STRIPE_PRICE_ID:
            return Response({'error': 'No billing plan configured'}, status=503)

        from apps.organizations.models import Organization, User
        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY

        try:
            org = Organization.objects.get(id=request.org_id)
        except Organization.DoesNotExist:
            return Response({'error': 'Organization not found'}, status=404)

        if org.subscription_status == 'active':
            return Response({'error': 'Already subscribed — use the billing portal to manage.'}, status=400)

        frontend_url = settings.FRONTEND_URL

        # Re-use existing Stripe customer if we have one, otherwise Checkout
        # will create a new one and we'll capture it via webhook.
        create_kwargs = {
            'mode': 'subscription',
            'line_items': [{'price': settings.STRIPE_PRICE_ID, 'quantity': 1}],
            'success_url': f'{frontend_url}/billing?checkout=success',
            'cancel_url': f'{frontend_url}/billing?checkout=canceled',
            'metadata': {'org_id': str(org.id)},
            'subscription_data': {'metadata': {'org_id': str(org.id)}},
        }

        if org.stripe_customer_id:
            create_kwargs['customer'] = org.stripe_customer_id
        else:
            # Pre-fill email from org owner so Stripe shows a nicer form
            owner = User.objects.filter(organization=org, role='owner').first()
            if owner and owner.email:
                create_kwargs['customer_email'] = owner.email

        try:
            session = stripe.checkout.Session.create(**create_kwargs)
        except stripe.StripeError as e:
            logger.error('Stripe checkout session creation failed: %s', e)
            return Response({'error': 'Could not create checkout session'}, status=502)

        return Response({'url': session.url})


# ── Customer Portal ───────────────────────────────────────────────────────────

class CustomerPortalView(APIView):
    """
    POST /api/billing/portal/
    Creates a Stripe Customer Portal session and returns the URL.
    The frontend redirects the user there to manage their subscription,
    update payment details, or cancel.

    Return URL: {FRONTEND_URL}/billing
    """

    def post(self, request):
        if not settings.STRIPE_SECRET_KEY:
            return Response({'error': 'Billing is not configured'}, status=503)

        from apps.organizations.models import Organization
        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY

        try:
            org = Organization.objects.get(id=request.org_id)
        except Organization.DoesNotExist:
            return Response({'error': 'Organization not found'}, status=404)

        if not org.stripe_customer_id:
            return Response(
                {'error': 'No billing account found. Please subscribe first.'},
                status=400,
            )

        try:
            session = stripe.billing_portal.Session.create(
                customer=org.stripe_customer_id,
                return_url=f'{settings.FRONTEND_URL}/billing',
            )
        except stripe.StripeError as e:
            logger.error('Stripe portal session creation failed: %s', e)
            return Response({'error': 'Could not open billing portal'}, status=502)

        return Response({'url': session.url})


# ── Webhook ───────────────────────────────────────────────────────────────────

@method_decorator(csrf_exempt, name='dispatch')
class StripeWebhookView(APIView):
    """
    POST /api/billing/webhook/
    Receives Stripe webhook events.  Signature is verified with
    STRIPE_WEBHOOK_SECRET; requests that fail verification are rejected 400.

    Handled events:
      checkout.session.completed     — capture customer_id + subscription_id
      customer.subscription.updated  — sync subscription_status
      customer.subscription.deleted  — mark as canceled
      invoice.paid                   — ensure status is active
      invoice.payment_failed         — mark as past_due
    """

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        import stripe

        stripe.api_key = settings.STRIPE_SECRET_KEY
        payload = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')

        if settings.STRIPE_WEBHOOK_SECRET:
            try:
                event = stripe.Webhook.construct_event(
                    payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
                )
            except stripe.SignatureVerificationError:
                logger.warning('Stripe webhook signature verification failed')
                return Response({'error': 'Invalid signature'}, status=400)
            except Exception as e:
                logger.error('Stripe webhook parse error: %s', e)
                return Response({'error': 'Bad payload'}, status=400)
        else:
            # No webhook secret configured (local dev) — parse without verification
            import json
            try:
                event = stripe.Event.construct_from(
                    json.loads(payload), stripe.api_key
                )
            except Exception as e:
                logger.error('Stripe webhook parse error (no secret): %s', e)
                return Response({'error': 'Bad payload'}, status=400)

        event_type = event['type']
        logger.info('Stripe webhook received: %s', event_type)

        try:
            if event_type == 'checkout.session.completed':
                _handle_checkout_completed(event['data']['object'])
            elif event_type in ('customer.subscription.updated', 'customer.subscription.created'):
                _handle_subscription_updated(event['data']['object'])
            elif event_type == 'customer.subscription.deleted':
                _handle_subscription_deleted(event['data']['object'])
            elif event_type == 'invoice.paid':
                _handle_invoice_paid(event['data']['object'])
            elif event_type == 'invoice.payment_failed':
                _handle_invoice_payment_failed(event['data']['object'])
            else:
                logger.debug('Unhandled Stripe event type: %s', event_type)
        except Exception as e:
            logger.error('Error processing webhook %s: %s', event_type, e)
            # Return 200 to prevent Stripe from retrying a permanently broken handler
            return Response({'status': 'handler_error'})

        return Response({'status': 'ok'})


# ── Webhook handlers (pure functions, easy to unit test) ──────────────────────

def _get_org_by_stripe_ids(customer_id=None, subscription_id=None, metadata=None):
    """
    Look up an Organization by Stripe customer/subscription ID or metadata.
    Returns None if not found.
    """
    from apps.organizations.models import Organization

    if customer_id:
        org = Organization.objects.filter(stripe_customer_id=customer_id).first()
        if org:
            return org

    if subscription_id:
        org = Organization.objects.filter(stripe_subscription_id=subscription_id).first()
        if org:
            return org

    if metadata and metadata.get('org_id'):
        org = Organization.objects.filter(id=metadata['org_id']).first()
        if org:
            return org

    return None


def _handle_checkout_completed(session):
    """checkout.session.completed — link Stripe customer + subscription to org."""
    from apps.organizations.models import Organization

    org_id = session.get('metadata', {}).get('org_id')
    customer_id = session.get('customer')
    subscription_id = session.get('subscription')

    if not org_id:
        logger.warning('checkout.session.completed: missing org_id in metadata')
        return

    updated = Organization.objects.filter(id=org_id).update(
        stripe_customer_id=customer_id,
        stripe_subscription_id=subscription_id,
        subscription_status='active',
    )
    if updated:
        logger.info('checkout completed: org %s → active (customer %s)', org_id, customer_id)
    else:
        logger.warning('checkout completed: org %s not found', org_id)


def _stripe_status_to_internal(stripe_status: str) -> str:
    """Map Stripe subscription status to our internal values."""
    mapping = {
        'active': 'active',
        'trialing': 'trialing',
        'past_due': 'past_due',
        'canceled': 'canceled',
        'incomplete': 'past_due',
        'incomplete_expired': 'canceled',
        'unpaid': 'past_due',
        'paused': 'past_due',
    }
    return mapping.get(stripe_status, 'past_due')


def _handle_subscription_updated(subscription):
    """customer.subscription.updated/created — sync status."""
    customer_id = subscription.get('customer')
    subscription_id = subscription.get('id')
    stripe_status = subscription.get('status', '')
    internal_status = _stripe_status_to_internal(stripe_status)
    metadata = subscription.get('metadata', {})

    org = _get_org_by_stripe_ids(
        customer_id=customer_id,
        subscription_id=subscription_id,
        metadata=metadata,
    )
    if not org:
        logger.warning('subscription updated: no org found for customer %s', customer_id)
        return

    org.stripe_subscription_id = subscription_id
    org.subscription_status = internal_status
    org.save(update_fields=['stripe_subscription_id', 'subscription_status'])
    logger.info(
        'subscription updated: org %s → %s (Stripe: %s)',
        org.id, internal_status, stripe_status,
    )


def _handle_subscription_deleted(subscription):
    """customer.subscription.deleted — mark org as canceled."""
    customer_id = subscription.get('customer')
    subscription_id = subscription.get('id')
    metadata = subscription.get('metadata', {})

    org = _get_org_by_stripe_ids(
        customer_id=customer_id,
        subscription_id=subscription_id,
        metadata=metadata,
    )
    if not org:
        logger.warning('subscription deleted: no org found for customer %s', customer_id)
        return

    org.subscription_status = 'canceled'
    org.save(update_fields=['subscription_status'])
    logger.info('subscription deleted: org %s → canceled', org.id)


def _handle_invoice_paid(invoice):
    """invoice.paid — ensure status is active (handles recovery from past_due)."""
    customer_id = invoice.get('customer')
    subscription_id = invoice.get('subscription')

    org = _get_org_by_stripe_ids(customer_id=customer_id, subscription_id=subscription_id)
    if not org:
        return

    if org.subscription_status != 'active':
        org.subscription_status = 'active'
        org.save(update_fields=['subscription_status'])
        logger.info('invoice paid: org %s recovered → active', org.id)


def _handle_invoice_payment_failed(invoice):
    """invoice.payment_failed — mark org as past_due."""
    customer_id = invoice.get('customer')
    subscription_id = invoice.get('subscription')

    org = _get_org_by_stripe_ids(customer_id=customer_id, subscription_id=subscription_id)
    if not org:
        return

    org.subscription_status = 'past_due'
    org.save(update_fields=['subscription_status'])
    logger.info('invoice payment failed: org %s → past_due', org.id)
