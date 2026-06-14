import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { UserPlus, Upload, Users, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { vendorsApi, profilesApi } from '@/api/vendors'
import { documentsApi } from '@/api/documents'
import type { COIDocumentListItem } from '@/api/documents'
import type { Vendor, RequirementProfile } from '@/api/types'
// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className ?? ''}`} />
}

function VendorsTableSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-premium">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-400 text-[10px] uppercase tracking-wider font-semibold bg-slate-50/50">
              <th className="px-6 py-4">Vendor</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Requirement Profile</th>
              <th className="px-6 py-4">COI Status</th>
              <th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 bg-white">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4.5"><Skeleton className="h-4 w-36" /></td>
                <td className="px-6 py-4.5"><Skeleton className="h-4 w-40" /></td>
                <td className="px-6 py-4.5"><Skeleton className="h-4 w-28" /></td>
                <td className="px-6 py-4.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                <td className="px-6 py-4.5"><Skeleton className="h-4 w-16" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExpired(date: string | null) {
  if (!date) return false
  return new Date(date) < new Date()
}

function isExpiringSoon(date: string | null, days = 30) {
  if (!date) return false
  const d = new Date(date)
  const now = new Date()
  return d >= now && d <= new Date(now.getTime() + days * 86_400_000)
}

type DocStatus = 'expired' | 'expiring_soon' | 'active' | 'unconfirmed' | 'processing' | 'missing'

function latestDocStatus(docs: COIDocumentListItem[], vendorId: string): DocStatus {
  const vendorDocs = docs
    .filter((d) => d.vendor === vendorId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (vendorDocs.length === 0) return 'missing'
  const doc = vendorDocs[0]
  if (doc.status === 'processing' || doc.status === 'uploaded') return 'processing'
  if (doc.status === 'extracted') return 'unconfirmed'
  if (isExpired(doc.earliest_expiration)) return 'expired'
  if (isExpiringSoon(doc.earliest_expiration)) return 'expiring_soon'
  return 'active'
}

function VendorStatusPill({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { label: string; cls: string; dot: string }> = {
    expired:       { label: 'Expired',       cls: 'bg-rose-50 text-rose-700 border-rose-100/60', dot: 'bg-rose-500' },
    expiring_soon: { label: 'Expiring soon', cls: 'bg-amber-50 text-amber-700 border-amber-100/60', dot: 'bg-amber-500' },
    active:        { label: 'Active',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-100/60', dot: 'bg-emerald-500' },
    unconfirmed:   { label: 'Pending confirmation', cls: 'bg-indigo-50 text-indigo-700 border-indigo-100/60', dot: 'bg-indigo-500' },
    processing:    { label: 'Processing',    cls: 'bg-slate-50 text-slate-500 border-slate-100/60', dot: 'bg-slate-400 animate-pulse' },
    missing:       { label: 'No COI',        cls: 'bg-rose-50/50 text-rose-500 border-rose-200', dot: 'bg-rose-400' },
  }
  const { label, cls, dot } = map[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

// ── Queries ───────────────────────────────────────────────────────────────────

function useVendors() {
  return useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: vendorsApi.list,
  })
}

function useAllDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => documentsApi.list(),
    staleTime: 30_000,
  })
}

