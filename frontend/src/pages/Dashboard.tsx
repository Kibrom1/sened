import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { documentsApi } from '@/api/documents'
import type { COIDocumentListItem } from '@/api/documents'
import type { DashboardBuckets } from '@/api/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'

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

function expirationLabel(date: string | null): string {
  if (!date) return ''
  const d = new Date(date)
  if (isExpired(date)) return `Expired ${d.toLocaleDateString()}`
  if (isExpiringSoon(date)) return `Expires ${d.toLocaleDateString()}`
  return `Expires ${d.toLocaleDateString()}`
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
    retry: false,          // compliance engine may not be built yet — don't loop on 404
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: compliance } = useDashboard()
  const { data: docs, isLoading: docsLoading } = useDocuments()

  // Sort documents by urgency
  const sortedDocs = (docs ?? []).slice().sort((a, b) => {
    const priority: Record<DocStatus, number> = {
      expired: 0, expiring_soon: 1, unconfirmed: 2, processing: 3, active: 4,
    }
    return priority[docDisplayStatus(a)] - priority[docDisplayStatus(b)]
  })

  // Summary counts from docs (compliance data is optional / Phase 2)
  const counts = {
    expired:       sortedDocs.filter((d) => docDisplayStatus(d) === 'expired').length,
    expiring_soon: sortedDocs.filter((d) => docDisplayStatus(d) === 'expiring_soon').length,
    unconfirmed:   sortedDocs.filter((d) => docDisplayStatus(d) === 'unconfirmed').length,
    active:        sortedDocs.filter((d) => docDisplayStatus(d) === 'active').length,
  }

  // Fall back to compliance bucket counts if available
  const finalCounts = compliance
    ? {
        expired:       compliance.expired.length,
        expiring_soon: compliance.needs_review.length,
        unconfirmed:   0,
        active:        compliance.matches_requirements.length,
      }
    : counts

  const totalIssues = finalCounts.expired + finalCounts.expiring_soon + finalCounts.unconfirmed

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          {totalIssues > 0
            ? `${totalIssues} item${totalIssues > 1 ? 's' : ''} need attention`
            : 'All certificates are up to date'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-3xl font-bold text-red-600">{finalCounts.expired}</div>
          <div className="text-sm text-gray-500 mt-1">Expired</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-3xl font-bold text-yellow-600">{finalCounts.expiring_soon}</div>
          <div className="text-sm text-gray-500 mt-1">Expiring soon</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-3xl font-bold text-blue-600">{finalCounts.unconfirmed}</div>
          <div className="text-sm text-gray-500 mt-1">Needs review</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="text-3xl font-bold text-green-600">{finalCounts.active}</div>
          <div className="text-sm text-gray-500 mt-1">Active</div>
        </div>
      </div>

      {/* Document list */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Certificates</h2>
          <Link to="/vendors" className="text-sm text-brand-600 hover:underline">
            Manage vendors
          </Link>
        </div>

        {docsLoading ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : sortedDocs.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            No certificates uploaded yet.{' '}
            <Link to="/vendors" className="text-brand-600 hover:underline">
              Add a vendor
            </Link>{' '}
            and upload their first COI.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sortedDocs.map((doc) => {
              const dStatus = docDisplayStatus(doc)
              return (
                <li
                  key={doc.id}
                  className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/vendors/${doc.vendor}`}
                      className="text-sm font-medium text-gray-900 hover:text-brand-600 truncate block"
                    >
                      {doc.vendor_name}
                    </Link>
                    <div className="flex items-center gap-3 mt-0.5">
                      {doc.insured_name && (
                        <span className="text-xs text-gray-400 truncate">{doc.insured_name}</span>
                      )}
                      {doc.earliest_expiration && (
                        <span className={`text-xs ${isExpired(doc.earliest_expiration) ? 'text-red-500' : 'text-gray-400'}`}>
                          {expirationLabel(doc.earliest_expiration)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-3 shrink-0">
                    {dStatus === 'unconfirmed' && (
                      <Link
                        to={`/vendors/${doc.vendor}/${doc.id}/review`}
                        className="text-xs text-brand-600 hover:underline font-medium"
                      >
                        Review →
                      </Link>
                    )}
                    <DocStatusPill status={dStatus} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
