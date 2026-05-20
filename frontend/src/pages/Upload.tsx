import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileText, CheckCircle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
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
      if (!status || ['extracted', 'confirmed', 'failed'].includes(status)) return false
      return 2000
    },
  })
}

// ── Constants ──────────────────────────────────────────────────────────────────

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

const LOW_CONFIDENCE = 0.6
const HIGH_CONFIDENCE = 0.85

// ── Confidence dot ─────────────────────────────────────────────────────────────

function ConfidenceDot({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  const color =
    value >= HIGH_CONFIDENCE
      ? 'bg-green-400'
      : value >= LOW_CONFIDENCE
      ? 'bg-yellow-400'
      : 'bg-red-400'
  const label =
    value >= HIGH_CONFIDENCE ? 'High confidence' : value >= LOW_CONFIDENCE ? 'Medium confidence' : 'Low confidence — verify this field'
  return (
    <span
      title={`${label} (${Math.round(value * 100)}%)`}
      className={`inline-block w-2 h-2 rounded-full ml-1.5 shrink-0 ${color}`}
    />
  )
}

// ── Coverage card ──────────────────────────────────────────────────────────────

function CoverageCard({
  coverage,
  edits,
  onChange,
  touched,
  onTouch,
}: {
  coverage: ExtractedCoverage
  edits: Partial<ExtractedCoverage>
  onChange: (field: string, value: unknown) => void
  touched: Set<string>
  onTouch: (field: string) => void
}) {
  const merged = { ...coverage, ...edits }
  const conf = coverage.confidence ?? {}

  const fieldCls = (fieldKey: string, confValue: number | undefined) => {
    const isLow = confValue !== undefined && confValue < LOW_CONFIDENCE
    const isTouched = touched.has(`${coverage.id}:${fieldKey}`)
    if (isLow && !isTouched)
      return 'border-red-300 ring-1 ring-red-200 focus:ring-red-400'
    return 'border-gray-200 focus:ring-brand-500'
  }

  const markTouched = (fieldKey: string) => onTouch(`${coverage.id}:${fieldKey}`)

  const isExpiredCov =
    merged.expiration_date ? new Date(merged.expiration_date) < new Date() : false

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4 bg-white">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {COVERAGE_LABELS[merged.coverage_type] ?? merged.coverage_type}
        </h3>
        {merged.expiration_date && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              isExpiredCov ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {isExpiredCov ? 'Expired' : 'Active'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {/* Carrier */}
        <div>
          <label className="flex items-center text-xs text-gray-500 mb-1">
            Carrier <ConfidenceDot value={conf.carrier_name} />
          </label>
          <input
            className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors ${fieldCls('carrier_name', conf.carrier_name)}`}
            value={merged.carrier_name ?? ''}
            onChange={(e) => { onChange('carrier_name', e.target.value || null); markTouched('carrier_name') }}
          />
        </div>

        {/* Policy number */}
        <div>
          <label className="flex items-center text-xs text-gray-500 mb-1">
            Policy # <ConfidenceDot value={conf.policy_number} />
          </label>
          <input
            className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors ${fieldCls('policy_number', conf.policy_number)}`}
            value={merged.policy_number ?? ''}
            onChange={(e) => { onChange('policy_number', e.target.value || null); markTouched('policy_number') }}
          />
        </div>

        {/* Effective date */}
        <div>
          <label className="flex items-center text-xs text-gray-500 mb-1">
            Effective <ConfidenceDot value={conf.effective_date} />
          </label>
          <input
            type="date"
            className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors ${fieldCls('effective_date', conf.effective_date)}`}
            value={merged.effective_date ?? ''}
            onChange={(e) => { onChange('effective_date', e.target.value || null); markTouched('effective_date') }}
          />
        </div>

        {/* Expiration date */}
        <div>
          <label className="flex items-center text-xs text-gray-500 mb-1">
            Expiration <ConfidenceDot value={conf.expiration_date} />
          </label>
          <input
            type="date"
            className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors ${fieldCls('expiration_date', conf.expiration_date)}`}
            value={merged.expiration_date ?? ''}
            onChange={(e) => { onChange('expiration_date', e.target.value || null); markTouched('expiration_date') }}
          />
        </div>

        {/* Additional insured */}
        <div>
          <label className="flex items-center text-xs text-gray-500 mb-1">
            Additional Insured <ConfidenceDot value={conf.additional_insured} />
          </label>
          <select
            className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 bg-white transition-colors ${fieldCls('additional_insured', conf.additional_insured)}`}
            value={merged.additional_insured ?? 'unclear'}
            onChange={(e) => { onChange('additional_insured', e.target.value); markTouched('additional_insured') }}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unclear">Unclear</option>
          </select>
        </div>

        {/* Waiver of subrogation */}
        <div>
          <label className="flex items-center text-xs text-gray-500 mb-1">
            Waiver of Subrogation <ConfidenceDot value={conf.waiver_of_subrogation} />
          </label>
          <select
            className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 bg-white transition-colors ${fieldCls('waiver_of_subrogation', conf.waiver_of_subrogation)}`}
            value={merged.waiver_of_subrogation ?? 'unclear'}
            onChange={(e) => { onChange('waiver_of_subrogation', e.target.value); markTouched('waiver_of_subrogation') }}
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
          <p className="flex items-center text-xs text-gray-500 mb-2">
            Limits <ConfidenceDot value={conf.limits} />
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
            {Object.entries(merged.limits)
              .filter(([, v]) => v !== null)
              .map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-500">{LIMIT_LABELS[key] ?? key}</span>
                  <span className="font-medium tabular-nums">${Number(val).toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Low confidence count helper ────────────────────────────────────────────────

function countLowConfidenceFields(
  coverages: ExtractedCoverage[],
  touched: Set<string>,
): number {
  let count = 0
  for (const cov of coverages) {
    const conf = cov.confidence ?? {}
    for (const [field, val] of Object.entries(conf)) {
      if (typeof val === 'number' && val < LOW_CONFIDENCE && !touched.has(`${cov.id}:${field}`)) {
        count++
      }
    }
  }
  return count
}

// ── Sticky confirm bar ─────────────────────────────────────────────────────────

function StickyConfirmBar({
  coverageCount,
  lowConfCount,
  isPending,
  onConfirm,
}: {
  coverageCount: number
  lowConfCount: number
  isPending: boolean
  onConfirm: () => void
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 lg:left-60 z-20 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm text-gray-600 shrink-0">
            {coverageCount} coverage{coverageCount !== 1 ? 's' : ''}
          </span>
          {lowConfCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-0.5 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
              {lowConfCount} field{lowConfCount !== 1 ? 's' : ''} need verification
            </span>
          )}
        </div>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 shrink-0 transition-colors"
        >
          {isPending ? 'Saving…' : 'Confirm & save'}
        </button>
      </div>
    </div>
  )
}

// ── Main Upload page ───────────────────────────────────────────────────────────

export default function UploadPage() {
  const { vendorId } = useParams<{ vendorId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Support pre-loading a specific document via ?docId=
  const preloadDocId = searchParams.get('docId')
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(preloadDocId)
  const [isDragging, setIsDragging] = useState(false)
  const [coverageEdits, setCoverageEdits] = useState<Record<string, Partial<ExtractedCoverage>>>({})
  // Track which low-confidence fields the user has touched
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set())

  // ── Upload mutation ──────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: (file: File) => documentsApi.upload(vendorId!, file),
    onSuccess: (doc) => setUploadedDocId(doc.id),
    onError: () => toast.error('Upload failed. Please try again.'),
  })

  // ── Status polling ───────────────────────────────────────────────────────────
  const { data: doc } = useDocumentStatus(uploadedDocId)

  // ── Confirm mutation ─────────────────────────────────────────────────────────
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
      toast.success('Certificate confirmed and saved')
      navigate(`/vendors/${vendorId}`)
    },
    onError: () => toast.error('Failed to save. Please try again.'),
  })

  // ── Retry mutation ───────────────────────────────────────────────────────────
  const retryMutation = useMutation({
    mutationFn: () => documentsApi.retry(doc!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', doc!.id] })
      toast.info('Retrying extraction…')
    },
    onError: () => toast.error('Retry failed. Please try again.'),
  })

  // ── File handling ────────────────────────────────────────────────────────────
  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast.error('Please upload a PDF file.')
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

  const handleTouch = useCallback((key: string) => {
    setTouchedFields((prev) => new Set(prev).add(key))
  }, [])

  // ── Render: upload state ─────────────────────────────────────────────────────
  if (!uploadedDocId) {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto">
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
            <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-brand-400" />
            </div>
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
      </div>
    )
  }

  // ── Render: processing state ─────────────────────────────────────────────────
  if (!doc || doc.status === 'uploaded' || doc.status === 'processing') {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Extracting COI data…</h1>
        <p className="text-gray-500 text-sm mb-8">
          Claude is reading the certificate. This usually takes 10–20 seconds.
        </p>
        <div className="flex items-center gap-3 p-6 bg-blue-50 rounded-xl border border-blue-100">
          <LoadingSpinner size={5} />
          <div>
            <p className="font-semibold text-blue-900 text-sm">Processing</p>
            <p className="text-blue-600 text-xs mt-0.5">
              {doc?.status === 'processing' ? 'Extracting coverage details…' : 'Preparing document…'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: failed state ─────────────────────────────────────────────────────
  if (doc.status === 'failed') {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Extraction failed</h1>
        <p className="text-gray-500 text-sm mb-8">
          Claude couldn't extract data from this document. This can happen with scanned PDFs or
          unusual formats.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
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

  // ── Render: extracted / confirmed — review screen ────────────────────────────
  const isConfirmed = doc.status === 'confirmed'
  const lowConfCount = isConfirmed
    ? 0
    : countLowConfidenceFields(doc.coverages, touchedFields)

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto pb-24">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isConfirmed ? 'COI Confirmed' : 'Review extracted data'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {isConfirmed
            ? 'This certificate has been confirmed and saved.'
            : 'Check the extracted fields below. Edit anything that looks wrong, then confirm.'}
        </p>
      </div>

      {/* Low confidence warning banner */}
      {!isConfirmed && lowConfCount > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {lowConfCount} field{lowConfCount !== 1 ? 's' : ''} need verification
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Fields highlighted in red have low AI confidence. Review them before confirming.
            </p>
          </div>
        </div>
      )}

      {/* COI metadata */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
        <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-gray-500">
          <span className="font-medium">Field confidence:</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> High (≥85%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Medium
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            <span className="text-red-600 font-medium">Low — verify &amp; correct</span>
          </span>
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
            touched={touchedFields}
            onTouch={handleTouch}
          />
        ))}
      </div>

      {doc.coverages.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">
          No coverages were extracted from this document.
        </div>
      )}

      {/* Confirmed success */}
      {isConfirmed && (
        <div className="mt-6 flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Certificate confirmed and saved successfully.
        </div>
      )}

      {/* Sticky confirm bar */}
      {!isConfirmed && (
        <StickyConfirmBar
          coverageCount={doc.coverages.length}
          lowConfCount={lowConfCount}
          isPending={confirmMutation.isPending}
          onConfirm={() => confirmMutation.mutate()}
        />
      )}
    </div>
  )
}
