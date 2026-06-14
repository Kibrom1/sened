import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, ArrowLeft, Pencil, Check, X, Shield, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { vendorsApi, profilesApi } from '@/api/vendors'
import { documentsApi } from '@/api/documents'
import { complianceApi } from '@/api/compliance'
import { apiClient } from '@/api/client'
import type { COIDocumentListItem } from '@/api/documents'
import type { RequirementProfile, VendorComplianceStatus } from '@/api/types'

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

function docStatusLabel(doc: COIDocumentListItem): { label: string; cls: string; dot: string } {
  if (doc.status === 'uploaded' || doc.status === 'processing') {
    return { label: 'Processing', cls: 'bg-slate-50 text-slate-500 border-slate-100/60', dot: 'bg-slate-400 animate-pulse' }
  }
  if (doc.status === 'extracted') {
    return { label: 'Pending confirmation', cls: 'bg-indigo-50 text-indigo-700 border-indigo-100/60', dot: 'bg-indigo-500' }
  }
  if (isExpired(doc.earliest_expiration)) {
    return { label: 'Expired', cls: 'bg-rose-50 text-rose-700 border-rose-100/60', dot: 'bg-rose-500' }
  }
  if (doc.status === 'confirmed') {
    return { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100/60', dot: 'bg-emerald-500' }
  }
  return { label: doc.status, cls: 'bg-slate-50 text-slate-600 border-slate-100', dot: 'bg-slate-400' }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className ?? ''}`} />
}

function VendorDetailSkeleton() {
  return (
    <div className="px-8 py-8 max-w-3xl mx-auto">
      <Skeleton className="h-4 w-16 mb-4" />
      <Skeleton className="h-8 w-48 mb-2" />
      <Skeleton className="h-4 w-40 mb-8" />
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <Skeleton className="h-5 w-48" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-6 py-4.5 flex items-center justify-between border-b border-slate-100 last:border-0">
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

// ── Compliance badge ──────────────────────────────────────────────────────────

const COMPLIANCE_CONFIG: Record<
  VendorComplianceStatus['status'],
  { label: string; badgeCls: string; dotCls: string }
> = {
  matches_requirements: { label: 'Compliant',     badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-100/60',  dotCls: 'bg-emerald-500'  },
  gaps_found:           { label: 'Gaps found',    badgeCls: 'bg-amber-50 text-amber-700 border-amber-100/60', dotCls: 'bg-amber-500' },
  expired:              { label: 'Expired',        badgeCls: 'bg-rose-50 text-rose-700 border-rose-100/60',      dotCls: 'bg-rose-500'    },
  needs_review:         { label: 'Awaiting review', badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-100/60',  dotCls: 'bg-indigo-500'   },
  no_data:              { label: 'No data yet',   badgeCls: 'bg-slate-50 text-slate-500 border-slate-100/60',    dotCls: 'bg-slate-400'   },
}

function ComplianceBadge({ status }: { status: VendorComplianceStatus['status'] }) {
  const { label, badgeCls, dotCls } = COMPLIANCE_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badgeCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
      {label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VendorDetailPage() {
  const { vendorId } = useParams<{ vendorId: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editingProfile, setEditingProfile] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRenewal, setConfirmRenewal] = useState(false)

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

  const { data: compliance, isLoading: complianceLoading } = useQuery<VendorComplianceStatus>({
    queryKey: ['compliance', vendorId],
    queryFn: () => complianceApi.vendorStatus(vendorId!),
    enabled: !!vendorId,
    staleTime: 30_000,
  })

  const sendRenewalMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ renewal_id: string; message: string }>(
        `/renewals/send/${vendorId}/`,
      ).then((r) => r.data),
    onSuccess: (data) => toast.success(data.message),
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to send renewal reminder.'
      toast.error(msg)
      setConfirmRenewal(false)
    },
  })

  const deleteVendorMutation = useMutation({
    mutationFn: () => vendorsApi.delete(vendorId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      toast.success(`${vendor?.name ?? 'Vendor'} deleted`)
      navigate('/vendors')
    },
    onError: () => toast.error('Failed to delete vendor'),
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
    <div className="px-8 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link
            to="/vendors"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 mb-3 transition-colors uppercase tracking-wider"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Vendors
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{vendor?.name}</h1>
          {vendor?.contact_email && (
            <p className="text-slate-500 text-sm mt-1">{vendor.contact_email}</p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center justify-center p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 transition-all"
            title="Delete vendor and all associated records"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <Link
            to={`/vendors/${vendorId}/upload`}
            className="btn-primary"
          >
            Upload COI
          </Link>
        </div>
      </div>

      {/* Vendor meta */}
      {(vendor?.contact_name || vendor?.contact_phone || vendor?.notes) && (
        <div className="bg-slate-50/50 rounded-lg border border-slate-200 p-5 mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {vendor?.contact_name && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact</p>
              <p className="font-semibold text-slate-800 mt-1">{vendor.contact_name}</p>
            </div>
          )}
          {vendor?.contact_phone && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phone</p>
              <p className="font-semibold text-slate-800 mt-1">{vendor.contact_phone}</p>
            </div>
          )}
          {vendor?.notes && (
            <div className="col-span-2 border-t border-slate-200/60 pt-3 mt-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notes</p>
              <p className="text-slate-600 mt-1.5 leading-relaxed">{vendor.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Requirement Profile assignment */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Compliance Requirements Profile</p>
            {editingProfile ? (
              <div className="mt-2">
                {vendor?.requirement_profile_name && (
                  <p className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">
                    Current:{' '}
                    <span className="text-slate-600 normal-case tracking-normal font-bold">
                      {vendor.requirement_profile_name}
                    </span>
                  </p>
                )}
                <div className="flex items-center gap-2">
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="border border-slate-200 bg-white text-slate-900 rounded-xl px-3.5 py-1.5 text-sm outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500"
                  autoFocus
                >
                  <option value="">— Select requirement profile —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={saveProfile}
                  disabled={updateProfileMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-all duration-150"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save
                </button>
                <button
                  onClick={() => setEditingProfile(false)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-all duration-150"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
                </div>
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-800">
                {vendor?.requirement_profile_name ?? (
                  <span className="text-rose-500/90 font-normal bg-rose-50 border border-rose-100/60 px-2.5 py-0.5 rounded-md text-xs font-semibold">No profile assigned</span>
                )}
              </p>
            )}
          </div>
          {!editingProfile && (
            <button
              onClick={startEditProfile}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold border border-slate-200 bg-white text-slate-600 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              <Pencil className="w-3 h-3" />
              {vendor?.requirement_profile_name ? 'Change profile' : 'Assign profile'}
            </button>
          )}
        </div>
      </div>

      {/* Compliance status */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-4.5 min-w-0">
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-100/60 text-slate-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Compliance status</p>
              {complianceLoading ? (
                <Skeleton className="h-5 w-24 rounded-full" />
              ) : (
                <div>
                  <ComplianceBadge status={compliance?.status ?? 'no_data'} />

                  {/* Action-oriented guidance per status */}
                  {compliance?.status === 'no_data' && !vendor?.requirement_profile && (
                    <p className="mt-2.5 text-xs text-slate-500 leading-relaxed">
                      No compliance profile assigned.{' '}
                      <button
                        onClick={startEditProfile}
                        className="text-brand-600 hover:text-brand-700 font-semibold underline underline-offset-2"
                      >
                        Assign a profile
                      </button>{' '}
                      to enable automated compliance checks.
                    </p>
                  )}
                  {compliance?.status === 'no_data' && vendor?.requirement_profile && (
                    <p className="mt-2.5 text-xs text-slate-500 leading-relaxed">
                      Profile assigned — upload a COI to run the first compliance check.
                    </p>
                  )}
                  {compliance?.status === 'needs_review' && (
                    <p className="mt-2.5 text-xs text-amber-700 leading-relaxed">
                      A certificate is waiting for confirmation. Confirm the extracted coverage to run compliance checks.
                    </p>
                  )}
                  {compliance?.status === 'expired' && (
                    <p className="mt-2.5 text-xs text-rose-700 leading-relaxed">
                      Certificate has expired. Send a renewal reminder to request an updated COI from this vendor.
                    </p>
                  )}

                  {/* Reasons list — gaps_found */}
                  {compliance?.reasons && compliance.reasons.length > 0 && (
                    <ul className="mt-3.5 space-y-2 bg-slate-50/50 border border-slate-200 rounded-xl p-3 max-w-md">
                      {compliance.reasons.map((r, i) => (
                        <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span className="leading-normal">{r}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {compliance?.status === 'gaps_found' && (
                    <p className="mt-2.5 text-xs text-slate-500 leading-relaxed">
                      Request an updated COI from this vendor, or{' '}
                      <button
                        onClick={startEditProfile}
                        className="text-brand-600 hover:text-brand-700 font-semibold underline underline-offset-2"
                      >
                        adjust the requirement profile
                      </button>{' '}
                      if these limits are acceptable.
                    </p>
                  )}

                  {compliance?.checked_at && (
                    <p className="text-[10px] text-slate-400 font-medium mt-2.5">
                      Last evaluated {new Date(compliance.checked_at).toLocaleDateString()} at {new Date(compliance.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Send renewal reminder — two-step confirm */}
          <div className="shrink-0 ml-4">
            {confirmRenewal ? (
              <div className="flex flex-col items-end gap-2 text-right">
                <p className="text-[11px] text-slate-500 leading-relaxed max-w-[180px]">
                  Send renewal email to{' '}
                  <span className="font-bold text-slate-700">{vendor?.contact_email}</span>?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmRenewal(false)}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { sendRenewalMutation.mutate(); setConfirmRenewal(false) }}
                    disabled={sendRenewalMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-all disabled:opacity-50"
                  >
                    {sendRenewalMutation.isPending ? (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRenewal(true)}
                disabled={sendRenewalMutation.isPending || !vendor?.contact_email}
                title={
                  !vendor?.contact_email
                    ? 'Add a contact email to send reminders'
                    : `Send a renewal reminder to ${vendor.contact_email}`
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border border-slate-200 bg-white text-slate-600 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                Send Renewal Email
              </button>
            )}
          </div>
        </div>
      </div>

      {/* COI document history */}
      <div className="card overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="section-heading">Certificates of Insurance</h2>
        </div>

        {docsLoading ? (
          <div>
            {[1, 2].map((i) => (
              <div key={i} className="px-6 py-4.5 flex items-center justify-between border-b border-slate-100 last:border-0">
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
          <div className="py-20 flex flex-col items-center gap-4 text-center px-6 bg-white">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100/60 flex items-center justify-center shadow-sm">
              <FileText className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-base">No certificates found</p>
              <p className="text-sm text-slate-400 max-w-sm mt-1">
                Upload this vendor's Certificate of Insurance to begin tracking compliance limits and dates.
              </p>
            </div>
            <Link
              to={`/vendors/${vendorId}/upload`}
              className="mt-2 btn-primary"
            >
              Upload first COI
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 bg-white">
            {sortedDocs.map((doc) => {
              const { label, cls, dot } = docStatusLabel(doc)
              return (
                <li key={doc.id} className="px-6 py-4.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {doc.insured_name ?? 'Certificate of Insurance'}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className="text-xs text-slate-500 font-medium"
                        title={new Date(doc.created_at).toLocaleDateString()}
                      >
                        Uploaded {uploadedRelative(doc.created_at)}
                      </span>
                      {doc.earliest_expiration && (
                        <span
                          className={`text-xs font-semibold ${
                            isExpired(doc.earliest_expiration)
                              ? 'text-rose-500'
                              : 'text-slate-400'
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
                        className="btn-action animate-pulse"
                      >
                        Review limits
                      </Link>
                    )}
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                      {label}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setConfirmDelete(false)}
          />
          <div className="relative bg-white rounded-lg shadow-premium-lg p-6 max-w-sm w-full border border-slate-200/80 animate-fade-in-up">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Delete vendor profile?</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  This will permanently delete <strong>{vendor?.name}</strong> and all
                  associated compliance evaluations and certificates. This operation cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteVendorMutation.mutate()}
                disabled={deleteVendorMutation.isPending}
                className="flex-1 py-2.5 text-sm font-semibold bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-all"
              >
                {deleteVendorMutation.isPending ? 'Deleting…' : 'Yes, permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
