/**
 * Dashboard — vendor compliance overview.
 *
 * Single source of truth: GET /api/dashboard/ (compliance buckets per vendor).
 * The stat tiles and the table below render the SAME dataset, so counts always
 * match what the table shows. Documents/vendors queries are used only for the
 * getting-started checklist.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Download,
  Eye,
  FileText,
  RefreshCw,
  UserPlus,
} from 'lucide-react'
import { apiClient } from '@/api/client'
import { documentsApi } from '@/api/documents'
import { vendorsApi } from '@/api/vendors'
import type { ComplianceCheckWithVendor, DashboardBuckets } from '@/api/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

type BucketKey = keyof DashboardBuckets

const BUCKET_ORDER: BucketKey[] = ['expired', 'gaps_found', 'needs_review', 'matches_requirements']

function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "in 12 days", "today", "3 days ago" — always shown next to the absolute date. */
function relativeDays(date: string | null): string | null {
  if (!date) return null
  const diffDays = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000)
  if (diffDays === 0) return 'today'
  if (diffDays > 0) return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
  return `${Math.abs(diffDays)} day${diffDays !== -1 ? 's' : ''} ago`
}

// ── Status pill ────────────────────────────────────────────────────────────────

const STATUS_META: Record<BucketKey, { label: string; pill: string; dot: string }> = {
  expired: {
    label: 'Expired',
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  gaps_found: {
    label: 'Gaps found',
    pill: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
  },
  needs_review: {
    label: 'Needs review',
    pill: 'bg-slate-50 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
  matches_requirements: {
    label: 'Matches requirements',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
}

function StatusPill({ status }: { status: BucketKey }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md border ${meta.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

// ── Queries ────────────────────────────────────────────────────────────────────

function useDashboard() {
  return useQuery<DashboardBuckets>({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get<DashboardBuckets>('/dashboard/').then((r) => r.data),
    staleTime: 30_000,
  })
}

function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => documentsApi.list(),
    staleTime: 30_000,
  })
}

function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: vendorsApi.list,
    staleTime: 60_000,
  })
}

// ── Skeletons ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className ?? ''}`} />
}

function StatTileSkeleton() {
  return (
    <div className="card p-4">
      <Skeleton className="w-24 h-3.5 mb-3" />
      <Skeleton className="w-10 h-7" />
    </div>
  )
}

function TableRowSkeleton() {
  return (
    <tr>
      <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-md" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
      <td className="px-4 py-3" />
    </tr>
  )
}

// ── Stat tile ──────────────────────────────────────────────────────────────────

function StatTile({
  bucket, count, Icon, iconCls, active, onClick,
}: {
  bucket: BucketKey
  count: number
  Icon: React.ElementType
  iconCls: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`card text-left p-4 transition-colors duration-150 ${
        active ? 'border-brand-500 ring-1 ring-brand-500' : 'hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${iconCls}`} />
        <span className="text-xs font-medium text-slate-500">{STATUS_META[bucket].label}</span>
      </div>
      <div className="text-2xl font-semibold text-slate-900 tabular-nums">{count}</div>
    </button>
  )
}

// ── Reasons cell ───────────────────────────────────────────────────────────────

function ReasonsCell({ reasons }: { reasons: Array<string | { reason?: string } | any> }) {
  if (!reasons || reasons.length === 0) return <span className="text-slate-300">—</span>
  const shown = reasons.slice(0, 2)
  const more = reasons.length - shown.length
  const norm = (r: any) => (typeof r === 'string' ? r : (r && typeof r.reason === 'string' ? r.reason : String(r)))
  return (
    <div className="space-y-0.5" title={reasons.map(norm).join('\n')}>
      {shown.map((r, i) => (
        <p key={i} className="text-xs text-slate-600 leading-snug">{norm(r)}</p>
      ))}
      {more > 0 && (
        <p className="text-xs text-slate-400">+{more} more</p>
      )}
    </div>
  )
}

// ── Getting started checklist ──────────────────────────────────────────────────

type ChecklistStep = { done: boolean; label: string; to: string; cta: string }

