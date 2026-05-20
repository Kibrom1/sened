import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { UserPlus, Upload, Users } from 'lucide-react'
import { toast } from 'sonner'
import { vendorsApi, profilesApi } from '@/api/vendors'
import { documentsApi } from '@/api/documents'
import type { COIDocumentListItem } from '@/api/documents'
import type { Vendor, RequirementProfile } from '@/api/types'
// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
}

function VendorsTableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wider bg-gray-50">
              <th className="px-5 py-3 font-semibold">Vendor</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 font-semibold">Requirement Profile</th>
              <th className="px-5 py-3 font-semibold">COI Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-3.5"><Skeleton className="h-4 w-36" /></td>
                <td className="px-5 py-3.5"><Skeleton className="h-4 w-40" /></td>
                <td className="px-5 py-3.5"><Skeleton className="h-4 w-28" /></td>
                <td className="px-5 py-3.5"><Skeleton className="h-5 w-20 rounded-full" /></td>
                <td className="px-5 py-3.5"><Skeleton className="h-4 w-16" /></td>
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
  const map: Record<DocStatus, { label: string; cls: string }> = {
    expired:       { label: 'Expired',       cls: 'bg-red-100 text-red-700' },
    expiring_soon: { label: 'Expiring soon', cls: 'bg-yellow-100 text-yellow-700' },
    active:        { label: 'Active',        cls: 'bg-green-100 text-green-700' },
    unconfirmed:   { label: 'Needs review',  cls: 'bg-blue-100 text-blue-700' },
    processing:    { label: 'Processing',    cls: 'bg-gray-100 text-gray-500' },
    missing:       { label: 'No COI',        cls: 'bg-red-50 text-red-500 border border-red-200' },
  }
  const { label, cls } = map[status]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
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

export default function VendorsPage() {
  const { data: vendors, isLoading } = useVendors()
  const { data: allDocs = [] } = useAllDocuments()
  const { data: profiles = [] } = useProfiles()
  const qc = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [search, setSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const importMutation = useMutation({
    mutationFn: (file: File) => vendorsApi.import(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      toast.success('Vendors imported successfully')
    },
    onError: () => toast.error('CSV import failed. Please check the file format.'),
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
    <div className="px-6 py-8 max-w-5xl mx-auto">
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
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your subcontractors and track their certificates.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
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
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium"
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
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400"
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!vendors || vendors.length === 0 ? (
          /* ── Empty state ── */
          <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <Users className="w-7 h-7 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-700">No vendors yet</p>
            <p className="text-sm text-gray-400 max-w-xs">
              Add your first subcontractor or import a list via CSV to start tracking their insurance.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-1 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
            >
              Add your first vendor
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wider bg-gray-50">
                  <th className="px-5 py-3 font-semibold">Vendor</th>
                  <th className="px-5 py-3 font-semibold">Contact</th>
                  <th className="px-5 py-3 font-semibold">Requirement Profile</th>
                  <th className="px-5 py-3 font-semibold">COI Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendors
                  .filter((v) =>
                    search
                      ? v.name.toLowerCase().includes(search.toLowerCase()) ||
                        (v.contact_email ?? '').toLowerCase().includes(search.toLowerCase())
                      : true,
                  )
                  .map((v) => {
                  const status = latestDocStatus(allDocs, v.id)
                  return (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/vendors/${v.id}`}
                          className="font-medium text-gray-900 hover:text-brand-600"
                        >
                          {v.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {v.contact_email || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        {v.requirement_profile_name ? (
                          <span className="text-gray-600">{v.requirement_profile_name}</span>
                        ) : (
                          <span className="text-red-400 text-xs font-medium">No profile assigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <VendorStatusPill status={status} />
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/vendors/${v.id}/upload`}
                          className="text-xs text-brand-600 hover:underline font-medium"
                        >
                          Upload COI
                        </Link>
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

  const textFields = [
    { key: 'name',          label: 'Company Name *', type: 'text' },
    { key: 'contact_name',  label: 'Contact Name',   type: 'text' },
    { key: 'contact_email', label: 'Contact Email',  type: 'email' },
    { key: 'contact_phone', label: 'Contact Phone',  type: 'tel' },
  ]

  const handleSubmit = () => {
    const payload: Partial<Vendor> = { ...form }
    if (!form.requirement_profile) delete payload.requirement_profile
    onSubmit(payload)
  }

  return (
    <div className="bg-white rounded-xl border border-brand-300 shadow-sm p-5 mb-6">
      <h3 className="font-semibold text-gray-900 mb-4">Add Vendor</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {textFields.map(({ key, label, type }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
            <input
              type={type}
              value={form[key as keyof typeof form] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Requirement Profile
          </label>
          <select
            value={form.requirement_profile}
            onChange={(e) => setForm({ ...form, requirement_profile: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="">— None —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {profiles.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">
              No profiles yet — create one in Requirement Profiles.
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button
          onClick={handleSubmit}
          disabled={isLoading || !form.name}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
        >
          {isLoading ? 'Adding…' : 'Add Vendor'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
