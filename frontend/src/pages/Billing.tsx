/**
 * Billing page — Phase 4
 *
 * Shows the org's current subscription status and lets users:
 *   trialing  → start a paid subscription (Stripe Checkout)
 *   active    → manage subscription / update payment (Stripe Portal)
 *   past_due  → update payment method (Stripe Portal, with warning)
 *   canceled  → reactivate (Stripe Checkout)
 *
 * After a successful Stripe Checkout the URL contains ?checkout=success
 * and we show a one-time success banner, then reload billing status.
 */

import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Zap,
  Shield,
  Users,
  RefreshCw,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { billingApi } from '@/api/billing'
import type { SubscriptionStatus } from '@/api/billing'
import { vendorsApi } from '@/api/vendors'
import { useMe } from '@/hooks/useMe'

// Monthly price — configurable via VITE_BILLING_PRICE env var (default: 49)
const MONTHLY_PRICE = (import.meta.env.VITE_BILLING_PRICE as string | undefined) ?? '49'

const TRIAL_DAYS = 14

function trialDaysRemaining(createdAt: string): number {
  const trialEnd = new Date(createdAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24)))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SubscriptionStatus,
  { label: string; badgeCls: string; Icon: React.ElementType }
> = {
  trialing:  { label: 'Free trial',        badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-100/65',   Icon: Zap },
  active:    { label: 'Active',             badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-100/65', Icon: CheckCircle },
  past_due:  { label: 'Payment required',  badgeCls: 'bg-rose-50 text-rose-700 border-rose-100/65',     Icon: AlertTriangle },
  canceled:  { label: 'Canceled',          badgeCls: 'bg-slate-50 text-slate-600 border-slate-200/65',   Icon: XCircle },
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const { label, badgeCls, Icon } = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badgeCls}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} />
}

// ── Plan features list ────────────────────────────────────────────────────────

