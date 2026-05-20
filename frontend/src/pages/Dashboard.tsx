import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertCircle, Clock, Eye, CheckCircle } from 'lucide-react'
import { apiClient } from '@/api/client'
import { documentsApi } from '@/api/documents'
import type { COIDocumentListItem } from '@/api/documents'
import type { DashboardBuckets } from '@/api/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function isExpired(date: string | null) {
  if (!date) return false
  return new Date(date) < new Date()
}

function isExpiringSoon(date: string | null, days = 30) {
  if (!date) return false
  const d = new Date(date)
  const now = new Date()
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  return d >= now && d <= cutoff
}

/** Returns a short relative label: "in 12 days", "expired 3 days ago", etc. */
function relativeDate(date: string | null): string {
  if (!date) return '—'
  const d = new Date(date)
  const diffMs = d.getTime() - Date.now()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays > 0) return `in ${diffDays}d`
  return `${Math.abs(diffDays)}d ago`
}

type DocStatus = 'expired' | 'expiring_soon' | 'active' | 'unconfirmed' | 'processing'

function docDisplayStatus(doc: COIDocumentListItem): DocStatus {
  if (doc.status === 'processing' || doc.status === 'uploaded') return 'processing'
  if (doc.status === 'extracted') return 'unconfirmed'
  if (isExpired(doc.earliest_expiration)) return 'expired'
  if (isExpiringSoon(doc.earliest_expiration)) return 'expiring_soon'
  return 'active'
}

// ── Queries ────────────────────────────────────────────────────────────────────

