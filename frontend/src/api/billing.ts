import { apiClient } from './client'

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface BillingStatus {
  subscription_status: SubscriptionStatus
  has_payment_method: boolean
  stripe_customer_id: string | null
}

export const billingApi = {
  status: () =>
    apiClient.get<BillingStatus>('/billing/status/').then((r) => r.data),

  /** Start a Stripe Checkout session. Returns the hosted checkout URL. */
  createCheckout: () =>
    apiClient.post<{ url: string }>('/billing/checkout/').then((r) => r.data),

  /** Open the Stripe Customer Portal. Returns the portal URL. */
  createPortal: () =>
    apiClient.post<{ url: string }>('/billing/portal/').then((r) => r.data),
}