function GettingStarted({ steps }: { steps: ChecklistStep[] }) {
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Getting started</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Finish setup to enable automated compliance checks.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500">{done} of {steps.length} complete</span>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center justify-between gap-4 py-2 px-3 rounded-md border border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2.5">
              {step.done ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
              )}
              <span className={`text-sm ${step.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                {step.label}
              </span>
            </div>
            {!step.done && (
              <Link to={step.to} className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0">
                {step.cta} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCsv(rows: (ComplianceCheckWithVendor & { bucket: BucketKey })[]) {
  const header = ['Vendor', 'Status', 'Issues', 'Next expiration', 'Last checked']
  const lines = rows.map((r) => [
    r.vendor_name,
    STATUS_META[r.bucket].label,
    (r.reasons ?? []).join('; '),
    r.next_expiration ?? '',
    r.checked_at ?? '',
  ])
  const csv = [header, ...lines]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `compliance-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: buckets, isLoading, isError, refetch, isFetching } = useDashboard()
  const { data: docs } = useDocuments()
  const { data: vendors } = useVendors()
  const [activeBucket, setActiveBucket] = useState<BucketKey | null>(null)

  // Flatten buckets into one row list, tagged with bucket key
  const allRows = useMemo(() => {
    if (!buckets) return []
    return BUCKET_ORDER.flatMap((key) =>
      (buckets[key] ?? []).map((row) => ({ ...row, bucket: key })),
    )
  }, [buckets])

  const visibleRows = activeBucket ? allRows.filter((r) => r.bucket === activeBucket) : allRows

  const counts: Record<BucketKey, number> = {
    expired: buckets?.expired.length ?? 0,
    gaps_found: buckets?.gaps_found.length ?? 0,
    needs_review: buckets?.needs_review.length ?? 0,
    matches_requirements: buckets?.matches_requirements.length ?? 0,
  }
  const totalIssues = counts.expired + counts.gaps_found + counts.needs_review

  // Getting-started checklist (uses vendors/docs only)
  const hasVendors = (vendors?.length ?? 0) > 0
  const hasDocs = (docs?.length ?? 0) > 0
  const hasConfirmed = (docs ?? []).some((d) => d.status === 'confirmed')
  const checklistSteps: ChecklistStep[] = [
    { done: hasVendors, label: 'Add your first vendor', to: '/vendors', cta: 'Add vendor' },
    { done: hasDocs, label: 'Upload a Certificate of Insurance', to: '/vendors', cta: 'Upload' },
    { done: hasConfirmed, label: 'Review and confirm extracted coverage', to: '/vendors', cta: 'Review' },
  ]

  const tiles: { bucket: BucketKey; Icon: React.ElementType; iconCls: string }[] = [
    { bucket: 'expired', Icon: AlertCircle, iconCls: 'text-rose-600' },
    { bucket: 'gaps_found', Icon: AlertTriangle, iconCls: 'text-amber-600' },
    { bucket: 'needs_review', Icon: Eye, iconCls: 'text-slate-500' },
    { bucket: 'matches_requirements', Icon: CheckCircle, iconCls: 'text-emerald-600' },
  ]

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Vendor compliance</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isError
              ? 'Status unavailable'
              : isLoading
                ? 'Loading…'
                : totalIssues > 0
                  ? `${totalIssues} vendor${totalIssues !== 1 ? 's' : ''} need${totalIssues === 1 ? 's' : ''} attention`
                  : 'All vendors match their requirements'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCsv(visibleRows)}
            disabled={visibleRows.length === 0}
            className="btn-secondary"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <Link to="/vendors" className="btn-primary">
            <UserPlus className="w-4 h-4" />
            Add vendor
          </Link>
        </div>
      </div>

      {/* Error state — never pretend things are fine */}
      {isError && (
        <div className="card border-rose-200 bg-rose-50/50 p-4 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-rose-800">Couldn't load compliance data</p>
              <p className="text-xs text-rose-700 mt-0.5">
                The statuses shown may be incomplete. Retry or refresh the page.
              </p>
            </div>
          </div>
          <button onClick={() => refetch()} className="btn-secondary shrink-0" disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      )}

      {/* Getting started */}
      {!isLoading && !isError && <GettingStarted steps={checklistSteps} />}

      {/* Stat tiles — same dataset as the table below */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
          : tiles.map(({ bucket, Icon, iconCls }) => (
              <StatTile
                key={bucket}
                bucket={bucket}
                count={counts[bucket]}
                Icon={Icon}
                iconCls={iconCls}
                active={activeBucket === bucket}
                onClick={() => setActiveBucket(activeBucket === bucket ? null : bucket)}
              />
            ))}
      </div>

      {/* Filter context */}
      {activeBucket && (
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
          <span>
            Showing {visibleRows.length} of {allRows.length} vendors ·{' '}
            <span className="font-medium">{STATUS_META[activeBucket].label}</span>
          </span>
          <button
            onClick={() => setActiveBucket(null)}
            className="text-brand-600 hover:text-brand-700 font-medium"
          >
            Clear
          </button>
        </div>
      )}

      {/* Vendor compliance table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="section-heading">Vendors</h2>
          <Link to="/vendors" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            Manage vendors
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 font-medium bg-slate-50">
                <th className="px-4 py-2.5 text-left">Vendor</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Issues</th>
                <th className="px-4 py-2.5 text-left">Next expiration</th>
                <th className="px-4 py-2.5 text-right">Last checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)
              ) : allRows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
                      <FileText className="w-8 h-8 text-slate-300" />
                      <div>
                        <p className="font-medium text-slate-800">No vendors yet</p>
                        <p className="text-sm text-slate-500 mt-1 max-w-sm">
                          Add a vendor, then upload their Certificate of Insurance to see
                          compliance status here.
                        </p>
                      </div>
                      <Link to="/vendors" className="btn-primary mt-1">Add your first vendor</Link>
                    </div>
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-slate-500">
                    No vendors in this bucket.{' '}
                    <button onClick={() => setActiveBucket(null)} className="text-brand-600 font-medium hover:underline">
                      Clear filter
                    </button>
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.vendor_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/vendors/${row.vendor_id}`}
                        className="font-medium text-slate-900 hover:text-brand-600"
                      >
                        {row.vendor_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.bucket} />
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <ReasonsCell reasons={row.reasons ?? []} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.next_expiration ? (
                        <>
                          <span className="text-slate-700">{fmtDate(row.next_expiration)}</span>
                          <span className="text-slate-400 text-xs ml-1.5">
                            {relativeDays(row.next_expiration)}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 whitespace-nowrap">
                      {fmtDate(row.checked_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
