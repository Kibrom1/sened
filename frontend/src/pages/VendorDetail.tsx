import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { vendorsApi } from '@/api/vendors'
import { documentsApi } from '@/api/documents'
import type { COIDocumentListItem } from '@/api/documents'
import LoadingSpinner from '@/components/LoadingSpinner'

function isExpired(date: string | null) {
  if (!date) return false
  return new Date(date) < new Date()
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

export default function VendorDetailPage() {
  const { vendorId } = useParams<{ vendorId: string }>()

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

  if (vendorLoading) return <LoadingSpinner />

  const sortedDocs = (docs ?? []).slice().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link to="/vendors" className="text-xs text-gray-400 hover:text-gray-600 mb-1 inline-block">
            ← Vendors
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{vendor?.name}</h1>
          {vendor?.contact_email && (
            <p className="text-gray-500 text-sm mt-0.5">{vendor.contact_email}</p>
          )}
        </div>
        <Link
          to={`/vendors/${vendorId}/upload`}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          Upload COI
        </Link>
      </div>

      {/* Vendor meta */}
      {(vendor?.contact_name || vendor?.contact_phone || vendor?.notes) && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-6 grid grid-cols-2 gap-3 text-sm">
          {vendor.contact_name && (
            <div>
              <p className="text-xs text-gray-500">Contact</p>
              <p className="font-medium text-gray-900 mt-0.5">{vendor.contact_name}</p>
            </div>
          )}
          {vendor.contact_phone && (
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <p className="font-medium text-gray-900 mt-0.5">{vendor.contact_phone}</p>
            </div>
          )}
          {vendor.notes && (
            <div className="col-span-2">
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-gray-700 mt-0.5">{vendor.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* COI document history */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Certificates of Insurance</h2>
        </div>

        {docsLoading ? (
          <div className="py-10 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : sortedDocs.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            No certificates uploaded yet.{' '}
            <Link to={`/vendors/${vendorId}/upload`} className="text-brand-600 hover:underline">
              Upload the first COI
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
                      <span className="text-xs text-gray-400">
                        Uploaded {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                      {doc.earliest_expiration && (
                        <span className={`text-xs ${isExpired(doc.earliest_expiration) ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          {isExpired(doc.earliest_expiration) ? 'Expired' : 'Expires'}{' '}
                          {new Date(doc.earliest_expiration).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-3 shrink-0">
                    {doc.status === 'extracted' && (
                      <Link
                        to={`/vendors/${vendorId}/upload`}
                        className="text-xs text-brand-600 hover:underline font-medium"
                      >
                        Review →
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
