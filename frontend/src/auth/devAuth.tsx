import { createContext, useContext, useState, type ReactNode } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DevUser {
  sub: string
  email: string
  name: string
  org: string
}

interface DevAuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: DevUser | null
  token: string | null
}

interface DevAuthContextValue extends DevAuthState {
  login: (user: DevUser, token: string) => void
  logout: () => void
}

// ── Storage keys ───────────────────────────────────────────────────────────────

const TOKEN_KEY = 'sened_dev_token'
const USER_KEY  = 'sened_dev_user'

// ── Context ────────────────────────────────────────────────────────────────────

const DevAuthContext = createContext<DevAuthContextValue | null>(null)

export function DevAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DevAuthState>(() => {
    const token    = sessionStorage.getItem(TOKEN_KEY)
    const userJson = sessionStorage.getItem(USER_KEY)
    if (token && userJson) {
      try {
        return { isAuthenticated: true, isLoading: false, user: JSON.parse(userJson), token }
      } catch {
        // corrupted storage — fall through to unauthenticated
      }
    }
    return { isAuthenticated: false, isLoading: false, user: null, token: null }
  })

  function login(user: DevUser, token: string) {
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
    setState({ isAuthenticated: true, isLoading: false, user, token })
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
    setState({ isAuthenticated: false, isLoading: false, user: null, token: null })
  }

  return (
    <DevAuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </DevAuthContext.Provider>
  )
}

export function useDevAuth(): DevAuthContextValue {
  const ctx = useContext(DevAuthContext)
  if (!ctx) throw new Error('useDevAuth must be used inside DevAuthProvider')
  return ctx
}