const FEATURES = [
  'Unlimited COI uploads & AI extraction',
  'Automatic expiration tracking & alerts',
  'Renewal emails with magic-link upload',
  'Compliance checks against your requirements',
  'Unlimited vendors & team members',
  'Priority email support',
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const checkoutResult = searchParams.get('checkout')

  useEffect(() => {
    if (checkoutResult) {
      if (checkoutResult === 'success') {
        toast.success('Subscription activated — thank you!')
        qc.invalidateQueries({ queryKey: ['billing-status'] })
        qc.invalidateQueries({ queryKey: ['me'] })
      } else if (checkoutResult === 'canceled') {
        toast.info('Checkout canceled — no charge was made.')
      }
      setSearchParams({}, { replace: true })
    }
  }, [checkoutResult, qc, setSearchParams])

  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ['billing-status'],
    queryFn: billingApi.status,
    staleTime: 30_000,
  })

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: vendorsApi.list,
    staleTime: 60_000,
  })

  const checkoutMutation = useMutation({
    mutationFn: billingApi.createCheckout,
    onSuccess: ({ url }) => { window.location.href = url },
    onError: () => toast.error('Could not start checkout. Please try again.'),
  })

  const portalMutation = useMutation({
    mutationFn: billingApi.createPortal,
    onSuccess: ({ url }) => { window.location.href = url },
    onError: () => toast.error('Could not open billing portal. Please try again.'),
  })

  const { data: me } = useMe()
  const status = billing?.subscription_status ?? 'trialing'
  const vendorCount = vendors?.length ?? 0
  const isLoading = billingLoading
  const isBusy = checkoutMutation.isPending || portalMutation.isPending

  const daysLeft = status === 'trialing' && me?.organization?.created_at
    ? trialDaysRemaining(me.organization.created_at)
    : null

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-slate-500 text-sm">
          Manage your subscription plans, invoice history, and secure credit cards.
        </p>
      </div>

      {/* Trial countdown banner */}
      {daysLeft !== null && (
        <div className="mb-8 flex items-start gap-3.5 bg-indigo-50 border border-indigo-200/60 rounded-lg px-5 py-4 animate-fade-in-up">
          <Clock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-indigo-800">
              {daysLeft > 0
                ? `Free trial · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`
                : 'Free trial has ended'}
            </p>
            <p className="text-xs text-indigo-700/80 mt-0.5 leading-relaxed">
              {daysLeft > 0
                ? 'Upgrade now to keep compliance tracking and renewal reminders after your trial ends.'
                : 'Your trial has ended. Upgrade below to restore full access.'}
            </p>
          </div>
          <button
            onClick={() => checkoutMutation.mutate()}
            disabled={isBusy}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            Upgrade now
          </button>
        </div>
      )}

      {/* Past-due warning banner */}
      {status === 'past_due' && (
        <div className="mb-8 flex items-start gap-3.5 bg-rose-50 border border-rose-200/60 rounded-lg px-5 py-4.5 animate-fade-in-up">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-rose-800">Action Required: Payment Failed</p>
            <p className="text-xs text-rose-700/90 mt-1 leading-relaxed">
              Your last subscription payment failed. Please update your payment details via the portal to prevent service interruption.
            </p>
          </div>
        </div>
      )}

      {/* Canceled warning banner */}
      {status === 'canceled' && (
        <div className="mb-8 flex items-start gap-3.5 bg-slate-50 border border-slate-200/80 rounded-lg px-5 py-4.5 animate-fade-in-up">
          <XCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800">Subscription Canceled</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Your subscription is canceled and access is paused. Reactivate below to unlock all compliance tracking features.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Current plan card ── */}
        <div className="card p-6 ">
          <div className="flex items-center gap-2.5 mb-5 border-b border-slate-100 pb-3">
            <CreditCard className="w-4.5 h-4.5 text-slate-400" />
            <h2 className="section-heading">Subscription Plan</h2>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-10 w-full mt-4" />
            </div>
          ) : (
            <>
              <div className="mb-4.5">
                <StatusBadge status={status} />
              </div>

              <div className="flex items-baseline gap-1.5 mb-1.5">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight">${MONTHLY_PRICE}</span>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">/ month</span>
              </div>
              <p className="text-[11px] font-semibold text-slate-400 mb-6 uppercase tracking-wider">
                Billed monthly · Cancel anytime
              </p>

              {/* CTA button */}
              {status === 'trialing' && (
                <button
                  onClick={() => checkoutMutation.mutate()}
                  disabled={isBusy}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {isBusy ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isBusy ? 'Redirecting…' : 'Start subscription'}
                </button>
              )}

              {status === 'active' && (
                <button
                  onClick={() => portalMutation.mutate()}
                  disabled={isBusy}
                  className="btn-secondary w-full justify-center disabled:opacity-50"
                >
                  {isBusy ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {isBusy ? 'Redirecting…' : 'Manage subscription'}
                </button>
              )}

              {status === 'past_due' && (
                <button
                  onClick={() => portalMutation.mutate()}
                  disabled={isBusy}
                  className="w-full justify-center inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700 transition-all disabled:opacity-50 shadow-sm"
                >
                  {isBusy ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {isBusy ? 'Redirecting…' : 'Update Payment Method'}
                </button>
              )}

              {status === 'canceled' && (
                <button
                  onClick={() => checkoutMutation.mutate()}
                  disabled={isBusy}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {isBusy ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isBusy ? 'Redirecting…' : 'Reactivate subscription'}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Usage card ── */}
        <div className="card p-6">
          <div className="flex items-center gap-2.5 mb-4 border-b border-slate-100 pb-3">
            <Users className="w-4 h-4 text-slate-400" />
            <h2 className="section-heading">Usage</h2>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-600">Active vendors</span>
            <span className="text-2xl font-semibold text-slate-900 tabular-nums">{vendorCount}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Your plan includes unlimited vendors and certificates.
          </p>
        </div>
      </div>

      {/* ── What's included — shown only to non-active users to help them decide ── */}
      {(status === 'trialing' || status === 'canceled') && (
        <div className="card p-6 mt-6 ">
          <div className="flex items-center gap-2.5 mb-5 border-b border-slate-100 pb-3">
            <Shield className="w-4.5 h-4.5 text-slate-400" />
            <h2 className="section-heading">Everything included in your plan</h2>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-6">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-xs font-medium text-slate-600">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
