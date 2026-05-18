import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentsApi } from '@/api/documents'
import type { COIDocument, ExtractedCoverage } from '@/api/types'
import LoadingSpinner from '@/components/LoadingSpinner'

// ── Status polling ─────────────────────────────────────────────────────────────

function useDocumentStatus(docId: string | null) {
  return useQuery({
    queryKey: ['document', docId],
    queryFn: () => documentsApi.get(docId!),
    enabled: !!docId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Stop polling once terminal status reached
      if (!status || ['extracted', 'confirmed', 'failed'].includes(status)) return false
      return 2000 // poll every 2s while processing
    },
  })
}

// ── Extraction review sub-component ───────────────────────────────────────────

const COVERAGE_LABELS: Record<string, string> = {
  general_liability: 'General Liability',
  automobile: 'Automobile',
  workers_compensation: 'Workers Compensation',
  umbrella: 'Umbrella / Excess',
  other: 'Other',
}

const LIMIT_LABELS: Record<string, string> = {
  each_occurrence: 'Each Occurrence',
  general_aggregate: 'General Aggregate',
  products_aggregate: 'Products-Comp/Op Aggregate',
  personal_advertising_injury: 'Personal & Advertising Injury',
  combined_single_limit: 'Combined Single Limit',
  bodily_injury_per_person: 'Bodily Injury (per person)',
  bodily_injury_per_accident: 'Bodily Injury (per accident)',
  property_damage: 'Property Damage',
  el_each_accident: 'EL Each Accident',
  el_disease_policy_limit: 'EL Disease – Policy Limit',
  el_disease_each_employee: 'EL Disease – Each Employee',
}

function ConfidenceDot({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  const color = value >= 0.85 ? 'bg-green-400' : value >= 0.6 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <span
      title={`Confidence: ${Math.round((value ?? 0) * 100)}%`}
      className={`inline-block w-2 h-2 rounded-full ml-1.5 ${color}`}
    />
  )
}

