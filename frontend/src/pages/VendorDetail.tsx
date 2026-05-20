import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, ArrowLeft, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { vendorsApi, profilesApi } from '@/api/vendors'
import { documentsApi } from '@/api/documents'
import type { COIDocumentListItem } from '@/api/documents'
import type { RequirementProfile } from '@/api/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExpired(date: string | null) {
  if (!date) return false
  return new Date(date) < new Date()
}

function relativeDate(date: string): string {
  const diffMs = new Date(date).getTime() - Date.now()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays > 0) return `in ${diffDays}d`
  return `${Math.abs(diffDays)}d ago`
}

function uploadedRelative(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays} days ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}yr ago`
}

function docStatusLabel(doc: COIDocumentListItem): { label: string; cls: string } {
  if (doc.status === 'uploaded' || doc.status === 'processing') {
    return { label: 'Processing', cls: 'bg-gray-100 text-gray-500' }
  }
  if (doc.status === 'extracted') {
    return { label: 'Needs review', cls: 'bg-blue-100 text-blue-700' }
  }
  if (isExpired(doc.earliest_expiration)) {
    return { label: 'Expired', cls: 'bg-red-100 text-red-700' }
  }
  if (doc.status === 'confirmed') {
    return { label: 'Active', cls: 'bg-green-100 text-green-700' }
  }
  return { label: doc.status, cls: 'bg-gray-100 text-gray-600' }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
}

function VendorDetailSkeleton() {
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <Skeleton className="h-4 w-16 mb-4" />
      <Skeleton className="h-8 w-48 mb-2" />
      <Skeleton className="h-4 w-40 mb-8" />
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <Skeleton className="h-5 w-48" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100 last:border-0">
            <div>
              <Skeleton className="h-4 w-32 mb-1.5" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VendorDetailPage() {
  const { vendorId } = useParams<{ vendorId: string }>()
  const qc = useQueryClient()
  const [editingProfile, setEditingProfile] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: ['vendors', vendorId],
    queryFn: () => vendorsApi.get(vendorId!),
    enabled: !!vendorId,
  })

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ['documents', vendorId],
    queryFn: () => documentsApi.list(vendorId!),
    enabled: !!vendorId,
    staleTime: 15_000,
  })

  const { data: profiles = [] } = useQuery<RequirementProfile[]>({
    queryKey: ['profiles'],
    queryFn: profilesApi.list,
    staleTime: 60_000,
  })

  const updateProfileMutation = useMutation({
    mutationFn: (profileId: string | null) =>
      vendorsApi.update(vendorId!, { requirement_profile: profileId ?? undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors', vendorId] })
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setEditingProfile(false)
      toast.success('Requirement profile updated')
    },
    onError: () => toast.error('Failed to update profile'),
  })

  const startEditProfile = () => {
    setSelectedProfileId(vendor?.requirement_profile ?? '')
    setEditingProfile(true)
  }

  const saveProfile = () => {
    updateProfileMutation.mutate(selectedProfileId || null)
  }

  if (vendorLoading) return <VendorDetailSkeleton />

  const sortedDocs = (docs ?? []).slice().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            to="/vendors"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Vendors
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{vendor?.name}</h1>
          {vendor?.contact_email && (
            <p className="text-gray-500 text-sm mt-0.5">{vendor.contact_email}</p>
          )}
        </div>
        <Link
          to={`/vendors/${vendorId}/upload`}
          className="btn-primary shrink-0 ml-4"
        >
          Upload COI
        </Link>
      </div>

      {/* Vendor meta */}
      {(vendor?.contact_name || vendor?.contact_phone || vendor?.notes) && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {vendor?.contact_name && (
            <div>
              <p className="text-xs text-gray-500">Contact</p>
              <p className="font-medium text-gray-900 mt-0.5">{vendor.contact_name}</p>
            </div>
          )}
          {vendor?.contact_phone && (
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <p className="font-medium text-gray-900 mt-0.5">{vendor.contact_phone}</p>
            </div>
          )}
          {vendor?.notes && (
            <div className="col-span-2">
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-gray-700 mt-0.5">{vendor.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Requirement Profile assignment */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">Requirement Profile</p>
            {editingProfile ? (
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  autoFocus
                >
                  <option value="">— None —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={saveProfile}
                  disabled={updateProfileMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save
                </button>
                <button
                  onClick={() => setEditingProfile(false)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium text-gray-900">
                {vendor?.requirement_profile_name ?? (
                  <span className="text-red-400 font-normal">No profile assigned</span>
                )}
              </p>
            )}
          </div>
          {!editingProfile && (
            <button
              onClick={startEditProfile}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              {vendor?.requirement_profile_name ? 'Change' : 'Assign'}
            </button>
          )}
        </div>
      </div>

      {/* COI document history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="section-heading">Certificates of Insurance</h2>
        </div>

        {docsLoading ? (
          <div>
            {[1, 2].map((i) => (
              <div key={i} className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100 last:border-0">
                <div>
                  <Skeleton className="h-4 w-32 mb-1.5" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : sortedDocs.length === 0 ? (
          /* ── Empty state ── */
          <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <FileText className="w-7 h-7 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-700">No certificates yet</p>
            <p className="text-sm text-gray-400 max-w-xs">
              Upload this vendor's Certificate of Insurance to begin tracking their coverage.
            </p>
            <Link
              to={`/vendors/${vendorId}/upload`}
              className="mt-1 btn-primary"
            >
              Upload first COI
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sortedDocs.map((doc) => {
              const { label, cls } = docStatusLabel(doc)
              return (
                <li key={doc.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.insured_name ?? 'Certificate'}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span
                        className="text-xs text-gray-400"
                        title={new Date(doc.created_at).toLocaleDateString()}
                      >
                        Uploaded {uploadedRelative(doc.created_at)}
                      </span>
                      {doc.earliest_expiration && (
                        <span
                          className={`text-xs ${
                            isExpired(doc.earliest_expiration)
                              ? 'text-red-500 font-medium'
                              : 'text-gray-400'
                          }`}
                          title={new Date(doc.earliest_expiration).toLocaleDateString()}
                        >
                          {isExpired(doc.earliest_expiration) ? 'Expired' : 'Expires'}{' '}
                          {relativeDate(doc.earliest_expiration)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-3 shrink-0">
                    {doc.status === 'extracted' && (
                      <Link
                        to={`/vendors/${vendorId}/upload?docId=${doc.id}`}
                        className="btn-action"
                      >
                        Review
                      </Link>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
                      {label}
                    </span>
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
