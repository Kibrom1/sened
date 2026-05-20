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

import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { billingApi } from '@/api/billing'
import type { SubscriptionStatus } from '@/api/billing'
import { vendorsApi } from '@/api/vendors'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SubscriptionStatus,
  { label: string; badgeCls: string; Icon: React.ElementType }
> = {
  trialing:  { label: 'Free trial',        badgeCls: 'bg-blue-100 text-blue-700',   Icon: Zap },
  active:    { label: 'Active',             badgeCls: 'bg-green-100 text-green-700', Icon: CheckCircle },
  past_due:  { label: 'Payment required',  badgeCls: 'bg-red-100 text-red-700',     Icon: AlertTriangle },
  canceled:  { label: 'Canceled',          badgeCls: 'bg-gray-100 text-gray-500',   Icon: XCircle },
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const { label, badgeCls, Icon } = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${badgeCls}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
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

  // Clear ?checkout= param from URL after reading it once
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

  const status = billing?.subscription_status ?? 'trialing'
  const vendorCount = vendors?.length ?? 0
  const isLoading = billingLoading
  const isBusy = checkoutMutation.isPending || portalMutation.isPending

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your subscription and payment details.
        </p>
      </div>

      {/* Past-due warning banner */}
      {status === 'past_due' && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Payment required</p>
            <p className="text-sm text-red-700 mt-0.5">
              Your last payment failed. Please update your payment method to keep
              access to all features.
            </p>
          </div>
        </div>
      )}

      {/* Canceled warning banner */}
      {status === 'canceled' && (
        <div className="mb-6 flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
          <XCircle className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-800">Subscription canceled</p>
            <p className="text-sm text-gray-600 mt-0.5">
              Your subscription has been canceled. Reactivate below to continue using
              all features.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Current plan card ── */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-gray-400" />
            <h2 className="section-heading">Current plan</h2>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-9 w-36 mt-4" />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <StatusBadge status={status} />
              </div>

              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold text-gray-900">$49</span>
                <span className="text-sm text-gray-500">/ month</span>
              </div>
              <p className="text-xs text-gray-400 mb-6">
                Billed monthly · cancel any time
              </p>

              {/* CTA button */}
              {status === 'trialing' && (
                <button
                  onClick={() => checkoutMutation.mutate()}
                  disabled={isBusy}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {isBusy ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
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
                  {isBusy ? 'Redirecting…' : 'Manage billing'}
                </button>
              )}

              {status === 'past_due' && (
                <button
                  onClick={() => portalMutation.mutate()}
                  disabled={isBusy}
                  className="w-full justify-center inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isBusy ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {isBusy ? 'Redirecting…' : 'Update payment method'}
                </button>
              )}

              {status === 'canceled' && (
                <button
                  onClick={() => checkoutMutation.mutate()}
                  disabled={isBusy}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {isBusy ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
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
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-gray-400" />
            <h2 className="section-heading">Usage</h2>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm text-gray-600">Vendors tracked</span>
                <span className="text-2xl font-bold text-gray-900">{vendorCount}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: `${Math.min((vendorCount / 50) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Unlimited on current plan</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── What's included ── */}
      <div className="card p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-gray-400" />
          <h2 className="section-heading">What's included</h2>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
