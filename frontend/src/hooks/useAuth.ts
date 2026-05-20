import { useEffect } from 'react'
import { setAuthToken } from '@/api/client'
import { useAppAuth } from '@/auth'

/**
 * Keeps the Axios client's Authorization header in sync with the current token.
 * Works in both Auth0 (production) and dev mode (no Auth0 config).
 * Call this once at the top of your app (inside Layout).
 */
export function useAuthToken() {
  const { getAccessToken, isAuthenticated } = useAppAuth()

  useEffect(() => {
    if (!isAuthenticated) {
      setAuthToken(null)
      return
    }

    let cancelled = false

    getAccessToken()
      .then((token) => {
        if (!cancelled) setAuthToken(token)
      })
      .catch(() => {
        if (!cancelled) setAuthToken(null)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, getAccessToken])
}
