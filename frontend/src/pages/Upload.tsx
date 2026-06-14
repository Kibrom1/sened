import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileText, CheckCircle, RotateCcw, ExternalLink, ArrowLeft, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { documentsApi } from '@/api/documents'
import type { COIDocument, ExtractedCoverage } from '@/api/types'
import LoadingSpinner from '@/components/LoadingSpinner'

const NO_TOUCHED: Set<string> = new Set()

// Accepted COI upload types — PDF or image (vendors often photograph a cert).
const ACCEPTED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif']
const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*'

function isAcceptedFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ACCEPTED_EXTENSIONS.includes(ext)
}

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
      ? 'bg-emerald-500'
      : value >= LOW_CONFIDENCE
      ? 'bg-amber-500'
      : 'bg-rose-500'
  const label =
    value >= HIGH_CONFIDENCE ? 'High confidence' : value >= LOW_CONFIDENCE ? 'Medium confidence' : 'Low confidence — verify this field'
  return (
    <span
      title={`${label} (${Math.round(value * 100)}%)`}
      className={`inline-block w-1.5 h-1.5 rounded-full ml-2 shrink-0 ${color}`}
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
      return 'border-rose-200/80 ring-4 ring-rose-500/5 focus:border-rose-400 bg-rose-50/10 text-rose-800'
    return 'border-slate-200 focus:border-brand-500 text-slate-800'
  }

  const markTouched = (fieldKey: string) => onTouch(`${coverage.id}:${fieldKey}`)
  const isExpiredCov = merged.expiration_date ? new Date(merged.expiration_date) < new Date() : false

  return (
    <div className="card p-6 space-y-5 bg-white border border-slate-200/60 shadow-premium">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">
          {COVERAGE_LABELS[merged.coverage_type] ?? merged.coverage_type}
        </h3>
        {merged.expiration_date && (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
              isExpiredCov 
                ? 'bg-rose-50 text-rose-700 border-rose-100/65' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-100/65'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isExpiredCov ? 'bg-rose-500' : 'bg-emerald-500'}`} />
            {isExpiredCov ? 'Expired' : 'Active'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        {/* Carrier */}
        <div>
          <label className="flex items-center text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Carrier <ConfidenceDot value={conf.carrier_name} />
          </label>
          <input
            className={`w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-4 focus:ring-brand-500/10 ${fieldCls('carrier_name', conf.carrier_name)}`}
            value={merged.carrier_name ?? ''}
            onChange={(e) => { onChange('carrier_name', e.target.value || null); markTouched('carrier_name') }}
          />
        </div>

        {/* Policy number */}
        <div>
          <label className="flex items-center text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Policy # <ConfidenceDot value={conf.policy_number} />
          </label>
          <input
            className={`w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-4 focus:ring-brand-500/10 ${fieldCls('policy_number', conf.policy_number)}`}
            value={merged.policy_number ?? ''}
            onChange={(e) => { onChange('policy_number', e.target.value || null); markTouched('policy_number') }}
          />
        </div>

        {/* Effective date */}
        <div>
          <label className="flex items-center text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Effective <ConfidenceDot value={conf.effective_date} />
          </label>
          <input
            type="date"
            className={`w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-4 focus:ring-brand-500/10 ${fieldCls('effective_date', conf.effective_date)}`}
            value={merged.effective_date ?? ''}
            onChange={(e) => { onChange('effective_date', e.target.value || null); markTouched('effective_date') }}
          />
        </div>

        {/* Expiration date */}
        <div>
          <label className="flex items-center text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Expiration <ConfidenceDot value={conf.expiration_date} />
          </label>
          <input
            type="date"
            className={`w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-4 focus:ring-brand-500/10 ${fieldCls('expiration_date', conf.expiration_date)}`}
            value={merged.expiration_date ?? ''}
            onChange={(e) => { onChange('expiration_date', e.target.value || null); markTouched('expiration_date') }}
          />
        </div>

        {/* Additional insured */}
        <div>
          <label className="flex items-center text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Additional Insured <ConfidenceDot value={conf.additional_insured} />
          </label>
          <select
            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all bg-white focus:ring-4 focus:ring-brand-500/10 ${fieldCls('additional_insured', conf.additional_insured)}`}
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
          <label className="flex items-center text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Waiver of Subrogation <ConfidenceDot value={conf.waiver_of_subrogation} />
          </label>
          <select
            className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all bg-white focus:ring-4 focus:ring-brand-500/10 ${fieldCls('waiver_of_subrogation', conf.waiver_of_subrogation)}`}
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
        <div className="border-t border-slate-100 pt-3">
          <p className="flex items-center text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
            Extracted Limits <ConfidenceDot value={conf.limits} />
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-700 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            {Object.entries(merged.limits)
              .filter(([, v]) => v !== null)
              .map(([key, val]) => (
                <div key={key} className="flex justify-between py-0.5 border-b border-slate-100/40 last:border-none">
                  <span className="text-slate-400 font-medium">{LIMIT_LABELS[key] ?? key}</span>
                  <span className="font-semibold text-slate-800 tabular-nums">${Number(val).toLocaleString()}</span>
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
    <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-20 bg-white/80 backdrop-blur-md border-t border-slate-200/80 shadow-premium-lg">
      <div className="max-w-3xl mx-auto px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
            {coverageCount} coverage{coverageCount !== 1 ? 's' : ''} found
          </span>
          {lowConfCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100/60 rounded-full px-3 py-1 shrink-0 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              {lowConfCount} field{lowConfCount !== 1 ? 's' : ''} need review
            </span>
          )}
        </div>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="btn-primary shrink-0"
        >
          {isPending ? 'Saving…' : 'Confirm & Save'}
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

  const preloadDocId = searchParams.get('docId')
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(preloadDocId)
  const [bulkDocIds, setBulkDocIds] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [coverageEdits, setCoverageEdits] = useState<Record<string, Partial<ExtractedCoverage>>>({})
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set())

  // ── Upload mutation (single file) ─────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: (file: File) => documentsApi.upload(vendorId!, file),
    onSuccess: (doc) => setUploadedDocId(doc.id),
    onError: () => toast.error('Upload failed. Please try again.'),
  })

  // ── Bulk upload mutation (multiple files) ─────────────────────────────────────
  const bulkUploadMutation = useMutation({
    mutationFn: (files: File[]) =>
      Promise.all(files.map((f) => documentsApi.upload(vendorId!, f))),
    onSuccess: (docs) => setBulkDocIds(docs.map((d) => d.id)),
    onError: () => toast.error('Some uploads failed. Please try again.'),
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

  // ── File handling (single or bulk) ────────────────────────────────────────────
  const handleFiles = useCallback(
    (fileList: File[]) => {
      const accepted = fileList.filter((f) => isAcceptedFile(f.name))
      if (accepted.length === 0) {
        toast.error('Please upload PDF or image files (PNG, JPG, WEBP, GIF).')
        return
      }
      if (accepted.length < fileList.length) {
        toast.error('Some unsupported files were skipped.')
      }
      if (accepted.length === 1) {
        uploadMutation.mutate(accepted[0])
      } else {
        bulkUploadMutation.mutate(accepted)
      }
    },
    [uploadMutation, bulkUploadMutation],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length) handleFiles(files)
    },
    [handleFiles],
  )

  const handleTouch = useCallback((key: string) => {
    setTouchedFields((prev) => new Set(prev).add(key))
  }, [])

  // ── Render: bulk review (multiple files uploaded) ────────────────────────────
  if (bulkDocIds.length > 0) {
    return (
      <BulkReview
        docIds={bulkDocIds}
        vendorId={vendorId!}
        onUploadMore={() => { setBulkDocIds([]); bulkUploadMutation.reset() }}
      />
    )
  }

  // ── Render: upload state ─────────────────────────────────────────────────────
  if (!uploadedDocId) {
    const isUploading = uploadMutation.isPending || bulkUploadMutation.isPending
    return (
      <div className="px-8 py-8 max-w-2xl mx-auto">
        <Link
          to={`/vendors/${vendorId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 mb-5 uppercase tracking-wider transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to vendor
        </Link>
        <p className="text-slate-500 text-sm mb-8">
          Upload one or more Certificates of Insurance — PDF or image (PNG, JPG, WEBP, GIF).
          Claude extracts coverage details automatically.
        </p>

        {isUploading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <LoadingSpinner />
            <p className="text-sm font-semibold text-slate-400">
              {bulkUploadMutation.isPending
                ? 'Uploading certificates to secure storage…'
                : 'Uploading certificate to secure storage…'}
            </p>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-16 text-center cursor-pointer transition-all duration-300 ${
              isDragging
                ? 'border-brand-500 bg-brand-50/30 scale-[1.01]'
                : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="w-16 h-16 rounded-lg bg-brand-50 border border-brand-100/60 flex items-center justify-center mx-auto mb-5 shadow-sm text-brand-500">
              <FileText className="w-8 h-8" />
            </div>
            <p className="text-slate-800 font-bold">Drag and drop your COI files here</p>
            <p className="text-slate-400 text-xs mt-1.5 font-medium">PDF or image (PNG, JPG, WEBP, GIF) — one or more, up to 10MB each</p>
            <button className="mt-5 btn-secondary inline-flex">Browse local files</button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                if (files.length) handleFiles(files)
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
      <div className="px-8 py-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Extracting coverage limits…</h1>
        <p className="text-slate-500 text-sm mb-8">
          AI is reading policy parameters and matching requirement rules. This usually takes 10–15 seconds.
        </p>
        <div className="flex items-center gap-4.5 p-6 bg-indigo-50/30 rounded-lg border border-indigo-100/60 shadow-sm">
          <LoadingSpinner size={5} />
          <div>
            <p className="font-bold text-indigo-950 text-sm">Processing Document</p>
            <p className="text-indigo-600/90 text-xs mt-0.5 font-medium">
              {doc?.status === 'processing' ? 'Extracting general, auto, WC coverages…' : 'Uploading metadata…'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: failed state ─────────────────────────────────────────────────────
  if (doc.status === 'failed') {
    return (
      <div className="px-8 py-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Extraction failed</h1>
        <p className="text-slate-500 text-sm mb-8">
          AI could not parse coverages from this file. This can happen with low-resolution scans, password-locked documents, or non-COI files.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
            className="flex items-center gap-2 btn-primary"
          >
            <RotateCcw className="w-4 h-4" />
            {retryMutation.isPending ? 'Retrying…' : 'Retry Extraction'}
          </button>
          <button
            onClick={() => { setUploadedDocId(null); uploadMutation.reset() }}
            className="btn-secondary"
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
    <div className="px-8 py-8 max-w-3xl mx-auto pb-28">
      {/* Page header */}
      <Link
        to={`/vendors/${vendorId}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 mb-5 uppercase tracking-wider transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to vendor
      </Link>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isConfirmed ? 'COI Confirmed' : 'Review Extracted Coverage'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isConfirmed
              ? 'This certificate has been confirmed and saved.'
              : 'Verify key limits, effective dates, and policy numbers extracted from this document.'}
          </p>
        </div>
        {doc.file_url && (
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border border-slate-200 bg-white text-slate-600 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View original PDF
          </a>
        )}
      </div>

      {/* Confidence legend — always visible during review so users understand colour coding before seeing fields */}
      {!isConfirmed && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6 px-4 py-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs text-slate-500 font-medium">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] shrink-0">AI Confidence:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" /> High ≥85%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0" /> Medium
          </span>
          <span className="flex items-center gap-1.5 text-rose-600 font-semibold">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-pulse shrink-0" />
            Low — verify against the original PDF
          </span>
        </div>
      )}

      {/* Low confidence warning banner */}
      {!isConfirmed && lowConfCount > 0 && (
        <div className="flex items-start gap-3.5 p-5 bg-amber-50 border border-amber-200/60 rounded-lg mb-8 animate-fade-in-up">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">
              {lowConfCount} field{lowConfCount !== 1 ? 's' : ''} require manual check
            </p>
            <p className="text-xs text-amber-700/90 mt-1 leading-relaxed">
              Fields highlighted in light red have a lower confidence score. Please double-check their values against the original PDF and make edits as necessary.
            </p>
          </div>
        </div>
      )}

      {/* COI metadata */}
      <div className="bg-slate-50/50 rounded-lg border border-slate-200 p-5 mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4.5 text-sm">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Insured Company</p>
          <p className="font-semibold text-slate-800 mt-1">{doc.insured_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Certificate Holder</p>
          <p className="font-semibold text-slate-800 mt-1">{doc.certificate_holder_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Producer / Agent Agency</p>
          <p className="font-semibold text-slate-800 mt-1">{doc.producer_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Certificate Date</p>
          <p className="font-semibold text-slate-800 mt-1">
            {doc.certificate_date
              ? new Date(doc.certificate_date).toLocaleDateString()
              : '—'}
          </p>
        </div>
      </div>

      {/* Coverage cards */}
      <div className="space-y-6">
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
        <div className="card py-16 text-center text-slate-400 text-sm bg-white">
          No coverages were extracted from this document.
        </div>
      )}

      {/* Confirmed success */}
      {isConfirmed && (
        <div className="mt-8 flex items-center gap-3 p-5 bg-emerald-50 border border-emerald-250 rounded-lg text-emerald-800 text-sm font-semibold">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          Certificate limits verified and marked active in compliance list.
        </div>
      )}

      {/* What-happens-next guidance */}
      {!isConfirmed && (
        <div className="mt-8 mb-24 flex items-start gap-3 p-4 bg-slate-50 border border-slate-200/70 rounded-lg text-slate-500 text-xs leading-relaxed">
          <CheckCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            After confirming, this certificate will be locked and automatically evaluated against the
            vendor's requirement profile.{' '}
            <span className="font-semibold text-slate-600">You can re-upload a new version at any time</span>{' '}
            from the vendor page.
          </span>
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

// ── Bulk review (multi-file upload) ──────────────────────────────────────────

type BulkDoc = COIDocument & { file_url: string | null }

const BULK_STATUS_META: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  uploaded:   { label: 'Queued',      cls: 'bg-slate-50 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
  processing: { label: 'Extracting',  cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500 animate-pulse' },
  extracted:  { label: 'Ready',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  confirmed:  { label: 'Confirmed',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  failed:     { label: 'Failed',      cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
}

function BulkReview({
  docIds,
  vendorId,
  onUploadMore,
}: {
  docIds: string[]
  vendorId: string
  onUploadMore: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const results = useQueries({
    queries: docIds.map((id) => ({
      queryKey: ['document', id],
      queryFn: () => documentsApi.get(id),
      refetchInterval: (query: { state: { data?: BulkDoc } }) => {
        const status = query.state.data?.status
        if (!status || ['extracted', 'confirmed', 'failed'].includes(status)) return false
        return 2000
      },
    })),
  })

  const docs = results.map((r) => r.data).filter(Boolean) as BulkDoc[]
  const total = docIds.length
  const isTerminal = (s: string) => ['extracted', 'confirmed', 'failed'].includes(s)
  const extractedCount = docs.filter((d) => isTerminal(d.status)).length
  const confirmedCount = docs.filter((d) => d.status === 'confirmed').length

  const lowConfOf = (d: BulkDoc) => countLowConfidenceFields(d.coverages, NO_TOUCHED)
  const readyIds = docs
    .filter((d) => d.status === 'extracted' && lowConfOf(d) === 0)
    .map((d) => d.id)
  const needsReviewCount = docs.filter((d) => d.status === 'extracted' && lowConfOf(d) > 0).length
  const allDone = docs.length === total && docs.every((d) => d.status === 'confirmed' || d.status === 'failed')

  const batchMutation = useMutation({
    mutationFn: () => documentsApi.confirmBatch(readyIds),
    onSuccess: (res) => {
      res.confirmed.forEach((id) => queryClient.invalidateQueries({ queryKey: ['document', id] }))
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${res.confirmed.length} certificate${res.confirmed.length !== 1 ? 's' : ''} confirmed`)
    },
    onError: () => toast.error('Batch confirm failed. Please try again.'),
  })

  const pct = total > 0 ? Math.round((extractedCount / total) * 100) : 0

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto">
      <Link
        to={`/vendors/${vendorId}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 mb-5 uppercase tracking-wider transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to vendor
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Bulk upload</h1>
      <p className="text-slate-500 text-sm mb-6">
        {extractedCount} of {total} extracted{confirmedCount > 0 ? ` · ${confirmedCount} confirmed` : ''}.
      </p>

      {/* Aggregate progress */}
      <div className="mb-6">
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-brand-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Per-document list */}
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 mb-6">
        {docIds.map((id, i) => {
          const d = docs.find((x) => x.id === id)
          const status = d?.status ?? 'uploaded'
          const meta = BULK_STATUS_META[status] ?? BULK_STATUS_META.uploaded
          const low = d ? lowConfOf(d) : 0
          return (
            <div key={id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {d?.insured_name || `Certificate ${i + 1}`}
                  </p>
                  {status === 'extracted' && low > 0 && (
                    <p className="text-xs text-amber-700">{low} field{low !== 1 ? 's' : ''} need review</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
                {status === 'extracted' && low > 0 && (
                  <Link
                    to={`/vendors/${vendorId}/upload?docId=${id}`}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Review →
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => batchMutation.mutate()}
          disabled={readyIds.length === 0 || batchMutation.isPending}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {batchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Confirm {readyIds.length} high-confidence
        </button>
        {allDone ? (
          <button onClick={() => navigate(`/vendors/${vendorId}`)} className="btn-secondary">
            Done
          </button>
        ) : (
          <button onClick={onUploadMore} className="btn-secondary">
            Upload more
          </button>
        )}
        {extractedCount < total && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            Waiting on {total - extractedCount} more…
          </span>
        )}
      </div>

      {needsReviewCount > 0 && (
        <p className="mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {needsReviewCount} certificate{needsReviewCount !== 1 ? 's' : ''} ha{needsReviewCount !== 1 ? 've' : 's'} low-confidence
          fields and must be reviewed individually before confirming — use the “Review” links above.
        </p>
      )}
    </div>
  )
}
