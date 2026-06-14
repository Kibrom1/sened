/**
 * Renewals — visibility into the automated renewal loop.
 *
 * Closes the "renewal activity is a black box" gap from the product review:
 * surfaces in-flight renewal requests (status, sent/responded dates, link
 * expiry), an activity feed, and a manual-trigger action. Reuses the existing
 * GET /api/renewals/, GET /api/activity/, and POST /api/renewals/send/<id>/.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react'
import { renewalsApi } from '@/api/renewals'
import { vendorsApi } from '@/api/vendors'
import type { ActivityLogEntry, RenewalRequest, RenewalStatus, Vendor } from '@/api/types'

// ── Date helpers (shared vocabulary with Dashboard) ─────────────────────────

function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function relativeDays(date: string | null): string | null {
  if (!date) return null
  const diffDays = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000)
  if (diffDays === 0) return 'today'
  if (diffDays > 0) return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
  return `${Math.abs(diffDays)} day${diffDays !== -1 ? 's' : ''} ago`
}

// ── Status pill ─────────────────────────────────────────────────────────────

const RENEWAL_STATUS_META: Record<
  RenewalStatus,
  { label: string; pill: string; dot: string }
> = {
  scheduled: {
    label: 'Scheduled',
    pill: 'bg-slate-50 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
  sent: {
    label: 'Reminder sent',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  responded: {
    label: 'Responded',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  expired_no_response: {
    label: 'No response',
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
}

function RenewalStatusPill({ status }: { status: RenewalStatus }) {
  const meta = RENEWAL_STATUS_META[status] ?? RENEWAL_STATUS_META.scheduled
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

// ── Activity action → human label ───────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  renewal_reminder_triggered: 'Renewal reminder triggered',
  renewal_sent: 'Renewal reminder sent',
  coi_uploaded_via_magic_link: 'Vendor uploaded a certificate',
  coi_uploaded: 'Certificate uploaded',
  coi_confirmed: 'Certificate confirmed',
  vendor_created: 'Vendor added',
  vendor_deactivated: 'Vendor deactivated',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

// ── Manual trigger ──────────────────────────────────────────────────────────

function ManualTrigger({ onSent }: { onSent: () => void }) {
  const [vendorId, setVendorId] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: vendorsApi.list,
  })

  const sendable = useMemo(
    () => (vendors ?? []).filter((v: Vendor) => v.status === 'active' && v.contact_email),
    [vendors],
  )

  const mutation = useMutation({
    mutationFn: (id: string) => renewalsApi.send(id),
    onSuccess: (res) => {
      setFeedback({ kind: 'ok', msg: res.message })
      setVendorId('')
      onSent()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not send the reminder. Please try again.'
      setFeedback({ kind: 'err', msg })
    },
  })

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Send a reminder now</h2>
      <p className="text-xs text-slate-500 mb-4">
        Manually email a vendor a secure upload link, outside the scheduled cadence.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={vendorId}
          onChange={(e) => {
            setVendorId(e.target.value)
            setFeedback(null)
          }}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
        >
          <option value="">Select a vendor…</option>
          {sendable.map((v: Vendor) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => vendorId && mutation.mutate(vendorId)}
          disabled={!vendorId || mutation.isPending}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          <Send className="w-4 h-4" />
          {mutation.isPending ? 'Sending…' : 'Send reminder'}
        </button>
      </div>
      {sendable.length === 0 && vendors && (
        <p className="mt-3 text-xs text-amber-700">
          No vendors with a contact email yet. Add an email on a vendor to enable reminders.
        </p>
      )}
      {feedback && (
        <p
          className={`mt-3 text-xs flex items-center gap-1.5 ${
            feedback.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {feedback.kind === 'ok' ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" />
          )}
          {feedback.msg}
        </p>
      )}
    </div>
  )
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 bg-slate-100 rounded-lg" />
      ))}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function RenewalsPage() {
  const qc = useQueryClient()

  const renewals = useQuery({
    queryKey: ['renewals'],
    queryFn: renewalsApi.list,
  })

  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => renewalsApi.activity(),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['renewals'] })
    qc.invalidateQueries({ queryKey: ['activity'] })
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Renewals</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track reminder requests sent to vendors and their responses.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <ManualTrigger onSent={refresh} />

      {/* Renewal requests */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Renewal requests</h2>
        </div>
        <div className="p-5">
          {renewals.isLoading ? (
            <TableSkeleton />
          ) : renewals.isError ? (
            <div className="flex items-center gap-2 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4" />
              Couldn't load renewal requests.
              <button onClick={() => renewals.refetch()} className="underline font-medium">
                Retry
              </button>
            </div>
          ) : (renewals.data ?? []).length === 0 ? (
            <div className="text-center py-10">
              <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">No renewal requests yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Reminders appear here once the daily scan or a manual send creates them.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-100">
                    <th className="pb-2 pr-4">Vendor</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Sent</th>
                    <th className="pb-2 pr-4">Responded</th>
                    <th className="pb-2 pr-4">Link expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(renewals.data as RenewalRequest[]).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="py-3 pr-4">
                        <Link
                          to={`/vendors/${r.vendor_id}`}
                          className="font-medium text-slate-800 hover:text-brand-600"
                        >
                          {r.vendor_name}
                        </Link>
                        {r.contact_email && (
                          <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                            <Mail className="w-3 h-3" />
                            {r.contact_email}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <RenewalStatusPill status={r.status} />
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {fmtDate(r.sent_at)}
                        {r.sent_at && (
                          <span className="block text-xs text-slate-400">
                            {relativeDays(r.sent_at)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {r.responded_at ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {fmtDate(r.responded_at)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {r.status === 'responded' ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <>
                            {fmtDate(r.magic_link_expires_at)}
                            {r.magic_link_expires_at && (
                              <span className="block text-xs text-slate-400">
                                {relativeDays(r.magic_link_expires_at)}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Recent activity</h2>
        </div>
        <div className="p-5">
          {activity.isLoading ? (
            <TableSkeleton />
          ) : activity.isError ? (
            <div className="flex items-center gap-2 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4" />
              Couldn't load activity.
              <button onClick={() => activity.refetch()} className="underline font-medium">
                Retry
              </button>
            </div>
          ) : (activity.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {(activity.data as ActivityLogEntry[]).map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <ActivityIcon action={a.action} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      {actionLabel(a.action)}
                      {a.vendor_name && (
                        <span className="text-slate-500"> · {a.vendor_name}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {a.actor} · {fmtDate(a.created_at)} ({relativeDays(a.created_at)})
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityIcon({ action }: { action: string }) {
  if (action.includes('uploaded'))
    return <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
  if (action.includes('renewal'))
    return <Send className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
  if (action.includes('deactivated'))
    return <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
  return <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
}