function CoverageCard({
  coverage,
  edits,
  onChange,
}: {
  coverage: ExtractedCoverage
  edits: Partial<ExtractedCoverage>
  onChange: (field: string, value: unknown) => void
}) {
  const merged = { ...coverage, ...edits }
  const conf = coverage.confidence ?? {}

  return (
    <div className="border border-gray-200 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {COVERAGE_LABELS[merged.coverage_type] ?? merged.coverage_type}
        </h3>
        {merged.expiration_date && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            new Date(merged.expiration_date) < new Date()
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
          }`}>
            {new Date(merged.expiration_date) < new Date() ? 'Expired' : 'Active'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* Carrier */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Carrier <ConfidenceDot value={conf.carrier_name} />
          </label>
          <input
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={merged.carrier_name ?? ''}
            onChange={(e) => onChange('carrier_name', e.target.value || null)}
          />
        </div>

        {/* Policy number */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Policy # <ConfidenceDot value={conf.policy_number} />
          </label>
          <input
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={merged.policy_number ?? ''}
            onChange={(e) => onChange('policy_number', e.target.value || null)}
          />
        </div>

        {/* Effective date */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Effective <ConfidenceDot value={conf.effective_date} />
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={merged.effective_date ?? ''}
            onChange={(e) => onChange('effective_date', e.target.value || null)}
          />
        </div>

        {/* Expiration date */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Expiration <ConfidenceDot value={conf.expiration_date} />
          </label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={merged.expiration_date ?? ''}
            onChange={(e) => onChange('expiration_date', e.target.value || null)}
          />
        </div>

        {/* Additional insured */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Additional Insured <ConfidenceDot value={conf.additional_insured} />
          </label>
          <select
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={merged.additional_insured ?? 'unclear'}
            onChange={(e) => onChange('additional_insured', e.target.value)}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unclear">Unclear</option>
          </select>
        </div>

        {/* Waiver of subrogation */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Waiver of Subrogation <ConfidenceDot value={conf.waiver_of_subrogation} />
          </label>
          <select
            className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={merged.waiver_of_subrogation ?? 'unclear'}
            onChange={(e) => onChange('waiver_of_subrogation', e.target.value)}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unclear">Unclear</option>
          </select>
        </div>
      </div>

      {/* Limits */}
      {merged.limits && Object.keys(merged.limits).some((k) => merged.limits![k] !== null) && (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Limits <ConfidenceDot value={conf.limits} />
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
            {Object.entries(merged.limits)
              .filter(([, v]) => v !== null)
              .map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-500">{LIMIT_LABELS[key] ?? key}</span>
                  <span className="font-medium tabular-nums">
                    ${Number(val).toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Upload page ──────────────────────────────────────────────────────────

export default function UploadPage() {
  const { vendorId } = useParams<{ vendorId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Per-coverage edits: { [coverageId]: { field: newValue } }
  const [coverageEdits, setCoverageEdits] = useState<Record<string, Partial<ExtractedCoverage>>>({})

  // ── Upload mutation ────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: (file: File) => documentsApi.upload(vendorId!, file),
    onSuccess: (doc) => {
      setUploadedDocId(doc.id)
    },
  })

  // ── Status polling ─────────────────────────────────────────────────────────
  const { data: doc } = useDocumentStatus(uploadedDocId)

  // ── Confirm mutation ───────────────────────────────────────────────────────
  const confirmMutation = useMutation({
    mutationFn: () => {
      const coverages = (doc?.coverages ?? []).map((cov) => ({
        id: cov.id,
        ...(coverageEdits[cov.id] ?? {}),
      }))
      return documentsApi.confirm(doc!.id, coverages)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate(`/vendors/${vendorId}`)
    },
  })

  // ── Retry mutation ─────────────────────────────────────────────────────────
  const retryMutation = useMutation({
    mutationFn: () => documentsApi.retry(doc!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', doc!.id] })
    },
  })

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Please upload a PDF file.')
        return
      }
      uploadMutation.mutate(file)
    },
    [uploadMutation],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  // ── Render: upload state ───────────────────────────────────────────────────
  if (!uploadedDocId) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload COI</h1>
        <p className="text-gray-500 text-sm mb-8">
          Upload a Certificate of Insurance PDF. Claude will extract coverage details automatically.
        </p>

        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <LoadingSpinner />
            <p className="text-sm text-gray-500">Uploading…</p>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-brand-400 bg-brand-50'
                : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="text-4xl mb-4">📄</div>
            <p className="text-gray-700 font-medium">Drop a COI PDF here</p>
            <p className="text-gray-400 text-sm mt-1">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>
        )}

        {uploadMutation.isError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Upload failed. Please try again.
          </div>
        )}
      </div>
    )
  }

  // ── Render: processing state ───────────────────────────────────────────────
  if (!doc || doc.status === 'uploaded' || doc.status === 'processing') {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Extracting COI data…</h1>
        <p className="text-gray-500 text-sm mb-8">
          Claude is reading the certificate. This usually takes 10–20 seconds.
        </p>
        <div className="flex items-center gap-3 p-6 bg-blue-50 rounded-xl border border-blue-100">
          <LoadingSpinner />
          <div>
            <p className="font-medium text-blue-900 text-sm">Processing</p>
            <p className="text-blue-600 text-xs mt-0.5">
              {doc?.status === 'processing' ? 'Extracting coverage details…' : 'Preparing document…'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: failed state ───────────────────────────────────────────────────
  if (doc.status === 'failed') {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Extraction failed</h1>
        <p className="text-gray-500 text-sm mb-8">
          Claude couldn't extract data from this document. This can happen with scanned PDFs or
          unusual formats.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {retryMutation.isPending ? 'Retrying…' : 'Retry extraction'}
          </button>
          <button
            onClick={() => { setUploadedDocId(null); uploadMutation.reset() }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Upload different file
          </button>
        </div>
      </div>
    )
  }

  // ── Render: extracted / confirmed — review screen ─────────────────────────
  const isConfirmed = doc.status === 'confirmed'

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isConfirmed ? 'COI Confirmed' : 'Review extracted data'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isConfirmed
              ? 'This certificate has been confirmed and saved.'
              : 'Check the extracted fields below. Edit anything that looks wrong before confirming.'}
          </p>
        </div>
        {!isConfirmed && (
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
          >
            {confirmMutation.isPending ? 'Saving…' : 'Confirm & save'}
          </button>
        )}
      </div>

      {/* COI metadata */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Insured</p>
          <p className="font-medium text-gray-900 mt-0.5">{doc.insured_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Certificate Holder</p>
          <p className="font-medium text-gray-900 mt-0.5">{doc.certificate_holder_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Producer / Agent</p>
          <p className="font-medium text-gray-900 mt-0.5">{doc.producer_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Certificate Date</p>
          <p className="font-medium text-gray-900 mt-0.5">
            {doc.certificate_date
              ? new Date(doc.certificate_date).toLocaleDateString()
              : '—'}
          </p>
        </div>
      </div>

      {/* Confidence legend */}
      {!isConfirmed && (
        <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
          <span>Field confidence:</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> High (≥85%)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Medium</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Low — verify</span>
        </div>
      )}

      {/* Coverage cards */}
      <div className="space-y-4">
        {doc.coverages.map((cov) => (
          <CoverageCard
            key={cov.id}
            coverage={cov}
            edits={coverageEdits[cov.id] ?? {}}
            onChange={(field, value) =>
              setCoverageEdits((prev) => ({
                ...prev,
                [cov.id]: { ...prev[cov.id], [field]: value },
              }))
            }
          />
        ))}
      </div>

      {doc.coverages.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">
          No coverages were extracted from this document.
        </div>
      )}

      {confirmMutation.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Failed to save. Please try again.
        </div>
      )}

      {!isConfirmed && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {confirmMutation.isPending ? 'Saving…' : 'Confirm & save'}
          </button>
        </div>
      )}
    </div>
  )
}
