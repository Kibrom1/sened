import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, CheckCircle } from 'lucide-react'
import { useAppAuth, IS_DEV_MODE, useDevAuth, type DevUser } from '@/auth'
import { apiClient } from '@/api/client'
import LoadingSpinner from '@/components/LoadingSpinner'

// ── Dev-mode login picker ──────────────────────────────────────────────────────

function DevLoginPage() {
  const { login } = useDevAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<DevUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<DevUser[]>('/dev/users/')
      .then((r) => setUsers(r.data))
      .catch(() =>
        setError(
          'No test users found. Run: python manage.py create_test_users',
        ),
      )
      .finally(() => setLoading(false))
  }, [])

  async function handleLogin(sub: string) {
    setLoggingIn(sub)
    try {
      const { data } = await apiClient.post<{ token: string; user: DevUser }>(
        '/dev/login/',
        { sub },
      )
      login(data.user, data.token)
      navigate('/dashboard', { replace: true })
    } catch {
      setError(`Login failed for ${sub}`)
      setLoggingIn(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1 text-center">sened</h1>
        <div className="mb-6 text-center">
          <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            Dev mode — no Auth0
          </span>
        </div>
        <p className="text-sm text-slate-500 mb-5 text-center">
          Pick a test user to log in as:
        </p>

        {loading && (
          <div className="flex justify-center py-6">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-700 font-mono">{error}</p>
          </div>
        )}

        {!loading && users.length === 0 && !error && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-amber-800 font-mono">
              Run: <strong>python manage.py create_test_users</strong>
            </p>
          </div>
        )}

        <div className="space-y-3">
          {users.map((u) => (
            <button
              key={u.sub}
              onClick={() => handleLogin(u.sub)}
              disabled={loggingIn !== null}
              className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{u.name}</p>
                <p className="text-xs text-slate-500">{u.email} · {u.org}</p>
              </div>
              {loggingIn === u.sub ? (
                <LoadingSpinner />
              ) : (
                <span className="text-xs text-brand-600 font-medium">Log in →</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Production login (Auth0) ───────────────────────────────────────────────────

const FEATURES = [
  'Automated COI extraction from any PDF',
  'Instant alerts for expired or expiring coverage',
  'Requirement profiles per vendor type',
  'Magic upload links — no login needed for subcontractors',
]

function ProductionLoginPage() {
  const { login, isAuthenticated, isLoading } = useAppAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  if (isLoading) return <LoadingSpinner fullScreen />

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-card-md border border-slate-200 p-8">
        {/* Brand mark */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-slate-900 tracking-tight">sened</span>
        </div>

        <h1 className="text-lg font-semibold text-slate-900 mb-1">
          Sign in to sened
        </h1>
        <p className="text-slate-500 text-sm mb-6">
          Certificate of insurance tracking and renewal management.
        </p>

        {/* Feature list */}
        <ul className="space-y-2 mb-8">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
              <CheckCircle className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        <button
          onClick={() => login()}
          className="w-full bg-brand-600 text-white py-2.5 px-4 rounded-md font-medium hover:bg-brand-700 transition-colors text-sm"
        >
          Continue
        </button>
        <p className="text-center text-xs text-slate-400 mt-4">
          New here? An account is created automatically on first sign-in.
        </p>
      </div>
    </div>
  )
}

// ── Exported page — picks mode at build time ───────────────────────────────────

export default function LoginPage() {
  return IS_DEV_MODE ? <DevLoginPage /> : <ProductionLoginPage />
}
