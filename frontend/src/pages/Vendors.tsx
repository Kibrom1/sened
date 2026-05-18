import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { vendorsApi } from '@/api/vendors'
import type { Vendor } from '@/api/types'
import LoadingSpinner from '@/components/LoadingSpinner'

function useVendors() {
  return useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: vendorsApi.list,
  })
}

export default function VendorsPage() {
  const { data: vendors, isLoading } = useVendors()
  const qc = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const importMutation = useMutation({
    mutationFn: (file: File) => vendorsApi.import(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<Vendor>) => vendorsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setShowAddForm(false)
    },
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <div className="flex gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
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
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Add Vendor
          </button>
        </div>
      </div>

      {showAddForm && (
        <AddVendorForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowAddForm(false)}
          isLoading={createMutation.isPending}
        />
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {!vendors || vendors.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            No vendors yet. Add your first vendor or import a CSV.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Requirement Profile</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link
                      to={`/vendors/${v.id}`}
                      className="font-medium text-gray-900 hover:text-brand-600"
                    >
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {v.contact_email || '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {v.requirement_profile_name || <span className="text-red-400 text-xs">No profile assigned</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      to={`/vendors/${v.id}/upload`}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Upload COI
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AddVendorForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (data: Partial<Vendor>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [form, setForm] = useState({ name: '', contact_name: '', contact_email: '', contact_phone: '' })

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <h3 className="font-semibold text-gray-900 mb-4">Add Vendor</h3>
      <div className="grid grid-cols-2 gap-4">
        {[
          { key: 'name', label: 'Company Name *', type: 'text' },
          { key: 'contact_name', label: 'Contact Name', type: 'text' },
          { key: 'contact_email', label: 'Contact Email', type: 'email' },
          { key: 'contact_phone', label: 'Contact Phone', type: 'tel' },
        ].map(({ key, label, type }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
            <input
              type={type}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => onSubmit(form)}
          disabled={isLoading || !form.name}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {isLoading ? 'Adding...' : 'Add Vendor'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}
