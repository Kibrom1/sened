/**
 * Unified auth hook — works in both production (Auth0) and dev mode (no Auth0 config).
 *
 * Dev mode is active when VITE_AUTH0_DOMAIN is not set.
 * In dev mode the app is wrapped in DevAuthProvider instead of Auth0Provider,
 * so useAuth0() is never called and no network requests go to Auth0.
 */
import { useAuth0 } from '@auth0/auth0-react'
import { useDevAuth } from './devAuth'

export { DevAuthProvider, useDevAuth } from './devAuth'
export type { DevUser } from './devAuth'

export const IS_DEV_MODE = !import.meta.env.VITE_AUTH0_DOMAIN

// ── Shared interface ───────────────────────────────────────────────────────────

export interface AppAuthUser {
  email?: string
  name?: string
}

export interface AppAuth {
  isAuthenticated: boolean
  isLoading: boolean
  error?: Error
  user: AppAuthUser | null
  getAccessToken: () => Promise<string>
  login: () => void
  logout: () => void
}

// ── Production implementation (wraps Auth0) ────────────────────────────────────

function useProductionAuth(): AppAuth {
  const {
    isAuthenticated, isLoading, error, user,
    getAccessTokenSilently, loginWithRedirect, logout,
  } = useAuth0()

  return {
    isAuthenticated,
    isLoading,
    error,
    user: user ? { email: user.email, name: user.name } : null,
    getAccessToken: getAccessTokenSilently,
    login: () => loginWithRedirect(),
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
  }
}

// ── Dev implementation (wraps DevAuthContext) ──────────────────────────────────

function useDevAppAuth(): AppAuth {
  const { isAuthenticated, isLoading, user, token, logout } = useDevAuth()

  return {
    isAuthenticated,
    isLoading,
    user: user ? { email: user.email, name: user.name } : null,
    getAccessToken: () => Promise.resolve(token ?? ''),
    login: () => {
      // Login is handled by the Login page — nothing to do here
    },
    logout,
  }
}

// ── Export the right hook for the current mode ─────────────────────────────────
// IS_DEV_MODE is a build-time constant, so only one branch is ever called.

export const useAppAuth: () => AppAuth = IS_DEV_MODE ? useDevAppAuth : useProductionAuth
