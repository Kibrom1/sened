/**
 * MagicUpload — public COI upload page for vendor contacts.
 *
 * Reached via a magic link emailed by the renewal engine, e.g.
 *   https://app.sened.io/magic-upload/<token>
 *
 * No authentication required — the token is the only access control.
 *
 * States:
 *   loading   — verifying token with backend
 *   invalid   — token not found or expired
 *   responded — vendor already uploaded for this request
 *   ready     — awaiting file selection / upload
 *   uploading — POST in flight
 *   success   — document created and extraction queued
 */

import { useCallback, useRef, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { Shield, FileText, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

// Base URL from env — falls back to local dev backend
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api'

interface TokenInfo {
  already_responded: boolean
  vendor_name: string
  contact_name?: string | null
  org_name: string
}

type PageState =
  | { phase: 'loading' }
  | { phase: 'invalid'; message: string }
  | { phase: 'responded'; vendor_name: string; org_name: string }
  | { phase: 'ready'; info: TokenInfo }
  | { phase: 'uploading'; progress: number }
  | { phase: 'success'; vendor_name: string; org_name: string }

// ── API helpers (no auth header) ──────────────────────────────────────────────

async function fetchTokenInfo(token: string): Promise<TokenInfo> {
  const res = await axios.get<TokenInfo>(`${API_BASE}/magic-upload/${token}/`)
  return res.data
}

async function uploadCOI(
  token: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  await axios.post(`${API_BASE}/magic-upload/${token}/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (evt) => {
      if (evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100))
    },
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BrandHeader() {
  return (
    <div className="flex items-center gap-2 mb-8 justify-center">
      <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm text-white">
        <Shield className="w-4 h-4" />
      </div>
      <span className="font-extrabold text-slate-900 text-xl tracking-tight">sened</span>
    </div>
  )
}

function PageCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50/50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-white rounded-lg border border-slate-200/80 shadow-premium-lg p-8">
        {children}
      </div>
    </div>
  )
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

function DropZone({
  onFile,
  disabled,
}: {
  onFile: (f: File) => void
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [picked, setPicked] = useState<File | null>(null)
  const [error, setError] = useState('')

  const handleFile = useCallback(
    (f: File) => {
      setError('')
      if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
        setError('Only PDF files are accepted.')
        return
      }
      if (f.size > 20 * 1024 * 1024) {
        setError('File must be smaller than 20 MB.')
        return
      }
      setPicked(f)
      onFile(f)
    },
    [onFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          dragging ? 'border-brand-500 bg-brand-50/30 scale-[1.01]' : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/50',
          picked ? 'border-emerald-400 bg-emerald-50/30' : '',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />

        {picked ? (
          <div className="flex flex-col items-center gap-3.5">
            <div className="w-14 h-14 rounded-lg bg-emerald-50 border border-emerald-100/60 flex items-center justify-center shadow-sm">
              <FileText className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 break-all px-4">{picked.name}</p>
              <p className="text-[11px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                {(picked.size / 1024).toFixed(0)} KB · Click to change file
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-brand-50 border border-brand-100/60 flex items-center justify-center text-brand-500 shadow-sm">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">
                Drop your COI PDF here, or <span className="text-brand-650 hover:text-brand-700 underline font-extrabold">browse</span>
              </p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-1.5">PDF only · max 20 MB</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2.5 text-xs text-rose-600 flex items-center gap-1.5 font-semibold bg-rose-50 border border-rose-100/60 px-3 py-1.5 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          {error}
        </p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MagicUploadPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [file, setFile] = useState<File | null>(null)
  const [submitError, setSubmitError] = useState('')
  const readyInfo = useRef<TokenInfo | null>(null)

  useEffect(() => {
    if (!token) {
      setState({ phase: 'invalid', message: 'No upload token found in the URL.' })
      return
    }
    fetchTokenInfo(token)
      .then((info) => {
        if (info.already_responded) {
          setState({ phase: 'responded', vendor_name: info.vendor_name, org_name: info.org_name })
        } else {
          readyInfo.current = info
          setState({ phase: 'ready', info })
        }
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          (status === 410
            ? 'This link has expired. Please contact the requester for a new one.'
            : 'This upload link is not valid or has already been used.')
        setState({ phase: 'invalid', message: msg })
      })
  }, [token])

  const handleSubmit = async () => {
    if (!file || !token || !readyInfo.current) return
    setSubmitError('')
    const info = readyInfo.current

    setState({ phase: 'uploading', progress: 0 })
    try {
      await uploadCOI(token, file, (pct) =>
        setState({ phase: 'uploading', progress: pct }),
      )
      setState({ phase: 'success', vendor_name: info.vendor_name, org_name: info.org_name })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Upload failed. Please try again.'
      setSubmitError(msg)
      setState({ phase: 'ready', info })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state.phase === 'loading') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-4 py-10 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-brand-650" />
          <p className="text-sm font-semibold text-slate-400">Verifying secure upload token…</p>
        </div>
      </PageCard>
    )
  }

  if (state.phase === 'invalid') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-3.5 text-center py-4">
          <div className="w-14 h-14 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-sm">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Invalid Link</h2>
          <p className="text-xs font-semibold text-slate-400 max-w-xs mt-1 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">{state.message}</p>
        </div>
      </PageCard>
    )
  }

  if (state.phase === 'responded') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-4 text-center py-4">
          <div className="w-14 h-14 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Already Submitted</h2>
          <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
            A certificate for <strong>{state.vendor_name}</strong> has already been successfully uploaded
            for <strong>{state.org_name}</strong>. No further action is required.
          </p>
        </div>
      </PageCard>
    )
  }

  if (state.phase === 'success') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-4 text-center py-4">
          <div className="w-14 h-14 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
            <CheckCircle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Certificate Received</h2>
          <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
            Your Certificate of Insurance has been securely uploaded to{' '}
            <strong>{state.org_name}</strong> and is being evaluated. This usually takes 1–2 minutes.
          </p>
          <p className="text-xs text-slate-400 font-semibold mt-1 max-w-xs text-center leading-relaxed">
            We will contact you if any coverage limits require review. No further action is needed right now.
          </p>
        </div>
      </PageCard>
    )
  }

  if (state.phase === 'uploading') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-5 py-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm font-bold text-slate-700">Uploading certificate to secure vault…</p>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/50">
            <div
              className="bg-brand-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-xs font-bold text-slate-400">{state.progress}% complete</p>
        </div>
      </PageCard>
    )
  }

  const { info } = state

  return (
    <PageCard>
      <BrandHeader />

      {/* Request context */}
      <div className="mb-6 p-4.5 bg-slate-50 border border-slate-200 rounded-lg text-sm">
        <p className="text-xs text-slate-400 font-medium mb-1">Compliance Requestor</p>
        <p className="font-bold text-slate-800">{info.org_name}</p>
        {info.contact_name && (
          <p className="text-xs text-slate-500 mt-1 font-medium">Hello {info.contact_name},</p>
        )}
      </div>

      <h1 className="text-lg font-bold text-slate-900 mb-2 tracking-tight">
        Submit COI for <span className="text-brand-650">{info.vendor_name}</span>
      </h1>
      <p className="text-xs text-slate-500 mb-6 leading-relaxed">
        Please upload your Certificate of Insurance. <strong>{info.org_name}</strong> will evaluate coverage parameters automatically.
      </p>

      <div className="mb-6">
        <DropZone onFile={setFile} disabled={false} />
      </div>

      {submitError && (
        <p className="mb-4 text-xs text-rose-600 flex items-center gap-1.5 font-semibold bg-rose-50 border border-rose-100/60 p-2.5 rounded-xl">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          {submitError}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Upload className="w-4 h-4" />
        Submit Certificate of Insurance
      </button>

      <p className="text-xs text-slate-400 text-center mt-4">
        Secured by sened · your file is encrypted in transit and at rest
      </p>
    </PageCard>
  )
}
