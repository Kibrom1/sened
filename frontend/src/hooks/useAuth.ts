import { useAuth0 } from '@auth0/auth0-react'
import { useEffect } from 'react'
import { setAuthToken } from '@/api/client'

/**
 * Keeps the Axios client's Authorization header in sync with the Auth0 token.
 * Call this once at the top of your app (inside Layout or App).
 */
export function useAuthToken() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0()

  useEffect(() => {
    if (!isAuthenticated) {
      setAuthToken(null)
      return
    }

    let cancelled = false

    getAccessTokenSilently()
      .then((token) => {
        if (!cancelled) setAuthToken(token)
      })
      .catch(() => {
        if (!cancelled) setAuthToken(null)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, getAccessTokenSilently])
}
