from django.urls import path
from .views import BillingStatusView, CheckoutSessionView, CustomerPortalView, StripeWebhookView

urlpatterns = [
    path('billing/status/',   BillingStatusView.as_view()),
    path('billing/checkout/', CheckoutSessionView.as_view()),
    path('billing/portal/',   CustomerPortalView.as_view()),
    path('billing/webhook/',  StripeWebhookView.as_view()),
]