function useDashboard() {
  return useQuery<DashboardBuckets>({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get<DashboardBuckets>('/dashboard/').then((r) => r.data),
    retry: false,
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

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-card p-5">
      <Skeleton className="w-5 h-5 mb-3" />
      <Skeleton className="w-10 h-8 mb-2" />
      <Skeleton className="w-20 h-3.5" />
    </div>
  )
}

function TableRowSkeleton() {
  return (
    <tr>
      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
      <td className="px-4 py-3" />
    </tr>
  )
}

// ── Status pill ────────────────────────────────────────────────────────────────

function DocStatusPill({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { label: string; cls: string }> = {
    expired:       { label: 'Expired',       cls: 'bg-red-100 text-red-700' },
    expiring_soon: { label: 'Expiring soon', cls: 'bg-yellow-100 text-yellow-700' },
    active:        { label: 'Active',        cls: 'bg-green-100 text-green-700' },
    unconfirmed:   { label: 'Needs review',  cls: 'bg-blue-100 text-blue-700' },
    processing:    { label: 'Processing',    cls: 'bg-gray-100 text-gray-500' },
  }
  const { label, cls } = map[status]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
  )
}

// ── Summary card ───────────────────────────────────────────────────────────────

type CardConfig = {
  label: string
  count: number
  Icon: React.ElementType
  colorCls: string
  borderCls: string
  filter: DocStatus | null
}

function SummaryCard({
  label, count, Icon, colorCls, borderCls, filter, activeFilter, onFilter,
}: CardConfig & { activeFilter: DocStatus | null; onFilter: (f: DocStatus | null) => void }) {
  const isActive = activeFilter === filter
  return (
    <button
      onClick={() => onFilter(isActive ? null : filter)}
      className={`text-left rounded-xl border p-5 shadow-card transition-all w-full ${borderCls} ${
        isActive ? 'ring-2 ring-brand-400' : 'hover:shadow-card-md'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-5 h-5 ${colorCls}`} />
        {isActive && (
          <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
            Filtered
          </span>
        )}
      </div>
      <div className={`text-3xl font-bold ${colorCls}`}>{count}</div>
      <div className="text-sm text-gray-500 mt-1 font-medium">{label}</div>
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: compliance } = useDashboard()
  const { data: docs, isLoading: docsLoading } = useDocuments()
  const [activeFilter, setActiveFilter] = useState<DocStatus | null>(null)

  const sortedDocs = (docs ?? []).slice().sort((a, b) => {
    const priority: Record<DocStatus, number> = {
      expired: 0, expiring_soon: 1, unconfirmed: 2, processing: 3, active: 4,
    }
    return priority[docDisplayStatus(a)] - priority[docDisplayStatus(b)]
  })

  const counts = {
    expired:       sortedDocs.filter((d) => docDisplayStatus(d) === 'expired').length,
    expiring_soon: sortedDocs.filter((d) => docDisplayStatus(d) === 'expiring_soon').length,
    unconfirmed:   sortedDocs.filter((d) => docDisplayStatus(d) === 'unconfirmed').length,
    active:        sortedDocs.filter((d) => docDisplayStatus(d) === 'active').length,
  }

  const finalCounts = compliance
    ? {
        expired:       compliance.expired.length,
        expiring_soon: compliance.needs_review.length,
        unconfirmed:   0,
        active:        compliance.matches_requirements.length,
      }
    : counts

  const totalIssues = finalCounts.expired + finalCounts.expiring_soon + finalCounts.unconfirmed

  const visibleDocs = activeFilter
    ? sortedDocs.filter((d) => docDisplayStatus(d) === activeFilter)
    : sortedDocs

  const cards: CardConfig[] = [
    {
      label: 'Expired',
      count: finalCounts.expired,
      Icon: AlertCircle,
      colorCls: 'text-red-600',
      borderCls: finalCounts.expired > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200',
      filter: 'expired',
    },
    {
      label: 'Expiring soon',
      count: finalCounts.expiring_soon,
      Icon: Clock,
      colorCls: 'text-yellow-600',
      borderCls: finalCounts.expiring_soon > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200',
      filter: 'expiring_soon',
    },
    {
      label: 'Needs review',
      count: finalCounts.unconfirmed,
      Icon: Eye,
      colorCls: 'text-blue-600',
      borderCls: finalCounts.unconfirmed > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200',
      filter: 'unconfirmed',
    },
    {
      label: 'Active',
      count: finalCounts.active,
      Icon: CheckCircle,
      colorCls: 'text-green-600',
      borderCls: 'bg-white border-gray-200',
      filter: 'active',
    },
  ]

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Page header — hidden on desktop (top bar shows title) */}
      <div className="mb-8 lg:hidden">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>
      <p className="text-gray-500 text-sm mb-8 -mt-4 lg:mt-0">
        {totalIssues > 0
          ? `${totalIssues} item${totalIssues > 1 ? 's' : ''} need attention`
          : 'All certificates are up to date'}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {docsLoading
          ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
          : cards.map((card) => (
              <SummaryCard
                key={card.label}
                {...card}
                activeFilter={activeFilter}
                onFilter={setActiveFilter}
              />
            ))}
      </div>

      {/* Certificate table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="section-heading">Certificates</h2>
            {activeFilter && (
              <button
                onClick={() => setActiveFilter(null)}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                Clear filter ×
              </button>
            )}
          </div>
          <Link to="/vendors" className="text-sm text-brand-600 hover:underline font-medium">
            Manage vendors
          </Link>
        </div>

        {docsLoading ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 font-medium">
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Insured</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} />)}
            </tbody>
          </table>
        ) : sortedDocs.length === 0 ? (
          /* ── Empty state ── */
          <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-700">No certificates yet</p>
            <p className="text-sm text-gray-400 max-w-xs">
              Add a vendor and upload their COI to start tracking insurance compliance.
            </p>
            <Link
              to="/vendors"
              className="mt-1 btn-primary"
            >
              Add your first vendor
            </Link>
          </div>
        ) : visibleDocs.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No certificates match this filter.{' '}
            <button onClick={() => setActiveFilter(null)} className="text-brand-600 hover:underline">
              Clear filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 font-medium">
                  <th className="px-4 py-3 text-left">Vendor</th>
                  <th className="px-4 py-3 text-left">Insured</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleDocs.map((doc) => {
                  const dStatus = docDisplayStatus(doc)
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/vendors/${doc.vendor}`}
                          className="font-medium text-gray-900 hover:text-brand-600 truncate block max-w-[160px]"
                        >
                          {doc.vendor_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-[160px]">
                        {doc.insured_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {doc.earliest_expiration ? (
                          <span
                            className={`font-medium ${
                              isExpired(doc.earliest_expiration)
                                ? 'text-red-600'
                                : isExpiringSoon(doc.earliest_expiration)
                                  ? 'text-yellow-600'
                                  : 'text-gray-700'
                            }`}
                            title={new Date(doc.earliest_expiration).toLocaleDateString()}
                          >
                            {relativeDate(doc.earliest_expiration)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DocStatusPill status={dStatus} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {dStatus === 'unconfirmed' && (
                          <Link
                            to={`/vendors/${doc.vendor}/upload`}
                            className="btn-action"
                          >
                            Review
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