function useProfiles() {
  return useQuery<RequirementProfile[]>({
    queryKey: ['profiles'],
    queryFn: profilesApi.list,
    staleTime: 60_000,
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'contact' | 'profile' | 'status'

const STATUS_SORT_ORDER: Record<DocStatus, number> = {
  expired: 0, missing: 1, expiring_soon: 2, unconfirmed: 3, processing: 4, active: 5,
}

function exportVendorsCsv(rows: { vendor: Vendor; status: DocStatus }[]) {
  const header = ['Vendor', 'Contact email', 'Requirement profile', 'COI status']
  const lines = rows.map(({ vendor: v, status }) => [
    v.name, v.contact_email ?? '', v.requirement_profile_name ?? '', status,
  ])
  const csv = [header, ...lines]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `vendors-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function SortableTh({
  label, sortKey, sort, onSort, className,
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  return (
    <th className={`px-4 py-2.5 ${className ?? ''}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 transition-colors ${
          active ? 'text-slate-700' : ''
        }`}
      >
        {label}
        <span className="text-[10px] leading-none" aria-hidden>
          {active ? (sort.dir === 1 ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  )
}

export default function VendorsPage() {
  const { data: vendors, isLoading } = useVendors()
  const { data: allDocs = [] } = useAllDocuments()
  const { data: profiles = [] } = useProfiles()
  const qc = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  const rows = (vendors ?? [])
    .filter((v) =>
      search
        ? v.name.toLowerCase().includes(search.toLowerCase()) ||
          (v.contact_email ?? '').toLowerCase().includes(search.toLowerCase())
        : true,
    )
    .map((v) => ({ vendor: v, status: latestDocStatus(allDocs, v.id) }))
    .sort((a, b) => {
      const cmp =
        sort.key === 'name' ? a.vendor.name.localeCompare(b.vendor.name)
        : sort.key === 'contact' ? (a.vendor.contact_email ?? '').localeCompare(b.vendor.contact_email ?? '')
        : sort.key === 'profile' ? (a.vendor.requirement_profile_name ?? '').localeCompare(b.vendor.requirement_profile_name ?? '')
        : STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]
      return cmp * sort.dir
    })

  const importMutation = useMutation({
    mutationFn: (file: File) => vendorsApi.import(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      toast.success('Vendors imported successfully')
    },
    onError: () => toast.error('CSV import failed. Required columns: name, contact_email, contact_name, contact_phone'),
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<Vendor>) => vendorsApi.create(data),
    onSuccess: (vendor) => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setShowAddForm(false)
      toast.success(`${vendor.name} added`)
    },
    onError: () => toast.error('Failed to add vendor. Please try again.'),
  })

  if (isLoading) return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
      <VendorsTableSkeleton />
    </div>
  )

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Vendors</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your subcontractors and track their certificates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportVendorsCsv(rows)}
            disabled={rows.length === 0}
            className="btn-secondary"
          >
            Export CSV
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            title="Upload a CSV with columns: name, contact_email, contact_name, contact_phone"
            className="btn-secondary"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importMutation.mutate(file)
            }}
          />
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary"
          >
            <UserPlus className="w-4 h-4" />
            Add Vendor
          </button>
        </div>
      </div>

      {showAddForm && (
        <AddVendorForm
          profiles={profiles}
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowAddForm(false)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Search filter */}
      {vendors && vendors.length > 0 && (
        <div className="mb-6">
          <input
            type="search"
            placeholder="Search vendors by company, contact email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-80 input-premium"
          />
        </div>
      )}

      <div className="card overflow-hidden">
        {!vendors || vendors.length === 0 ? (
          /* ── Empty state ── */
          <div className="py-20 flex flex-col items-center gap-4 text-center px-6 bg-white">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100/60 flex items-center justify-center shadow-sm">
              <Users className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-base">No vendors added yet</p>
              <p className="text-sm text-slate-400 max-w-sm mt-1">
                Add your first subcontractor or upload a CSV vendor roster to get started.
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-2 btn-primary"
            >
              Add your first vendor
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 text-xs font-medium bg-slate-50">
                  <SortableTh label="Vendor" sortKey="name" sort={sort} onSort={handleSort} />
                  <SortableTh label="Contact" sortKey="contact" sort={sort} onSort={handleSort} />
                  <SortableTh label="Requirement profile" sortKey="profile" sort={sort} onSort={handleSort} />
                  <SortableTh label="COI status" sortKey="status" sort={sort} onSort={handleSort} />
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-slate-500">
                      No vendors match "{search}".
                    </td>
                  </tr>
                ) : rows.map(({ vendor: v, status }) => (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/vendors/${v.id}`}
                          className="font-medium text-slate-900 hover:text-brand-600 transition-colors"
                        >
                          {v.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {v.contact_email || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {v.requirement_profile_name ? (
                          <span>{v.requirement_profile_name}</span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-xs font-medium">No profile assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <VendorStatusPill status={status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/vendors/${v.id}/upload`}
                          className="btn-action"
                        >
                          Upload COI
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Add Vendor Form ───────────────────────────────────────────────────────────

function AddVendorForm({
  profiles,
  onSubmit,
  onCancel,
  isLoading,
}: {
  profiles: RequirementProfile[]
  onSubmit: (data: Partial<Vendor>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [form, setForm] = useState({
    name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    requirement_profile: '' as string,
  })
  const [emailError, setEmailError] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const validateEmail = (val: string) => {
    if (!val) return ''
    return val.includes('@') && val.includes('.') ? '' : 'Enter a valid email address'
  }

  const handleSubmit = () => {
    setSubmitAttempted(true)
    const err = validateEmail(form.contact_email)
    if (err) { setEmailError(err); return }
    const payload: Partial<Vendor> = { ...form }
    if (!form.requirement_profile) delete payload.requirement_profile
    onSubmit(payload)
  }

  return (
    <div className="card p-6 mb-8 border border-brand-100 shadow-premium-lg">
      <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-4">Add New Vendor</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* Company Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Company Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input-premium"
            placeholder="Acme Contractors LLC"
          />
        </div>

        {/* Contact Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Contact Name</label>
          <input
            type="text"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            className="input-premium"
            placeholder="Jane Smith"
          />
        </div>

        {/* Contact Email — with validation */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Contact Email
            <span className="ml-1.5 text-[10px] font-medium text-amber-600 normal-case tracking-normal">
              needed for renewal reminders
            </span>
          </label>
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => {
              setForm({ ...form, contact_email: e.target.value })
              if (emailError) setEmailError(validateEmail(e.target.value))
            }}
            onBlur={() => setEmailError(validateEmail(form.contact_email))}
            className={`input-premium ${emailError ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10' : ''}`}
            placeholder="jane@acme.com"
          />
          {emailError && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600 font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {emailError}
            </p>
          )}
          {!form.contact_email && submitAttempted && !emailError && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              No email — renewal reminders won't be sent to this vendor
            </p>
          )}
        </div>

        {/* Contact Phone */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Contact Phone</label>
          <input
            type="tel"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            className="input-premium"
            placeholder="+1 (555) 000-0000"
          />
        </div>

        {/* Requirement Profile */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Requirement Profile
          </label>
          <select
            value={form.requirement_profile}
            onChange={(e) => setForm({ ...form, requirement_profile: e.target.value })}
            className="w-full border border-slate-200 bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          >
            <option value="">— Select a compliance requirement profile —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {profiles.length === 0 && (
            <p className="mt-1.5 text-xs text-slate-400 font-medium">
              No profiles defined yet. Create one under "Requirement Profiles" first.
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={isLoading || !form.name.trim()}
          className="btn-primary"
        >
          {isLoading ? 'Adding…' : 'Add Vendor'}
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  )
}
