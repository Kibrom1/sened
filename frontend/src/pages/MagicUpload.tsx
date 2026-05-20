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
    <div className="flex items-center gap-2 mb-8">
      <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
        <Shield className="text-white" style={{ width: 18, height: 18 }} />
      </div>
      <span className="font-bold text-gray-900 text-lg">sened</span>
    </div>
  )
}

function PageCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
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
          'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-brand-400 hover:bg-brand-50',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300',
          picked ? 'border-green-400 bg-green-50' : '',
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
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-900 break-all">{picked.name}</p>
            <p className="text-xs text-gray-400">
              {(picked.size / 1024).toFixed(0)} KB · click to change
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
              <Upload className="w-6 h-6 text-brand-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              Drop your PDF here, or <span className="text-brand-600">browse</span>
            </p>
            <p className="text-xs text-gray-400">PDF only · max 20 MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
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
  // Capture ready-state info for post-upload reference
  const readyInfo = useRef<TokenInfo | null>(null)

  // Verify token on mount
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
        <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
          <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
          <p className="text-sm">Verifying your upload link…</p>
        </div>
      </PageCard>
    )
  }

  if (state.phase === 'invalid') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-3 text-center py-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Link not valid</h2>
          <p className="text-sm text-gray-500 max-w-xs">{state.message}</p>
        </div>
      </PageCard>
    )
  }

  if (state.phase === 'responded') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-3 text-center py-4">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-green-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Already uploaded</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            A certificate for <strong>{state.vendor_name}</strong> has already been submitted
            to <strong>{state.org_name}</strong>. No further action is needed.
          </p>
        </div>
      </PageCard>
    )
  }

  if (state.phase === 'success') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-3 text-center py-4">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-green-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Certificate received!</h2>
          <p className="text-sm text-gray-500 max-w-xs">
            Your Certificate of Insurance has been securely submitted to{' '}
            <strong>{state.org_name}</strong> and is being processed. No further action
            is needed.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            You'll be contacted if anything else is required.
          </p>
        </div>
      </PageCard>
    )
  }

  if (state.phase === 'uploading') {
    return (
      <PageCard>
        <BrandHeader />
        <div className="flex flex-col items-center gap-4 py-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          <p className="text-sm font-medium text-gray-700">Uploading your certificate…</p>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-brand-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">{state.progress}%</p>
        </div>
      </PageCard>
    )
  }

  // state.phase === 'ready'
  const { info } = state
  const greeting = info.contact_name ? `Hi ${info.contact_name},` : 'Hello,'

  return (
    <PageCard>
      <BrandHeader />

      <h1 className="text-xl font-bold text-gray-900 mb-2">
        Certificate of Insurance Required
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {greeting} <strong>{info.org_name}</strong> needs an updated Certificate of Insurance
        from <strong>{info.vendor_name}</strong>. Please upload your current COI below —
        no login required.
      </p>

      <div className="mb-5">
        <DropZone onFile={setFile} disabled={false} />
      </div>

      {submitError && (
        <p className="mb-4 text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
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

      <p className="text-xs text-gray-400 text-center mt-4">
        Secured by sened · your file is encrypted in transit and at rest
      </p>
    </PageCard>
  )
}
